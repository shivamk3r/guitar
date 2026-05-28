from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import models
from .database import get_db
from .queue import AnalysisQueue, get_analysis_queue
from .schemas import (
    LearnerCreate,
    LearnerOut,
    ProgressOut,
    RecordingConsentCreate,
    RecordingConsentOut,
    RecordingOut,
    SessionHistoryOut,
    SessionClose,
    SessionCreate,
    SessionOut,
)
from .storage import ObjectStorage, get_object_storage

router = APIRouter(prefix="/v1")


@router.post("/learners", response_model=LearnerOut, status_code=status.HTTP_201_CREATED)
def create_or_get_learner(payload: LearnerCreate, db: Session = Depends(get_db)) -> models.Learner:
    existing = db.scalar(select(models.Learner).where(models.Learner.anonymous_id == payload.anonymous_id))
    if existing:
        return existing

    learner = models.Learner(anonymous_id=payload.anonymous_id)
    db.add(learner)
    db.commit()
    db.refresh(learner)
    return learner


@router.post(
    "/consents/recording",
    response_model=RecordingConsentOut,
    status_code=status.HTTP_201_CREATED,
)
def record_consent(
    payload: RecordingConsentCreate,
    db: Session = Depends(get_db),
) -> models.RecordingConsent:
    require_learner(db, payload.learner_id)
    consent = models.RecordingConsent(
        learner_id=payload.learner_id,
        granted=payload.granted,
        policy_version=payload.policy_version,
        source=payload.source,
    )
    db.add(consent)
    db.commit()
    db.refresh(consent)
    return consent


@router.post("/sessions", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
def start_session(payload: SessionCreate, db: Session = Depends(get_db)) -> models.LearningSession:
    require_learner(db, payload.learner_id)
    session = models.LearningSession(
        learner_id=payload.learner_id,
        activity_type=payload.activity_type,
        client_metadata=payload.client_metadata,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.patch("/sessions/{session_id}", response_model=SessionOut)
def close_session(
    session_id: str,
    payload: SessionClose,
    db: Session = Depends(get_db),
) -> models.LearningSession:
    session = require_session(db, session_id)
    session.ended_at = payload.ended_at or datetime.now(timezone.utc)
    if payload.client_metadata:
        session.client_metadata = {**(session.client_metadata or {}), **payload.client_metadata}
    db.commit()
    db.refresh(session)
    return session


@router.post(
    "/sessions/{session_id}/recordings",
    response_model=RecordingOut,
    status_code=status.HTTP_201_CREATED,
)
def upload_recording(
    session_id: str,
    file: UploadFile = File(...),
    captured_at: datetime | None = Form(default=None),
    db: Session = Depends(get_db),
    storage: ObjectStorage = Depends(get_object_storage),
    queue: AnalysisQueue = Depends(get_analysis_queue),
) -> models.AudioRecording:
    session = require_session(db, session_id)
    latest_consent = db.scalar(
        select(models.RecordingConsent)
        .where(models.RecordingConsent.learner_id == session.learner_id)
        .order_by(models.RecordingConsent.created_at.desc()),
    )
    if latest_consent is None or not latest_consent.granted:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="recording consent is required before upload",
        )

    content_type = file.content_type or "application/octet-stream"
    recording = models.AudioRecording(
        session_id=session.id,
        learner_id=session.learner_id,
        object_key="pending",
        bucket=storage.bucket,
        content_type=content_type,
        size_bytes=0,
        captured_at=captured_at or datetime.now(timezone.utc),
    )
    db.add(recording)
    db.flush()

    object_key, size_bytes = storage.put_recording(
        learner_id=session.learner_id,
        session_id=session.id,
        recording_id=recording.id,
        file_obj=file.file,
        content_type=content_type,
    )
    recording.object_key = object_key
    recording.size_bytes = size_bytes

    job = models.AnalysisJob(recording_id=recording.id, status="queued")
    db.add(job)
    db.commit()
    db.refresh(recording)

    queue.enqueue(job.id, recording.id)
    return recording


@router.get("/learners/{learner_id}/history", response_model=list[SessionHistoryOut])
def get_history(learner_id: str, db: Session = Depends(get_db)) -> list[SessionHistoryOut]:
    require_learner(db, learner_id)
    sessions = db.scalars(
        select(models.LearningSession)
        .where(models.LearningSession.learner_id == learner_id)
        .order_by(models.LearningSession.started_at.desc()),
    ).all()
    return [build_history_session(session) for session in sessions]


@router.get("/sessions/{session_id}", response_model=SessionHistoryOut)
def get_session_detail(session_id: str, db: Session = Depends(get_db)) -> SessionHistoryOut:
    return build_history_session(require_session(db, session_id))


@router.get("/recordings/{recording_id}/media")
def get_recording_media(
    recording_id: str,
    db: Session = Depends(get_db),
    storage: ObjectStorage = Depends(get_object_storage),
) -> Response:
    recording = db.get(models.AudioRecording, recording_id)
    if recording is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="recording not found")
    body = storage.get_recording(recording.object_key)
    return Response(
        content=body,
        media_type=recording.content_type,
        headers={
            "Content-Length": str(recording.size_bytes),
            "Cache-Control": "private, max-age=300",
        },
    )


@router.get("/learners/{learner_id}/progress", response_model=ProgressOut)
def get_progress(learner_id: str, db: Session = Depends(get_db)) -> ProgressOut:
    require_learner(db, learner_id)
    recent_sessions = db.scalar(
        select(func.count()).select_from(models.LearningSession).where(models.LearningSession.learner_id == learner_id),
    )
    pending_jobs = db.scalar(
        select(func.count())
        .select_from(models.AnalysisJob)
        .join(models.AudioRecording)
        .where(
            models.AudioRecording.learner_id == learner_id,
            models.AnalysisJob.status.in_(["queued", "running"]),
        ),
    )
    return ProgressOut(
        learner_id=learner_id,
        summary="Progress guidance will use completed recording analyses as the model matures.",
        recent_sessions=recent_sessions or 0,
        pending_analysis_jobs=pending_jobs or 0,
    )


def require_learner(db: Session, learner_id: str) -> models.Learner:
    learner = db.get(models.Learner, learner_id)
    if learner is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="learner not found")
    return learner


def require_session(db: Session, session_id: str) -> models.LearningSession:
    session = db.get(models.LearningSession, session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="session not found")
    return session


def build_history_session(session: models.LearningSession) -> SessionHistoryOut:
    metadata = session.client_metadata or {}
    return SessionHistoryOut(
        id=session.id,
        learner_id=session.learner_id,
        activity_type=session.activity_type,
        started_at=session.started_at,
        ended_at=session.ended_at,
        client_metadata=metadata,
        duration_seconds=duration_seconds(session.started_at, session.ended_at),
        completion_status=str(
            metadata.get("completionStatus") or ("completed" if session.ended_at else "in_progress"),
        ),
        score=extract_score(metadata),
        result_summary=extract_result_summary(metadata),
        recording_available=len(session.recordings) > 0,
        recordings=list(session.recordings),
    )


def duration_seconds(started_at: datetime, ended_at: datetime | None) -> int | None:
    if ended_at is None:
        return None
    return max(0, round((ended_at - started_at).total_seconds()))


def extract_score(metadata: dict) -> float | None:
    candidates = [
        metadata.get("score"),
        metadata.get("averageScore"),
        nested(metadata, "scoreSummary", "averageScore"),
        nested(metadata, "scoreSummary", "lastScore"),
        nested(metadata, "result", "score"),
    ]
    for candidate in candidates:
        if is_number(candidate):
            return float(candidate)
    return None


def extract_result_summary(metadata: dict) -> str | None:
    explicit = metadata.get("resultSummary")
    if isinstance(explicit, str) and explicit:
        return explicit

    tuning = metadata.get("tuningResult")
    if isinstance(tuning, dict):
        tuned = tuning.get("tunedStringCount")
        total = tuning.get("totalStringCount")
        if isinstance(tuned, int) and isinstance(total, int):
            return f"{tuned}/{total} strings in tune"

    score_summary = metadata.get("scoreSummary")
    if isinstance(score_summary, dict):
        average_score = score_summary.get("averageScore")
        attempts = score_summary.get("attempts")
        if is_number(average_score):
            if isinstance(attempts, int):
                return f"{average_score:.1f}/10 average across {attempts} attempts"
            return f"{average_score:.1f}/10 average"

    attempts = metadata.get("attempts")
    if isinstance(attempts, list):
        return f"{len(attempts)} attempts"

    return None


def nested(metadata: dict, parent: str, child: str) -> object:
    value = metadata.get(parent)
    if not isinstance(value, dict):
        return None
    return value.get(child)


def is_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)
