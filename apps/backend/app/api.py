from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models
from .coaching import (
    SEED_SONGS,
    build_practice_plan,
    build_skill_states,
    dashboard,
    pending_job_count,
    recent_session_count,
)
from .database import get_db
from .queue import AnalysisQueue, get_analysis_queue
from .schemas import (
    AnalysisCaptureOut,
    AnalysisDetectorOut,
    AnalysisPredictionOut,
    AnalysisTargetOut,
    AnalysisTopPredictionOut,
    DashboardOut,
    JournalEntryCreate,
    JournalEntryOut,
    LearnerCreate,
    LearnerExportOut,
    LearnerOut,
    LearnerProfileOut,
    LearnerProfileUpdate,
    PracticeAnalysisOut,
    PracticeAttemptAnalysisOut,
    PracticePlanOut,
    PracticeScoreOut,
    ProgressItemOut,
    ProgressItemUpsert,
    ProgressOut,
    RecordingDeleteIn,
    RecordingExportOut,
    RecordingAnalysisOut,
    RecordingAnalysisSummaryOut,
    RecordingConsentCreate,
    RecordingConsentOut,
    RecordingOut,
    RecordingSummaryOut,
    LessonCompleteIn,
    LearningPathOut,
    SessionHistoryOut,
    SessionClose,
    SessionCreate,
    SessionOut,
    SongOut,
    SongProgressUpdate,
    TunerAnalysisOut,
)
from .practice_score import build_practice_score_metrics, practice_score_label
from .storage import ObjectStorage, get_object_storage

router = APIRouter(prefix="/v1")


@router.post("/learners", response_model=LearnerOut, status_code=status.HTTP_201_CREATED)
def create_or_get_learner(payload: LearnerCreate, db: Session = Depends(get_db)) -> models.Learner:
    existing = db.scalar(select(models.Learner).where(models.Learner.anonymous_id == payload.anonymous_id))
    if existing:
        get_or_create_profile(db, existing.id)
        db.commit()
        return existing

    local_learner = db.scalar(
        select(models.Learner).order_by(models.Learner.created_at.asc(), models.Learner.id.asc()).limit(1)
    )
    if local_learner:
        get_or_create_profile(db, local_learner.id)
        db.commit()
        return local_learner

    learner = models.Learner(anonymous_id=payload.anonymous_id)
    db.add(learner)
    db.flush()
    get_or_create_profile(db, learner.id)
    db.commit()
    db.refresh(learner)
    return learner


@router.get("/learners/{learner_id}/profile", response_model=LearnerProfileOut)
def get_profile(learner_id: str, db: Session = Depends(get_db)) -> models.LearnerProfile:
    require_learner(db, learner_id)
    return get_or_create_profile(db, learner_id)


@router.put("/learners/{learner_id}/profile", response_model=LearnerProfileOut)
def update_profile(
    learner_id: str,
    payload: LearnerProfileUpdate,
    db: Session = Depends(get_db),
) -> models.LearnerProfile:
    require_learner(db, learner_id)
    profile = get_or_create_profile(db, learner_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(profile, key, value)
    profile.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(profile)
    return profile


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
    profile = get_or_create_profile(db, payload.learner_id)
    profile.recording_consent_granted = payload.granted
    profile.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(consent)
    return consent


@router.get("/learners/{learner_id}/learning-path", response_model=LearningPathOut)
def get_learning_path(learner_id: str, db: Session = Depends(get_db)) -> LearningPathOut:
    require_learner(db, learner_id)
    profile = get_or_create_profile(db, learner_id)
    skills = build_skill_states(db, learner_id)
    next_skill_ids = [skill["id"] for skill in skills if skill["status"] in {"ready", "review", "in_progress"}][:3]
    return LearningPathOut(
        learner_id=learner_id,
        generated_at=datetime.now(timezone.utc),
        profile=profile,
        skills=skills,
        next_skill_ids=next_skill_ids,
    )


@router.get("/learners/{learner_id}/practice-plan", response_model=PracticePlanOut)
def get_practice_plan(learner_id: str, db: Session = Depends(get_db)) -> PracticePlanOut:
    require_learner(db, learner_id)
    return PracticePlanOut(
        learner_id=learner_id,
        generated_at=datetime.now(timezone.utc),
        options=build_practice_plan(db, learner_id),
    )


@router.get("/learners/{learner_id}/dashboard", response_model=DashboardOut)
def get_dashboard(learner_id: str, db: Session = Depends(get_db)) -> DashboardOut:
    require_learner(db, learner_id)
    return DashboardOut(
        learner_id=learner_id,
        generated_at=datetime.now(timezone.utc),
        **dashboard(db, learner_id),
    )


@router.get("/learners/{learner_id}/export", response_model=LearnerExportOut)
def export_learner_data(learner_id: str, db: Session = Depends(get_db)) -> LearnerExportOut:
    require_learner(db, learner_id)
    profile = get_or_create_profile(db, learner_id)
    progress_items = list(
        db.scalars(
            select(models.LearnerProgressItem)
            .where(models.LearnerProgressItem.learner_id == learner_id)
            .order_by(models.LearnerProgressItem.updated_at.desc())
        )
    )
    sessions = list(
        db.scalars(
            select(models.LearningSession)
            .where(models.LearningSession.learner_id == learner_id)
            .order_by(models.LearningSession.started_at.desc())
        )
    )
    journal_entries = list(
        db.scalars(
            select(models.JournalEntry)
            .where(models.JournalEntry.learner_id == learner_id)
            .order_by(models.JournalEntry.created_at.desc())
        )
    )
    recording_count = len(
        list(
            db.scalars(
                select(models.AudioRecording).where(models.AudioRecording.learner_id == learner_id)
            )
        )
    )
    deleted_recording_count = len(
        list(
            db.scalars(
                select(models.RecordingRetention).where(
                    models.RecordingRetention.learner_id == learner_id,
                    models.RecordingRetention.deleted_at.is_not(None),
                )
            )
        )
    )
    return LearnerExportOut(
        learner_id=learner_id,
        generated_at=datetime.now(timezone.utc),
        profile=profile,
        progress_items=[progress_item_out(item) for item in progress_items],
        sessions=[build_history_session(session, db) for session in sessions],
        journal_entries=journal_entries,
        recording_count=recording_count,
        deleted_recording_count=deleted_recording_count,
    )


@router.post("/learners/{learner_id}/progress-items", response_model=ProgressItemOut)
def upsert_progress(
    learner_id: str,
    payload: ProgressItemUpsert,
    db: Session = Depends(get_db),
) -> ProgressItemOut:
    require_learner(db, learner_id)
    item = upsert_progress_item(db, learner_id, payload)
    db.commit()
    db.refresh(item)
    return progress_item_out(item)


@router.post("/learners/{learner_id}/lessons/{lesson_id}/complete", response_model=ProgressItemOut)
def complete_lesson(
    learner_id: str,
    lesson_id: str,
    payload: LessonCompleteIn,
    db: Session = Depends(get_db),
) -> ProgressItemOut:
    require_learner(db, learner_id)
    item = upsert_progress_item(
        db,
        learner_id,
        ProgressItemUpsert(
            item_type="lesson",
            item_id=lesson_id,
            status="mastered" if (payload.score or 100) >= 85 else "review",
            mastery=payload.score if payload.score is not None else 100,
            attempts=1,
            minutes=payload.minutes,
            best_score=payload.score,
            last_score=payload.score,
            last_practiced_at=datetime.now(timezone.utc),
            metadata={"notes": payload.notes} if payload.notes else {},
        ),
    )
    skill_ids = [
        skill["id"]
        for skill in build_skill_states(db, learner_id)
        if lesson_id in skill["lesson_ids"] and skill["status"] != "mastered"
    ]
    for skill_id in skill_ids:
        upsert_progress_item(
            db,
            learner_id,
            ProgressItemUpsert(
                item_type="skill",
                item_id=skill_id,
                status="in_progress",
                mastery=35,
                attempts=1,
                minutes=payload.minutes,
                last_practiced_at=datetime.now(timezone.utc),
                metadata={"source": "lesson_completion", "lessonId": lesson_id},
            ),
        )
    db.commit()
    db.refresh(item)
    return progress_item_out(item)


@router.get("/learners/{learner_id}/songs", response_model=list[SongOut])
def get_songs(learner_id: str, db: Session = Depends(get_db)) -> list[SongOut]:
    require_learner(db, learner_id)
    return [build_song_out(db, learner_id, song) for song in SEED_SONGS]


@router.patch("/learners/{learner_id}/songs/{song_id}", response_model=ProgressItemOut)
def update_song_progress(
    learner_id: str,
    song_id: str,
    payload: SongProgressUpdate,
    db: Session = Depends(get_db),
) -> ProgressItemOut:
    require_learner(db, learner_id)
    song = next((candidate for candidate in SEED_SONGS if candidate["id"] == song_id), None)
    if song is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="song not found")
    section_by_id = {section["id"]: section for section in song["sections"]}
    unknown_section_ids = [
        section_id for section_id in payload.completed_section_ids if section_id not in section_by_id
    ]
    if unknown_section_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"unknown song section: {unknown_section_ids[0]}",
        )
    completed_section_ids = list(dict.fromkeys(payload.completed_section_ids))
    existing_song_item = db.scalar(
        select(models.LearnerProgressItem).where(
            models.LearnerProgressItem.learner_id == learner_id,
            models.LearnerProgressItem.item_type == "song",
            models.LearnerProgressItem.item_id == song_id,
        )
    )
    existing_section_ids = completed_section_ids_from_metadata(
        existing_song_item.progress_metadata if existing_song_item else {},
    )
    new_section_ids = [
        section_id
        for section_id in completed_section_ids
        if section_id not in existing_section_ids
        and not completed_song_section_exists(db, learner_id, song_id, section_id)
    ]
    now = datetime.now(timezone.utc)
    item = upsert_progress_item(
        db,
        learner_id,
        ProgressItemUpsert(
            item_type="song",
            item_id=song_id,
            status=payload.status,
            mastery=payload.mastery,
            attempts=1 if new_section_ids else 0,
            minutes=payload.minutes if new_section_ids else 0,
            last_practiced_at=now if new_section_ids else None,
            metadata={
                "completedSectionIds": completed_section_ids,
                "lastTempo": payload.last_tempo,
            },
        ),
    )
    section_minutes = round(payload.minutes / len(new_section_ids)) if new_section_ids else 0
    for section_id in new_section_ids:
        section = section_by_id[section_id]
        upsert_progress_item(
            db,
            learner_id,
            ProgressItemUpsert(
                item_type="song-section",
                item_id=song_section_progress_id(song_id, section_id),
                status="mastered",
                mastery=100,
                attempts=1,
                minutes=section_minutes,
                best_score=100,
                last_score=100,
                last_practiced_at=now,
                metadata={
                    "songId": song_id,
                    "songTitle": song["title"],
                    "sectionId": section_id,
                    "sectionName": section["name"],
                    "completedSectionIds": completed_section_ids,
                    "lastTempo": payload.last_tempo,
                    "bars": section["bars"],
                    "chords": section["chords"],
                },
            ),
        )
    db.commit()
    db.refresh(item)
    return progress_item_out(item)


@router.post("/sessions", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
def start_session(payload: SessionCreate, db: Session = Depends(get_db)) -> models.LearningSession:
    require_learner(db, payload.learner_id)
    if payload.id:
        existing = db.get(models.LearningSession, payload.id)
        if existing:
            if existing.learner_id != payload.learner_id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="session id already belongs to another learner",
                )
            return existing
    session_kwargs = {
        "learner_id": payload.learner_id,
        "activity_type": payload.activity_type,
        "client_metadata": payload.client_metadata,
    }
    if payload.id:
        session_kwargs["id"] = payload.id
    if payload.started_at:
        session_kwargs["started_at"] = aware_datetime(payload.started_at)
    session = models.LearningSession(**session_kwargs)
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
    metadata = session.client_metadata or {}
    if payload.client_metadata:
        metadata = {**metadata, **payload.client_metadata}
    session.client_metadata = metadata
    apply_session_progress(db, session)
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
    return [build_history_session(session, db) for session in sessions]


@router.get("/sessions/{session_id}", response_model=SessionHistoryOut)
def get_session_detail(session_id: str, db: Session = Depends(get_db)) -> SessionHistoryOut:
    return build_history_session(require_session(db, session_id), db)


@router.get("/sessions/{session_id}/journal", response_model=list[JournalEntryOut])
def get_session_journal(session_id: str, db: Session = Depends(get_db)) -> list[models.JournalEntry]:
    session = require_session(db, session_id)
    return list(
        db.scalars(
            select(models.JournalEntry)
            .where(
                models.JournalEntry.learner_id == session.learner_id,
                models.JournalEntry.session_id == session.id,
            )
            .order_by(models.JournalEntry.created_at.desc())
        )
    )


@router.post(
    "/sessions/{session_id}/journal",
    response_model=JournalEntryOut,
    status_code=status.HTTP_201_CREATED,
)
def create_session_journal(
    session_id: str,
    payload: JournalEntryCreate,
    db: Session = Depends(get_db),
) -> models.JournalEntry:
    session = require_session(db, session_id)
    if session.learner_id != payload.learner_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="journal learner mismatch")
    entry = models.JournalEntry(
        learner_id=session.learner_id,
        session_id=session.id,
        body=payload.body,
        mood=payload.mood,
        focus=payload.focus,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.get("/recordings/{recording_id}/media")
def get_recording_media(
    recording_id: str,
    db: Session = Depends(get_db),
    storage: ObjectStorage = Depends(get_object_storage),
) -> Response:
    recording = db.get(models.AudioRecording, recording_id)
    if recording is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="recording not found")
    if recording_deleted(db, recording.id):
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="recording has been deleted")
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
    if recording_deleted(db, recording.id):
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="recording has been deleted")
    return build_recording_analysis(recording)


@router.post("/recordings/{recording_id}/export", response_model=RecordingExportOut)
def mark_recording_exported(recording_id: str, db: Session = Depends(get_db)) -> RecordingExportOut:
    recording = db.get(models.AudioRecording, recording_id)
    if recording is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="recording not found")
    retention = get_or_create_recording_retention(db, recording)
    if retention.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="recording has been deleted")
    retention.export_count += 1
    retention.exported_at = datetime.now(timezone.utc)
    retention.updated_at = retention.exported_at
    db.commit()
    db.refresh(retention)
    return RecordingExportOut(
        recording_id=recording.id,
        media_url=f"/v1/recordings/{recording.id}/media",
        export_count=retention.export_count,
        exported_at=retention.exported_at or datetime.now(timezone.utc),
    )


@router.delete("/recordings/{recording_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recording(
    recording_id: str,
    payload: RecordingDeleteIn | None = None,
    db: Session = Depends(get_db),
    storage: ObjectStorage = Depends(get_object_storage),
) -> Response:
    recording = db.get(models.AudioRecording, recording_id)
    if recording is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="recording not found")
    retention = get_or_create_recording_retention(db, recording)
    retention.deleted_at = datetime.now(timezone.utc)
    retention.delete_reason = payload.reason if payload else None
    retention.updated_at = retention.deleted_at
    if hasattr(storage, "delete_recording"):
        storage.delete_recording(recording.object_key)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/learners/{learner_id}/progress", response_model=ProgressOut)
def get_progress(learner_id: str, db: Session = Depends(get_db)) -> ProgressOut:
    require_learner(db, learner_id)
    dash = dashboard(db, learner_id)
    return ProgressOut(
        learner_id=learner_id,
        summary="Local progress guidance combines saved sessions, skill mastery, songs, and consented analyses.",
        recent_sessions=recent_session_count(db, learner_id),
        pending_analysis_jobs=pending_job_count(db, learner_id),
        practice_minutes_30d=dash["practice_minutes_30d"],
        streak_days=dash["streak_days"],
        recommendations=dash["recommendations"],
    )


def get_or_create_profile(db: Session, learner_id: str) -> models.LearnerProfile:
    profile = db.scalar(select(models.LearnerProfile).where(models.LearnerProfile.learner_id == learner_id))
    if profile is not None:
        return profile
    profile = models.LearnerProfile(learner_id=learner_id)
    db.add(profile)
    db.flush()
    return profile


def upsert_progress_item(
    db: Session,
    learner_id: str,
    payload: ProgressItemUpsert,
) -> models.LearnerProgressItem:
    item = db.scalar(
        select(models.LearnerProgressItem).where(
            models.LearnerProgressItem.learner_id == learner_id,
            models.LearnerProgressItem.item_type == payload.item_type,
            models.LearnerProgressItem.item_id == payload.item_id,
        )
    )
    now = datetime.now(timezone.utc)
    if item is None:
        item = models.LearnerProgressItem(
            learner_id=learner_id,
            item_type=payload.item_type,
            item_id=payload.item_id,
        )
        db.add(item)
    item.status = payload.status
    item.mastery = max(item.mastery or 0, payload.mastery)
    item.attempts = (item.attempts or 0) + payload.attempts
    item.minutes = (item.minutes or 0) + payload.minutes
    item.best_score = best_optional(item.best_score, payload.best_score)
    item.last_score = payload.last_score if payload.last_score is not None else item.last_score
    item.bpm_ceiling = max_optional(item.bpm_ceiling, payload.bpm_ceiling)
    item.due_at = payload.due_at if payload.due_at is not None else item.due_at
    item.last_practiced_at = payload.last_practiced_at or item.last_practiced_at or now
    item.progress_metadata = {**(item.progress_metadata or {}), **payload.metadata}
    item.updated_at = now
    return item


def apply_session_progress(db: Session, session: models.LearningSession) -> None:
    metadata = session.client_metadata or {}
    updates: list[ProgressItemUpsert] = []
    if session.activity_type == "tuner":
        updates.extend(tuning_progress_updates(session, metadata))
    elif session.activity_type == "lesson":
        updates.extend(lesson_progress_updates(session, metadata))
    elif session.activity_type in {"ear_training", "fretboard_trainer"}:
        updates.extend(trainer_progress_updates(session, metadata))
    elif session.activity_type == "technique_drill":
        updates.extend(technique_progress_updates(session, metadata))

    attempts = metadata.get("attempts")
    if isinstance(attempts, list) and attempts:
        if session.activity_type == "chord_check":
            updates.extend(
                chord_attempt_progress_updates(
                    session,
                    attempts,
                    metadata,
                    include_transitions=False,
                )
            )
        elif session.activity_type == "practice_drill":
            if string_value(metadata.get("practiceMode")) == "strumming_drill":
                updates.extend(rhythm_progress_updates(session, attempts, metadata))
            else:
                updates.extend(
                    chord_attempt_progress_updates(
                        session,
                        attempts,
                        metadata,
                        include_transitions=True,
                    )
                )

    if not updates:
        return

    minutes = apportioned_session_minutes(session, len(updates))
    for payload in updates:
        payload.minutes = minutes
        upsert_session_progress_item(db, session, payload)


def tuning_progress_updates(session: models.LearningSession, metadata: dict) -> list[ProgressItemUpsert]:
    tuning_result = metadata.get("tuningResult")
    if not isinstance(tuning_result, dict):
        return []
    tuned = int_value(tuning_result.get("tunedStringCount"))
    total = int_value(tuning_result.get("totalStringCount"))
    if tuned is None or total is None or total <= 0:
        return []
    mastery = clamp_percent((tuned / total) * 100)
    return [
        ProgressItemUpsert(
            item_type="skill",
            item_id="setup-tuning",
            status=status_from_percent(mastery),
            mastery=mastery,
            attempts=1,
            best_score=mastery,
            last_score=mastery,
            last_practiced_at=session.ended_at,
            metadata={
                "source": "session_close",
                "sourceSessionId": session.id,
                "activityType": session.activity_type,
                "tuningId": tuning_result.get("tuningId"),
                "tunedStringCount": tuned,
                "totalStringCount": total,
            },
        )
    ]


def lesson_progress_updates(session: models.LearningSession, metadata: dict) -> list[ProgressItemUpsert]:
    lesson_id = string_value(metadata.get("lessonId"))
    if lesson_id is None:
        return []
    score = extract_score(metadata)
    mastery = clamp_percent((score if score is not None else 10) * 10)
    return [
        ProgressItemUpsert(
            item_type="lesson",
            item_id=lesson_id,
            status=status_from_percent(mastery),
            mastery=mastery,
            attempts=1,
            best_score=mastery,
            last_score=mastery,
            last_practiced_at=session.ended_at,
            metadata={
                "source": "session_close",
                "sourceSessionId": session.id,
                "activityType": session.activity_type,
                "lessonTitle": metadata.get("lessonTitle"),
                "lessonArea": metadata.get("lessonArea"),
                "lessonKind": metadata.get("lessonKind"),
            },
        )
    ]


def trainer_progress_updates(session: models.LearningSession, metadata: dict) -> list[ProgressItemUpsert]:
    item_id = string_value(metadata.get("itemId"))
    if item_id is None:
        return []
    item_type = string_value(metadata.get("itemType"))
    if item_type not in {"ear-training", "fretboard"}:
        item_type = "ear-training" if session.activity_type == "ear_training" else "fretboard"
    mastery = clamp_percent(float_value(metadata.get("mastery")) or 0)
    status = string_value(metadata.get("progressStatus"))
    normalized_status = (status or status_from_percent(mastery)).replace("-", "_")
    return [
        ProgressItemUpsert(
            item_type=item_type,
            item_id=item_id,
            status=normalized_status,
            mastery=mastery,
            attempts=1,
            best_score=mastery,
            last_score=mastery,
            last_practiced_at=session.ended_at,
            metadata={
                "source": "session_close",
                "sourceSessionId": session.id,
                "activityType": session.activity_type,
                "trainerKind": metadata.get("trainerKind"),
                "trainerTitle": metadata.get("trainerTitle"),
                "promptId": metadata.get("promptId"),
                "answer": metadata.get("answer"),
                "expected": metadata.get("expected"),
                "correct": metadata.get("correct"),
            },
        )
    ]


def technique_progress_updates(session: models.LearningSession, metadata: dict) -> list[ProgressItemUpsert]:
    item_id = string_value(metadata.get("itemId"))
    if item_id is None:
        return []
    item_type = string_value(metadata.get("itemType")) or "technique"
    if item_type not in {"technique", "scale", "theory"}:
        item_type = "technique"
    score = extract_score(metadata)
    mastery = clamp_percent(float_value(metadata.get("mastery")) or ((score or 0) * 10))
    status = string_value(metadata.get("progressStatus"))
    bpm = int_value(metadata.get("bpm"))
    return [
        ProgressItemUpsert(
            item_type=item_type,
            item_id=item_id,
            status=(status or status_from_percent(mastery)).replace("-", "_"),
            mastery=mastery,
            attempts=1,
            best_score=mastery,
            last_score=mastery,
            bpm_ceiling=bpm if bpm is not None and mastery >= 80 else None,
            last_practiced_at=session.ended_at,
            metadata={
                "source": "session_close",
                "sourceSessionId": session.id,
                "activityType": session.activity_type,
                "targetId": metadata.get("targetId"),
                "targetTitle": metadata.get("targetTitle"),
                "targetArea": metadata.get("targetArea"),
                "skillId": metadata.get("skillId"),
                "lessonId": metadata.get("lessonId"),
                "rating": metadata.get("rating"),
                "notes": metadata.get("notes"),
            },
        )
    ]


def chord_attempt_progress_updates(
    session: models.LearningSession,
    attempts: list,
    metadata: dict,
    *,
    include_transitions: bool,
) -> list[ProgressItemUpsert]:
    chord_scores: dict[str, list[float]] = {}
    transition_scores: dict[str, list[float]] = {}
    previous_chord_id: str | None = None
    for attempt in attempts:
        if not isinstance(attempt, dict):
            continue
        chord_id = attempt_chord_id(attempt)
        score = attempt_score_value(attempt)
        if chord_id is None or score is None:
            continue
        chord_scores.setdefault(chord_id, []).append(score)
        explicit_previous = string_value(attempt.get("previousChordId"))
        transition_from = explicit_previous or previous_chord_id
        if include_transitions and transition_from and transition_from != chord_id:
            transition_scores.setdefault(f"{transition_from}->{chord_id}", []).append(score)
        previous_chord_id = chord_id

    bpm = int_value(metadata.get("bpm"))
    updates = [
        aggregate_progress_update(
            session,
            item_type="chord",
            item_id=chord_id,
            scores=scores,
            bpm=bpm,
            extra_metadata={"practiceMode": metadata.get("practiceMode")},
        )
        for chord_id, scores in chord_scores.items()
    ]
    updates.extend(
        aggregate_progress_update(
            session,
            item_type="transition",
            item_id=transition_id,
            scores=scores,
            bpm=bpm,
            extra_metadata={"practiceMode": metadata.get("practiceMode")},
        )
        for transition_id, scores in transition_scores.items()
    )
    return updates


def rhythm_progress_updates(
    session: models.LearningSession,
    attempts: list,
    metadata: dict,
) -> list[ProgressItemUpsert]:
    scores = attempt_scores(attempts)
    if not scores:
        score = extract_score(metadata)
        scores = [] if score is None else [score]
    if not scores:
        return []
    item_id = string_value(metadata.get("patternId")) or string_value(metadata.get("practiceMode")) or "strumming"
    return [
        aggregate_progress_update(
            session,
            item_type="rhythm",
            item_id=item_id,
            scores=scores,
            bpm=int_value(metadata.get("bpm")),
            extra_metadata={
                "practiceMode": metadata.get("practiceMode"),
                "patternName": metadata.get("patternName"),
            },
        )
    ]


def aggregate_progress_update(
    session: models.LearningSession,
    *,
    item_type: str,
    item_id: str,
    scores: list[float],
    bpm: int | None,
    extra_metadata: dict,
) -> ProgressItemUpsert:
    average_score = sum(scores) / len(scores)
    best_score = max(scores)
    last_score = scores[-1]
    mastery = clamp_percent(average_score * 10)
    return ProgressItemUpsert(
        item_type=item_type,
        item_id=item_id,
        status=status_from_score(average_score),
        mastery=mastery,
        attempts=len(scores),
        best_score=clamp_percent(best_score * 10),
        last_score=clamp_percent(last_score * 10),
        bpm_ceiling=bpm if bpm is not None and average_score >= 8 else None,
        last_practiced_at=session.ended_at,
        metadata={
            "source": "session_close",
            "sourceSessionId": session.id,
            "activityType": session.activity_type,
            "averageScore": average_score,
            **{key: value for key, value in extra_metadata.items() if value is not None},
        },
    )


def upsert_session_progress_item(
    db: Session,
    session: models.LearningSession,
    payload: ProgressItemUpsert,
) -> None:
    existing = db.scalar(
        select(models.LearnerProgressItem).where(
            models.LearnerProgressItem.learner_id == session.learner_id,
            models.LearnerProgressItem.item_type == payload.item_type,
            models.LearnerProgressItem.item_id == payload.item_id,
        )
    )
    if (
        existing is not None
        and (existing.progress_metadata or {}).get("sourceSessionId") == session.id
    ):
        return
    upsert_progress_item(db, session.learner_id, payload)


def attempt_scores(attempts: list) -> list[float]:
    scores: list[float] = []
    for attempt in attempts:
        if not isinstance(attempt, dict):
            continue
        score = attempt_score_value(attempt)
        if score is not None:
            scores.append(score)
    return scores


def attempt_chord_id(attempt: dict) -> str | None:
    return (
        string_value(attempt.get("expectedChordId"))
        or string_value(attempt.get("chordId"))
        or string_value(attempt.get("expectedId"))
    )


def attempt_score_value(attempt: dict) -> float | None:
    direct = float_value(attempt.get("score"))
    if direct is not None:
        return direct
    score = attempt.get("score")
    if isinstance(score, dict):
        return float_value(score.get("score"))
    return None


def apportioned_session_minutes(session: models.LearningSession, item_count: int) -> int:
    duration = duration_seconds(session.started_at, session.ended_at)
    if duration is None or duration <= 0 or item_count <= 0:
        return 0
    return max(0, round((duration / 60) / item_count))


def status_from_score(score: float) -> str:
    return status_from_percent(score * 10)


def status_from_percent(score: float) -> str:
    if score >= 85:
        return "mastered"
    if score >= 60:
        return "in_progress"
    return "review"


def clamp_percent(value: float) -> float:
    return max(0, min(100, value))


def progress_item_out(item: models.LearnerProgressItem) -> ProgressItemOut:
    return ProgressItemOut(
        id=item.id,
        learner_id=item.learner_id,
        item_type=item.item_type,
        item_id=item.item_id,
        status=item.status,
        mastery=item.mastery,
        attempts=item.attempts,
        minutes=item.minutes,
        best_score=item.best_score,
        last_score=item.last_score,
        bpm_ceiling=item.bpm_ceiling,
        due_at=item.due_at,
        last_practiced_at=item.last_practiced_at,
        metadata=item.progress_metadata or {},
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


def build_song_out(db: Session, learner_id: str, song: dict) -> SongOut:
    progress = db.scalar(
        select(models.LearnerProgressItem).where(
            models.LearnerProgressItem.learner_id == learner_id,
            models.LearnerProgressItem.item_type == "song",
            models.LearnerProgressItem.item_id == song["id"],
        )
    )
    return SongOut(
        **song,
        progress=progress_item_out(progress) if progress else None,
    )


def song_section_progress_id(song_id: str, section_id: str) -> str:
    return f"{song_id}:{section_id}"


def completed_section_ids_from_metadata(metadata: dict | None) -> set[str]:
    value = (metadata or {}).get("completedSectionIds")
    if not isinstance(value, list):
        return set()
    return {section_id for section_id in value if isinstance(section_id, str) and section_id}


def completed_song_section_exists(
    db: Session,
    learner_id: str,
    song_id: str,
    section_id: str,
) -> bool:
    item = db.scalar(
        select(models.LearnerProgressItem).where(
            models.LearnerProgressItem.learner_id == learner_id,
            models.LearnerProgressItem.item_type == "song-section",
            models.LearnerProgressItem.item_id == song_section_progress_id(song_id, section_id),
        )
    )
    return item is not None and (item.mastery >= 100 or item.status == "mastered")


def get_or_create_recording_retention(
    db: Session,
    recording: models.AudioRecording,
) -> models.RecordingRetention:
    retention = db.scalar(
        select(models.RecordingRetention).where(models.RecordingRetention.recording_id == recording.id)
    )
    if retention is not None:
        return retention
    retention = models.RecordingRetention(recording_id=recording.id, learner_id=recording.learner_id)
    db.add(retention)
    db.flush()
    return retention


def recording_deleted(db: Session, recording_id: str) -> bool:
    retention = db.scalar(
        select(models.RecordingRetention).where(models.RecordingRetention.recording_id == recording_id)
    )
    return retention is not None and retention.deleted_at is not None


def active_recordings(session: models.LearningSession, db: Session) -> list[models.AudioRecording]:
    if not session.recordings:
        return []
    deleted_ids = {
        retention.recording_id
        for retention in db.scalars(
            select(models.RecordingRetention).where(
                models.RecordingRetention.recording_id.in_([recording.id for recording in session.recordings]),
                models.RecordingRetention.deleted_at.is_not(None),
            )
        )
    }
    return [recording for recording in session.recordings if recording.id not in deleted_ids]


def best_optional(current: float | None, candidate: float | None) -> float | None:
    if candidate is None:
        return current
    if current is None:
        return candidate
    return max(current, candidate)


def max_optional(current: int | None, candidate: int | None) -> int | None:
    if candidate is None:
        return current
    if current is None:
        return candidate
    return max(current, candidate)


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


def build_history_session(session: models.LearningSession, db: Session) -> SessionHistoryOut:
    metadata = session.client_metadata or {}
    recordings = active_recordings(session, db)
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
        recording_available=len(recordings) > 0,
        recordings=[build_recording_summary(recording) for recording in recordings],
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
    tuner = analysis_tuner(metrics)
    return RecordingAnalysisSummaryOut(
        status=job.status,
        result=result,
        guidance=analysis_guidance(metrics, job.result.guidance),
        score=analysis_practice_score(practice) if isinstance(practice, dict) else None,
        tuner_note=tuner.median_note if tuner else None,
        tuner_in_tune_rate=tuner.in_tune_frame_rate if tuner else None,
        tuner_mean_abs_cents=tuner.mean_abs_cents if tuner else None,
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
    tuner = analysis_tuner(metrics)
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
        prediction=None if practice is not None or tuner is not None else analysis_prediction(metrics),
        capture=None if practice is not None else analysis_capture(metrics),
        practice=practice,
        tuner=tuner,
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
    if isinstance(metrics.get("tuner"), dict):
        return "tuning_analyzed"
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


def analysis_tuner(metrics: dict) -> TunerAnalysisOut | None:
    tuner = metrics.get("tuner")
    if not isinstance(tuner, dict):
        return None
    return TunerAnalysisOut(
        tuning_id=string_value(tuner.get("tuningId")),
        tuning_name=string_value(tuner.get("tuningName")),
        frame_count=int_value(tuner.get("frameCount")) or 0,
        voiced_frame_count=int_value(tuner.get("voicedFrameCount")) or 0,
        stable_frame_count=int_value(tuner.get("stableFrameCount")) or 0,
        in_tune_frame_rate=float_value(tuner.get("inTuneFrameRate")) or 0.0,
        median_hz=float_value(tuner.get("medianHz")),
        median_note=string_value(tuner.get("medianNote")),
        median_cents=float_value(tuner.get("medianCents")),
        mean_abs_cents=float_value(tuner.get("meanAbsCents")),
        cents_std_dev=float_value(tuner.get("centsStdDev")),
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
    return max(0, round((aware_datetime(ended_at) - aware_datetime(started_at)).total_seconds()))


def aware_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


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
