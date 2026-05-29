from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import models
from .database import get_db
from .queue import AnalysisQueue, get_analysis_queue
from .schemas import (
    AnalysisCaptureOut,
    AnalysisDetectorOut,
    AnalysisPredictionOut,
    AnalysisTargetOut,
    AnalysisTopPredictionOut,
    LearnerCreate,
    LearnerOut,
    PracticeAnalysisOut,
    PracticeAttemptAnalysisOut,
    PracticeScoreOut,
    ProgressOut,
    RecordingAnalysisOut,
    RecordingAnalysisSummaryOut,
    RecordingConsentCreate,
    RecordingConsentOut,
    RecordingOut,
    RecordingSummaryOut,
    SessionHistoryOut,
    SessionClose,
    SessionCreate,
    SessionOut,
)
from .practice_score import build_practice_score_metrics, practice_score_label
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


@router.get("/recordings/{recording_id}/analysis", response_model=RecordingAnalysisOut)
def get_recording_analysis(recording_id: str, db: Session = Depends(get_db)) -> RecordingAnalysisOut:
    recording = db.get(models.AudioRecording, recording_id)
    if recording is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="recording not found")
    return build_recording_analysis(recording)


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
        recordings=[build_recording_summary(recording) for recording in session.recordings],
    )


def build_recording_summary(recording: models.AudioRecording) -> RecordingSummaryOut:
    return RecordingSummaryOut(
        id=recording.id,
        session_id=recording.session_id,
        content_type=recording.content_type,
        size_bytes=recording.size_bytes,
        captured_at=recording.captured_at,
        created_at=recording.created_at,
        analysis=build_analysis_summary(recording),
    )


def build_analysis_summary(recording: models.AudioRecording) -> RecordingAnalysisSummaryOut:
    job = latest_analysis_job(recording)
    if job is None:
        return RecordingAnalysisSummaryOut(status="not_started")
    if job.result is None:
        return RecordingAnalysisSummaryOut(
            status=job.status,
            target_chord_id=session_chord_id(recording),
            completed_at=job.completed_at,
        )
    metrics = job.result.metrics or {}
    result = analysis_result_label(metrics)
    practice = metrics.get("practice")
    return RecordingAnalysisSummaryOut(
        status=job.status,
        result=result,
        guidance=analysis_guidance(metrics, job.result.guidance),
        score=analysis_practice_score(practice) if isinstance(practice, dict) else None,
        target_chord_id=string_value(metrics.get("expectedChordId")) or session_chord_id(recording),
        predicted_chord_id=string_value(metrics.get("predictedChordId")),
        confidence=float_value(metrics.get("confidence")),
        attempt_count=nested_int(metrics, "practice", "attemptCount"),
        analyzed_attempt_count=nested_int(metrics, "practice", "analyzedAttemptCount"),
        accepted_count=nested_int(metrics, "practice", "acceptedCount"),
        rejected_count=nested_int(metrics, "practice", "rejectedCount"),
        uncertain_count=nested_int(metrics, "practice", "uncertainCount"),
        completed_at=job.completed_at or job.result.created_at,
    )


def build_recording_analysis(recording: models.AudioRecording) -> RecordingAnalysisOut:
    job = latest_analysis_job(recording)
    target = AnalysisTargetOut(chord_id=session_chord_id(recording))
    if job is None:
        return RecordingAnalysisOut(
            status="not_started",
            recording_id=recording.id,
            activity_type=recording.session.activity_type,
            target=target,
            guidance="Analysis has not been queued for this recording.",
        )
    if job.result is None:
        return RecordingAnalysisOut(
            status=job.status,
            recording_id=recording.id,
            activity_type=recording.session.activity_type,
            completed_at=job.completed_at,
            target=target,
            guidance=analysis_status_guidance(job.status),
            error=job.error,
        )

    metrics = job.result.metrics or {}
    practice = analysis_practice(metrics)
    return RecordingAnalysisOut(
        status=job.status,
        recording_id=recording.id,
        activity_type=recording.session.activity_type,
        created_at=job.result.created_at,
        completed_at=job.completed_at or job.result.created_at,
        detector=analysis_detector(metrics),
        target=AnalysisTargetOut(
            chord_id=string_value(metrics.get("expectedChordId")) or session_chord_id(recording),
        ),
        prediction=None if practice is not None else analysis_prediction(metrics),
        capture=None if practice is not None else analysis_capture(metrics),
        practice=practice,
        guidance=analysis_guidance(metrics, job.result.guidance),
        error=job.error,
    )


def latest_analysis_job(recording: models.AudioRecording) -> models.AnalysisJob | None:
    if not recording.analysis_jobs:
        return None
    return max(recording.analysis_jobs, key=lambda job: job.queued_at)


def session_chord_id(recording: models.AudioRecording) -> str | None:
    metadata = recording.session.client_metadata or {}
    return string_value(metadata.get("chordId"))


def analysis_result_label(metrics: dict) -> str | None:
    if metrics.get("analysisSkipped") is True:
        return "skipped"
    verifier_status = string_value(metrics.get("verifierStatus"))
    if verifier_status:
        return verifier_status
    if isinstance(metrics.get("practice"), dict):
        return "analyzed"
    if metrics.get("placeholder") is True:
        return "unavailable"
    return None


def analysis_status_guidance(job_status: str) -> str:
    if job_status == "queued":
        return "Analysis is queued."
    if job_status == "running":
        return "Analysis is running."
    if job_status == "failed":
        return "Analysis failed."
    return "Analysis result is not available yet."


def analysis_guidance(metrics: dict, fallback: str) -> str:
    if (
        metrics.get("placeholder") is True
        and metrics.get("analysisSkipped") is not True
        and metrics.get("activity") == "practice_drill"
    ):
        return (
            "Recording captured. Backend chord feedback was not available for this practice drill result. "
            "New WAV chord practice recordings are analyzed per attempt."
        )
    return fallback


def analysis_detector(metrics: dict) -> AnalysisDetectorOut | None:
    detector = metrics.get("detector")
    if not isinstance(detector, dict):
        return None
    name = string_value(detector.get("detector")) or "unknown"
    return AnalysisDetectorOut(
        name=name,
        model_id=string_value(detector.get("modelId")),
        model_revision=string_value(detector.get("modelRevision")),
        model_filename=string_value(detector.get("modelFilename")),
    )


def analysis_prediction(metrics: dict) -> AnalysisPredictionOut:
    capture = metrics.get("capture")
    top_k = capture.get("topK") if isinstance(capture, dict) else None
    return AnalysisPredictionOut(
        chord_id=string_value(metrics.get("predictedChordId")),
        verifier_status=string_value(metrics.get("verifierStatus")) or analysis_result_label(metrics),
        confidence=float_value(metrics.get("confidence")),
        expected_similarity=float_value(metrics.get("expectedSimilarity")),
        best_alternative_chord_id=string_value(metrics.get("bestAlternativeChordId")),
        alternative_similarity=float_value(metrics.get("alternativeSimilarity")),
        margin=first_float_value(metrics.get("verifierMargin"), metrics.get("margin")),
        top_predictions=analysis_top_predictions(top_k),
    )


def analysis_capture(metrics: dict) -> AnalysisCaptureOut:
    capture = metrics.get("capture")
    if not isinstance(capture, dict):
        return AnalysisCaptureOut(duration_sec=float_value(metrics.get("durationSec")))
    return AnalysisCaptureOut(
        has_signal=bool_value(capture.get("hasSignal")),
        duration_sec=float_value(metrics.get("durationSec")),
        raw_root=string_value(capture.get("rawRoot")),
        raw_quality=string_value(capture.get("rawQuality")),
        root_confidence=float_value(capture.get("rootConfidence")),
        quality_confidence=float_value(capture.get("qualityConfidence")),
        frame_count=int_value(capture.get("chromaFrames")),
        frames_used=int_value(capture.get("chromaFramesUsed")),
        capture_start_sec=float_value(capture.get("captureStartSec")),
        capture_end_sec=float_value(capture.get("captureEndSec")),
    )


def analysis_practice_score(practice: dict, *, attempts_len: int | None = None) -> PracticeScoreOut | None:
    counts = practice_score_counts(practice, attempts_len=attempts_len)
    if counts is None:
        return None

    derived = build_practice_score_metrics(**counts)
    stored = practice.get("score")
    if not isinstance(stored, dict):
        return practice_score_out(derived)

    value = first_float_value(stored.get("value"), derived.get("value")) or 0.0
    return PracticeScoreOut(
        value=value,
        label=string_value(stored.get("label")) or practice_score_label(value),
        analysis_coverage=first_float_value(
            stored.get("analysisCoverage"),
            stored.get("analysis_coverage"),
            derived.get("analysisCoverage"),
        ),
        clarity=first_float_value(stored.get("clarity"), derived.get("clarity")),
        decisive_accuracy=first_float_value(
            stored.get("decisiveAccuracy"),
            stored.get("decisive_accuracy"),
            derived.get("decisiveAccuracy"),
        ),
        accepted_rate=first_float_value(
            stored.get("acceptedRate"),
            stored.get("accepted_rate"),
            derived.get("acceptedRate"),
        ),
        rejected_rate=first_float_value(
            stored.get("rejectedRate"),
            stored.get("rejected_rate"),
            derived.get("rejectedRate"),
        ),
        uncertain_rate=first_float_value(
            stored.get("uncertainRate"),
            stored.get("uncertain_rate"),
            derived.get("uncertainRate"),
        ),
    )


def practice_score_counts(
    practice: dict,
    *,
    attempts_len: int | None = None,
) -> dict[str, int] | None:
    raw_attempts = practice.get("attempts")
    attempt_count = int_value(practice.get("attemptCount"))
    analyzed_attempt_count = int_value(practice.get("analyzedAttemptCount"))
    accepted_count = int_value(practice.get("acceptedCount"))
    rejected_count = int_value(practice.get("rejectedCount"))
    uncertain_count = int_value(practice.get("uncertainCount"))

    if isinstance(raw_attempts, list):
        analyzed_attempt_count = analyzed_attempt_count if analyzed_attempt_count is not None else len(raw_attempts)
        accepted_count = accepted_count if accepted_count is not None else count_verifier_status(raw_attempts, "accepted")
        rejected_count = rejected_count if rejected_count is not None else count_verifier_status(raw_attempts, "rejected")
        uncertain_count = (
            uncertain_count if uncertain_count is not None else count_verifier_status(raw_attempts, "uncertain")
        )

    if attempts_len is not None:
        analyzed_attempt_count = analyzed_attempt_count if analyzed_attempt_count is not None else attempts_len

    if (
        attempt_count is None
        and analyzed_attempt_count is None
        and accepted_count is None
        and rejected_count is None
        and uncertain_count is None
    ):
        return None

    analyzed = analyzed_attempt_count if analyzed_attempt_count is not None else 0
    return {
        "attempt_count": attempt_count if attempt_count is not None else analyzed,
        "analyzed_attempt_count": analyzed,
        "accepted_count": accepted_count if accepted_count is not None else 0,
        "rejected_count": rejected_count if rejected_count is not None else 0,
        "uncertain_count": uncertain_count if uncertain_count is not None else 0,
    }


def count_verifier_status(attempts: list, status: str) -> int:
    return sum(
        1
        for item in attempts
        if isinstance(item, dict) and string_value(item.get("verifierStatus")) == status
    )


def practice_score_out(score: dict[str, float | str | None]) -> PracticeScoreOut:
    value = first_float_value(score.get("value")) or 0.0
    return PracticeScoreOut(
        value=value,
        label=string_value(score.get("label")) or practice_score_label(value),
        analysis_coverage=first_float_value(score.get("analysisCoverage")),
        clarity=first_float_value(score.get("clarity")),
        decisive_accuracy=first_float_value(score.get("decisiveAccuracy")),
        accepted_rate=first_float_value(score.get("acceptedRate")),
        rejected_rate=first_float_value(score.get("rejectedRate")),
        uncertain_rate=first_float_value(score.get("uncertainRate")),
    )


def analysis_practice(metrics: dict) -> PracticeAnalysisOut | None:
    practice = metrics.get("practice")
    if not isinstance(practice, dict):
        return None

    attempts = []
    raw_attempts = practice.get("attempts")
    if isinstance(raw_attempts, list):
        for item in raw_attempts:
            if not isinstance(item, dict):
                continue
            expected_chord_id = string_value(item.get("expectedChordId"))
            verifier_status = string_value(item.get("verifierStatus"))
            capture_start_sec = float_value(item.get("captureStartSec"))
            capture_end_sec = float_value(item.get("captureEndSec"))
            if (
                expected_chord_id is None
                or verifier_status is None
                or capture_start_sec is None
                or capture_end_sec is None
            ):
                continue
            attempts.append(
                PracticeAttemptAnalysisOut(
                    id=string_value(item.get("id")),
                    expected_index=int_value(item.get("expectedIndex")),
                    expected_chord_id=expected_chord_id,
                    frontend_detected_chord_id=string_value(item.get("frontendDetectedChordId")),
                    backend_predicted_chord_id=string_value(item.get("predictedChordId")),
                    verifier_status=verifier_status,
                    confidence=float_value(item.get("confidence")),
                    expected_similarity=float_value(item.get("expectedSimilarity")),
                    best_alternative_chord_id=string_value(item.get("bestAlternativeChordId")),
                    alternative_similarity=float_value(item.get("alternativeSimilarity")),
                    margin=first_float_value(item.get("verifierMargin"), item.get("margin")),
                    frontend_score=float_value(item.get("frontendScore")),
                    detected_at_beat=float_value(item.get("detectedAtBeat")),
                    timing_delta_ms=float_value(item.get("timingDeltaMs")),
                    capture_start_sec=capture_start_sec,
                    capture_end_sec=capture_end_sec,
                    raw_root=string_value(item.get("rawRoot")),
                    raw_quality=string_value(item.get("rawQuality")),
                    frames_used=int_value(item.get("framesUsed")),
                    top_predictions=analysis_top_predictions(item.get("topK")),
                )
            )

    attempt_count = int_value(practice.get("attemptCount"))
    analyzed_attempt_count = int_value(practice.get("analyzedAttemptCount"))
    accepted_count = int_value(practice.get("acceptedCount"))
    rejected_count = int_value(practice.get("rejectedCount"))
    uncertain_count = int_value(practice.get("uncertainCount"))
    skipped_count = int_value(practice.get("skippedCount"))
    return PracticeAnalysisOut(
        mode=string_value(practice.get("mode")),
        bpm=float_value(practice.get("bpm")),
        beats_per_chord=float_value(practice.get("beatsPerChord")),
        count_in_beats=float_value(practice.get("countInBeats")),
        attempt_count=attempt_count if attempt_count is not None else len(attempts),
        analyzed_attempt_count=analyzed_attempt_count if analyzed_attempt_count is not None else len(attempts),
        accepted_count=accepted_count if accepted_count is not None else 0,
        rejected_count=rejected_count if rejected_count is not None else 0,
        uncertain_count=uncertain_count if uncertain_count is not None else 0,
        skipped_count=skipped_count if skipped_count is not None else 0,
        score=analysis_practice_score(practice, attempts_len=len(attempts)),
        average_confidence=float_value(practice.get("averageConfidence")),
        attempts=attempts,
    )


def analysis_top_predictions(value: object) -> list[AnalysisTopPredictionOut]:
    top_predictions = []
    if not isinstance(value, list):
        return top_predictions
    for item in value:
        if not isinstance(item, dict):
            continue
        confidence = float_value(item.get("confidence"))
        if confidence is None:
            continue
        top_predictions.append(
            AnalysisTopPredictionOut(
                chord_id=string_value(item.get("chordId")),
                confidence=confidence,
                root=string_value(item.get("root")),
                quality=string_value(item.get("quality")),
            )
        )
    return top_predictions


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


def nested_int(metadata: dict, parent: str, child: str) -> int | None:
    return int_value(nested(metadata, parent, child))


def string_value(value: object) -> str | None:
    return value if isinstance(value, str) and value else None


def float_value(value: object) -> float | None:
    return float(value) if is_number(value) else None


def first_float_value(*values: object) -> float | None:
    for value in values:
        parsed = float_value(value)
        if parsed is not None:
            return parsed
    return None


def int_value(value: object) -> int | None:
    return int(value) if isinstance(value, int) and not isinstance(value, bool) else None


def bool_value(value: object) -> bool | None:
    return value if isinstance(value, bool) else None


def is_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)
