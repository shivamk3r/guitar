from collections.abc import Generator
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import BinaryIO

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app import models
from app.api import router
from app.database import Base, get_db
from app.queue import get_analysis_queue
from app.storage import get_object_storage, recording_file_extension


class FakeStorage:
    bucket = "test-recordings"

    def __init__(self) -> None:
        self.saved: list[tuple[str, bytes, str]] = []
        self.objects: dict[str, bytes] = {}

    def put_recording(
        self,
        learner_id: str,
        session_id: str,
        recording_id: str,
        file_obj: BinaryIO,
        content_type: str,
    ) -> tuple[str, int]:
        content = file_obj.read()
        extension = recording_file_extension(content_type)
        key = f"learners/{learner_id}/sessions/{session_id}/recordings/{recording_id}.{extension}"
        self.saved.append((key, content, content_type))
        self.objects[key] = content
        return key, len(content)

    def get_recording(self, object_key: str) -> bytes:
        return self.objects[object_key]


class FakeQueue:
    def __init__(self) -> None:
        self.messages: list[tuple[str, str]] = []

    def enqueue(self, job_id: str, recording_id: str) -> None:
        self.messages.append((job_id, recording_id))


def build_client(
    tmp_path: Path,
) -> tuple[TestClient, FakeStorage, FakeQueue, sessionmaker[Session]]:
    engine = create_engine(f"sqlite+pysqlite:///{tmp_path / 'api.db'}")
    Base.metadata.create_all(bind=engine)
    session_local = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)
    storage = FakeStorage()
    queue = FakeQueue()
    app = FastAPI()
    app.include_router(router)

    def override_db() -> Generator[Session, None, None]:
        db = session_local()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_object_storage] = lambda: storage
    app.dependency_overrides[get_analysis_queue] = lambda: queue
    return TestClient(app), storage, queue, session_local


def test_learner_creation_reuses_single_local_account(tmp_path: Path) -> None:
    client, _storage, _queue, session_local = build_client(tmp_path)

    first_response = client.post("/v1/learners", json={"anonymous_id": "anonymous-primary"})
    assert first_response.status_code == 201
    first = first_response.json()

    second_response = client.post("/v1/learners", json={"anonymous_id": "anonymous-new-browser"})
    assert second_response.status_code == 201
    second = second_response.json()

    assert second["id"] == first["id"]
    assert second["anonymous_id"] == "anonymous-primary"

    with session_local() as db:
        assert db.query(models.Learner).count() == 1
        assert db.query(models.LearnerProfile).count() == 1


def test_session_recording_upload_enqueues_analysis(tmp_path: Path) -> None:
    client, storage, queue, _session_local = build_client(tmp_path)

    learner_response = client.post("/v1/learners", json={"anonymous_id": "anonymous-test-learner"})
    assert learner_response.status_code == 201
    learner_id = learner_response.json()["id"]

    repeat_response = client.post("/v1/learners", json={"anonymous_id": "anonymous-test-learner"})
    assert repeat_response.status_code == 201
    assert repeat_response.json()["id"] == learner_id

    consent_response = client.post(
        "/v1/consents/recording",
        json={"learner_id": learner_id, "granted": True, "source": "settings"},
    )
    assert consent_response.status_code == 201

    session_response = client.post(
        "/v1/sessions",
        json={"learner_id": learner_id, "activity_type": "tuner", "client_metadata": {"tuning": "standard"}},
    )
    assert session_response.status_code == 201
    session_id = session_response.json()["id"]

    recording_response = client.post(
        f"/v1/sessions/{session_id}/recordings",
        files={"file": ("clip.webm", b"fake-audio", "audio/webm")},
    )
    assert recording_response.status_code == 201
    recording = recording_response.json()
    assert recording["size_bytes"] == len(b"fake-audio")
    assert storage.saved[0][1] == b"fake-audio"
    assert len(queue.messages) == 1

    progress_response = client.get(f"/v1/learners/{learner_id}/progress")
    assert progress_response.status_code == 200
    assert progress_response.json()["recent_sessions"] == 1
    assert progress_response.json()["pending_analysis_jobs"] == 1

    close_response = client.patch(f"/v1/sessions/{session_id}", json={})
    assert close_response.status_code == 200
    assert close_response.json()["ended_at"] is not None


def test_recording_upload_requires_consent(tmp_path: Path) -> None:
    client, _storage, queue, _session_local = build_client(tmp_path)

    learner = client.post("/v1/learners", json={"anonymous_id": "anonymous-no-consent"}).json()
    session = client.post(
        "/v1/sessions",
        json={"learner_id": learner["id"], "activity_type": "practice_drill"},
    ).json()

    response = client.post(
        f"/v1/sessions/{session['id']}/recordings",
        files={"file": ("clip.webm", b"fake-audio", "audio/webm")},
    )

    assert response.status_code == 403
    assert queue.messages == []


def test_history_includes_unrecorded_session_metadata(tmp_path: Path) -> None:
    client, _storage, _queue, _session_local = build_client(tmp_path)

    learner = client.post("/v1/learners", json={"anonymous_id": "anonymous-history"}).json()
    session_response = client.post(
        "/v1/sessions",
        json={
            "learner_id": learner["id"],
            "activity_type": "chord_check",
            "client_metadata": {"chordId": "G", "chordName": "G"},
        },
    )
    assert session_response.status_code == 201
    session_id = session_response.json()["id"]

    close_response = client.patch(
        f"/v1/sessions/{session_id}",
        json={
            "client_metadata": {
                "completionStatus": "completed",
                "scoreSummary": {"averageScore": 8.25, "attempts": 2},
                "attempts": [
                    {"detectedChordId": "G", "score": 9},
                    {"detectedChordId": "G", "score": 7.5},
                ],
            },
        },
    )
    assert close_response.status_code == 200

    history_response = client.get(f"/v1/learners/{learner['id']}/history")
    assert history_response.status_code == 200
    history = history_response.json()
    assert len(history) == 1
    assert history[0]["id"] == session_id
    assert history[0]["completion_status"] == "completed"
    assert history[0]["duration_seconds"] is not None
    assert history[0]["score"] == 8.25
    assert history[0]["result_summary"] == "8.2/10 average across 2 attempts"
    assert history[0]["recording_available"] is False
    assert history[0]["recordings"] == []
    assert history[0]["client_metadata"]["chordId"] == "G"
    assert history[0]["client_metadata"]["attempts"][0]["score"] == 9

    detail_response = client.get(f"/v1/sessions/{session_id}")
    assert detail_response.status_code == 200
    assert detail_response.json()["client_metadata"]["scoreSummary"]["attempts"] == 2


def test_client_supplied_song_practice_session_id_is_idempotent(tmp_path: Path) -> None:
    client, _storage, _queue, _session_local = build_client(tmp_path)

    learner = client.post("/v1/learners", json={"anonymous_id": "anonymous-song-session"}).json()
    session_id = "11111111-1111-4111-8111-111111111111"
    start_response = client.post(
        "/v1/sessions",
        json={
            "id": session_id,
            "learner_id": learner["id"],
            "activity_type": "song_practice",
            "started_at": "2026-05-30T10:00:00Z",
            "client_metadata": {
                "practiceMode": "song_section_loop",
                "songId": "open-road-study",
                "sectionId": "verse",
                "bpm": 72,
                "chords": ["G", "C", "G", "D"],
                "bars": 8,
            },
        },
    )
    assert start_response.status_code == 201
    assert start_response.json()["id"] == session_id

    repeat_response = client.post(
        "/v1/sessions",
        json={
            "id": session_id,
            "learner_id": learner["id"],
            "activity_type": "song_practice",
            "started_at": "2026-05-30T10:00:00Z",
            "client_metadata": {"bpm": 90},
        },
    )
    assert repeat_response.status_code == 201
    assert repeat_response.json()["client_metadata"]["bpm"] == 72

    close_response = client.patch(
        f"/v1/sessions/{session_id}",
        json={
            "ended_at": "2026-05-30T10:08:00Z",
            "client_metadata": {
                "completionStatus": "completed",
                "resultSummary": "Verse complete at 72 BPM",
                "score": 10,
                "scoreSummary": {"attempts": 1, "averageScore": 10, "bestScore": 10},
                "completedSectionIds": ["verse"],
            },
        },
    )
    assert close_response.status_code == 200

    history_response = client.get(f"/v1/learners/{learner['id']}/history")
    assert history_response.status_code == 200
    history = history_response.json()
    assert history[0]["id"] == session_id
    assert history[0]["activity_type"] == "song_practice"
    assert history[0]["duration_seconds"] == 480
    assert history[0]["completion_status"] == "completed"
    assert history[0]["score"] == 10
    assert history[0]["result_summary"] == "Verse complete at 72 BPM"


def test_lesson_session_close_derives_lesson_progress(tmp_path: Path) -> None:
    client, _storage, _queue, _session_local = build_client(tmp_path)

    learner = client.post("/v1/learners", json={"anonymous_id": "anonymous-lesson-session"}).json()
    session_response = client.post(
        "/v1/sessions",
        json={
            "learner_id": learner["id"],
            "activity_type": "lesson",
            "started_at": "2026-05-30T10:00:00Z",
            "client_metadata": {
                "practiceMode": "lesson_completion",
                "lessonId": "tuning-basics",
                "lessonTitle": "Tuning basics",
                "lessonArea": "Foundations",
                "lessonKind": "concept",
            },
        },
    )
    assert session_response.status_code == 201
    session_id = session_response.json()["id"]

    close_response = client.patch(
        f"/v1/sessions/{session_id}",
        json={
            "ended_at": "2026-05-30T10:05:00Z",
            "client_metadata": {
                "completionStatus": "completed",
                "resultSummary": "Tuning basics completed",
                "score": 10,
                "scoreSummary": {"attempts": 1, "averageScore": 10, "bestScore": 10},
            },
        },
    )
    assert close_response.status_code == 200

    exported = client.get(f"/v1/learners/{learner['id']}/export").json()
    progress = {(item["item_type"], item["item_id"]): item for item in exported["progress_items"]}
    assert progress[("lesson", "tuning-basics")]["status"] == "mastered"
    assert progress[("lesson", "tuning-basics")]["mastery"] == 100
    assert progress[("lesson", "tuning-basics")]["minutes"] == 5
    assert progress[("lesson", "tuning-basics")]["metadata"]["sourceSessionId"] == session_id

    history_response = client.get(f"/v1/learners/{learner['id']}/history")
    assert history_response.status_code == 200
    history = history_response.json()
    assert history[0]["activity_type"] == "lesson"
    assert history[0]["duration_seconds"] == 300
    assert history[0]["score"] == 10
    assert history[0]["result_summary"] == "Tuning basics completed"


def test_trainer_session_close_derives_progress(tmp_path: Path) -> None:
    client, _storage, _queue, _session_local = build_client(tmp_path)

    learner = client.post("/v1/learners", json={"anonymous_id": "anonymous-trainer-session"}).json()
    session_response = client.post(
        "/v1/sessions",
        json={
            "learner_id": learner["id"],
            "activity_type": "ear_training",
            "started_at": "2026-05-30T10:00:00Z",
            "client_metadata": {
                "practiceMode": "ear_training",
                "trainerKind": "ear-training",
                "trainerTitle": "Major/minor quality",
                "itemType": "ear-training",
                "itemId": "major-minor",
                "progressStatus": "in-progress",
                "mastery": 70,
                "promptId": "c-major",
                "answer": "major",
                "expected": "major",
                "correct": True,
            },
        },
    )
    assert session_response.status_code == 201
    session_id = session_response.json()["id"]

    close_response = client.patch(
        f"/v1/sessions/{session_id}",
        json={
            "ended_at": "2026-05-30T10:01:00Z",
            "client_metadata": {
                "completionStatus": "completed",
                "resultSummary": "Major/minor quality: correct",
                "score": 10,
                "scoreSummary": {"attempts": 1, "averageScore": 10, "bestScore": 10},
            },
        },
    )
    assert close_response.status_code == 200

    exported = client.get(f"/v1/learners/{learner['id']}/export").json()
    progress = {(item["item_type"], item["item_id"]): item for item in exported["progress_items"]}
    assert progress[("ear-training", "major-minor")]["status"] == "in_progress"
    assert progress[("ear-training", "major-minor")]["mastery"] == 70
    assert progress[("ear-training", "major-minor")]["minutes"] == 1
    assert progress[("ear-training", "major-minor")]["metadata"]["sourceSessionId"] == session_id
    assert progress[("ear-training", "major-minor")]["metadata"]["correct"] is True

    history_response = client.get(f"/v1/learners/{learner['id']}/history")
    assert history_response.status_code == 200
    history = history_response.json()
    assert history[0]["activity_type"] == "ear_training"
    assert history[0]["duration_seconds"] == 60
    assert history[0]["score"] == 10
    assert history[0]["result_summary"] == "Major/minor quality: correct"


def test_technique_session_close_derives_progress(tmp_path: Path) -> None:
    client, _storage, _queue, _session_local = build_client(tmp_path)

    learner = client.post("/v1/learners", json={"anonymous_id": "anonymous-technique-session"}).json()
    session_response = client.post(
        "/v1/sessions",
        json={
            "learner_id": learner["id"],
            "activity_type": "technique_drill",
            "started_at": "2026-05-30T10:00:00Z",
            "client_metadata": {
                "practiceMode": "technique_practice",
                "targetId": "pentatonic-box",
                "targetTitle": "A minor pentatonic box",
                "targetArea": "Lead",
                "itemType": "scale",
                "itemId": "A-minor-pentatonic",
                "skillId": "pentatonic-scale",
                "lessonId": "pentatonic-scale",
                "bpm": 72,
                "rating": 8.5,
                "mastery": 85,
                "progressStatus": "mastered",
                "notes": "Even on string pairs.",
            },
        },
    )
    assert session_response.status_code == 201
    session_id = session_response.json()["id"]

    close_response = client.patch(
        f"/v1/sessions/{session_id}",
        json={
            "ended_at": "2026-05-30T10:08:00Z",
            "client_metadata": {
                "completionStatus": "completed",
                "resultSummary": "A minor pentatonic box: 8.5/10",
                "score": 8.5,
                "scoreSummary": {"attempts": 1, "averageScore": 8.5, "bestScore": 8.5},
            },
        },
    )
    assert close_response.status_code == 200

    exported = client.get(f"/v1/learners/{learner['id']}/export").json()
    progress = {(item["item_type"], item["item_id"]): item for item in exported["progress_items"]}
    assert progress[("scale", "A-minor-pentatonic")]["status"] == "mastered"
    assert progress[("scale", "A-minor-pentatonic")]["mastery"] == 85
    assert progress[("scale", "A-minor-pentatonic")]["minutes"] == 8
    assert progress[("scale", "A-minor-pentatonic")]["bpm_ceiling"] == 72
    assert progress[("scale", "A-minor-pentatonic")]["metadata"]["sourceSessionId"] == session_id
    assert progress[("scale", "A-minor-pentatonic")]["metadata"]["rating"] == 8.5

    history_response = client.get(f"/v1/learners/{learner['id']}/history")
    assert history_response.status_code == 200
    history = history_response.json()
    assert history[0]["activity_type"] == "technique_drill"
    assert history[0]["duration_seconds"] == 480
    assert history[0]["score"] == 8.5
    assert history[0]["result_summary"] == "A minor pentatonic box: 8.5/10"


def test_learning_path_uses_theory_progress_as_skill_evidence(tmp_path: Path) -> None:
    client, _storage, _queue, _session_local = build_client(tmp_path)

    learner = client.post("/v1/learners", json={"anonymous_id": "anonymous-theory-session"}).json()
    session_response = client.post(
        "/v1/sessions",
        json={
            "learner_id": learner["id"],
            "activity_type": "technique_drill",
            "started_at": "2026-05-30T10:00:00Z",
            "client_metadata": {
                "practiceMode": "technique_practice",
                "targetId": "theory-scale-degree",
                "targetTitle": "Scale degrees in songs",
                "targetArea": "Theory",
                "itemType": "theory",
                "itemId": "scale-degree",
                "skillId": "theory-for-guitar",
                "lessonId": "music-theory-basics",
                "rating": 8,
                "mastery": 80,
                "progressStatus": "in-progress",
                "notes": "Found I, IV, and V in C.",
            },
        },
    )
    assert session_response.status_code == 201
    session_id = session_response.json()["id"]

    close_response = client.patch(
        f"/v1/sessions/{session_id}",
        json={
            "ended_at": "2026-05-30T10:05:00Z",
            "client_metadata": {
                "completionStatus": "completed",
                "resultSummary": "Scale degrees in songs: 8/10",
                "score": 8,
                "scoreSummary": {"attempts": 1, "averageScore": 8, "bestScore": 8},
            },
        },
    )
    assert close_response.status_code == 200

    exported = client.get(f"/v1/learners/{learner['id']}/export").json()
    progress = {(item["item_type"], item["item_id"]): item for item in exported["progress_items"]}
    assert progress[("theory", "scale-degree")]["status"] == "in_progress"
    assert progress[("theory", "scale-degree")]["mastery"] == 80

    path = client.get(f"/v1/learners/{learner['id']}/learning-path").json()
    theory_skill = [skill for skill in path["skills"] if skill["id"] == "theory-for-guitar"][0]
    assert theory_skill["status"] == "in_progress"


def test_session_close_derives_backend_progress_items(tmp_path: Path) -> None:
    client, _storage, _queue, _session_local = build_client(tmp_path)

    learner = client.post("/v1/learners", json={"anonymous_id": "anonymous-session-progress"}).json()
    learner_id = learner["id"]

    chord_session = client.post(
        "/v1/sessions",
        json={
            "learner_id": learner_id,
            "activity_type": "chord_check",
            "client_metadata": {"chordId": "G", "chordName": "G"},
        },
    ).json()
    close_chord = client.patch(
        f"/v1/sessions/{chord_session['id']}",
        json={
            "client_metadata": {
                "completionStatus": "completed",
                "attempts": [
                    {"expectedChordId": "G", "score": {"score": 9}},
                    {"expectedChordId": "G", "score": {"score": 8}},
                ],
            },
        },
    )
    assert close_chord.status_code == 200

    repeat_close = client.patch(f"/v1/sessions/{chord_session['id']}", json={})
    assert repeat_close.status_code == 200

    tuner_session = client.post(
        "/v1/sessions",
        json={"learner_id": learner_id, "activity_type": "tuner"},
    ).json()
    close_tuner = client.patch(
        f"/v1/sessions/{tuner_session['id']}",
        json={
            "client_metadata": {
                "completionStatus": "completed",
                "tuningResult": {
                    "tuningId": "standard",
                    "tunedStringCount": 6,
                    "totalStringCount": 6,
                },
            },
        },
    )
    assert close_tuner.status_code == 200

    strum_session = client.post(
        "/v1/sessions",
        json={"learner_id": learner_id, "activity_type": "practice_drill"},
    ).json()
    close_strum = client.patch(
        f"/v1/sessions/{strum_session['id']}",
        json={
            "client_metadata": {
                "practiceMode": "strumming_drill",
                "patternId": "classic",
                "patternName": "D D U U D U",
                "bpm": 80,
                "attempts": [
                    {"expectedStroke": "D", "score": {"score": 8}},
                    {"expectedStroke": "U", "score": {"score": 9}},
                ],
            },
        },
    )
    assert close_strum.status_code == 200

    exported = client.get(f"/v1/learners/{learner_id}/export").json()
    progress = {(item["item_type"], item["item_id"]): item for item in exported["progress_items"]}

    assert progress[("chord", "G")]["attempts"] == 2
    assert progress[("chord", "G")]["status"] == "mastered"
    assert progress[("chord", "G")]["metadata"]["sourceSessionId"] == chord_session["id"]
    assert progress[("skill", "setup-tuning")]["mastery"] == 100
    assert progress[("rhythm", "classic")]["bpm_ceiling"] == 80

    dashboard_response = client.get(f"/v1/learners/{learner_id}/dashboard")
    assert dashboard_response.status_code == 200
    dashboard = dashboard_response.json()
    first_clean_chord = [
        challenge
        for challenge in dashboard["challenges"]
        if challenge["id"] == "first-clean-chord"
    ][0]
    assert first_clean_chord["status"] == "complete"
    assert dashboard["recaps"]["weekly"]["practice_days"] >= 1
    assert dashboard["recaps"]["weekly"]["best_improvement"].endswith("evidence.")
    assert dashboard["recaps"]["monthly"]["suggested_focus"]

    path = client.get(f"/v1/learners/{learner_id}/learning-path").json()
    assert path["skills"][0]["id"] == "setup-tuning"
    assert path["skills"][0]["status"] == "mastered"
    assert path["skills"][2]["id"] == "first-open-chords"
    assert path["skills"][2]["status"] == "in_progress"
    assert "G" in path["skills"][2]["target_ids"]


def test_dashboard_streak_keeps_full_chain_with_grace_day(tmp_path: Path) -> None:
    client, _storage, _queue, _session_local = build_client(tmp_path)

    learner = client.post("/v1/learners", json={"anonymous_id": "anonymous-streak-grace"}).json()
    learner_id = learner["id"]
    now = datetime.now(timezone.utc)

    for days_ago in (1, 2, 3):
        started_at = now - timedelta(days=days_ago)
        ended_at = started_at + timedelta(minutes=10)
        session_response = client.post(
            "/v1/sessions",
            json={
                "learner_id": learner_id,
                "activity_type": "practice_drill",
                "started_at": started_at.isoformat(),
                "client_metadata": {"practiceMode": "chord_change_drill"},
            },
        )
        assert session_response.status_code == 201
        close_response = client.patch(
            f"/v1/sessions/{session_response.json()['id']}",
            json={
                "ended_at": ended_at.isoformat(),
                "client_metadata": {
                    "completionStatus": "completed",
                    "scoreSummary": {"attempts": 1, "averageScore": 8, "bestScore": 8},
                },
            },
        )
        assert close_response.status_code == 200

    dashboard_response = client.get(f"/v1/learners/{learner_id}/dashboard")
    assert dashboard_response.status_code == 200
    dashboard = dashboard_response.json()
    transition_challenge = [
        challenge for challenge in dashboard["challenges"] if challenge["id"] == "seven-day-transition"
    ][0]

    assert dashboard["streak_days"] == 3
    assert transition_challenge["progress"] == 3 / 7


def test_recording_media_is_replayable_for_saved_recording(tmp_path: Path) -> None:
    client, storage, _queue, _session_local = build_client(tmp_path)

    learner = client.post("/v1/learners", json={"anonymous_id": "anonymous-playback"}).json()
    client.post(
        "/v1/consents/recording",
        json={"learner_id": learner["id"], "granted": True, "source": "settings"},
    )
    session = client.post(
        "/v1/sessions",
        json={"learner_id": learner["id"], "activity_type": "practice_drill"},
    ).json()

    upload_response = client.post(
        f"/v1/sessions/{session['id']}/recordings",
        files={"file": ("clip.wav", b"playable-audio", "audio/wav")},
    )
    assert upload_response.status_code == 201
    recording_id = upload_response.json()["id"]

    history_response = client.get(f"/v1/learners/{learner['id']}/history")
    assert history_response.status_code == 200
    assert history_response.json()[0]["recording_available"] is True
    assert history_response.json()[0]["recordings"][0]["id"] == recording_id

    media_response = client.get(f"/v1/recordings/{recording_id}/media")
    assert media_response.status_code == 200
    assert media_response.content == b"playable-audio"
    assert media_response.headers["content-type"] == "audio/wav"
    assert storage.saved[0][1] == b"playable-audio"
    assert storage.saved[0][0].endswith(".wav")


def test_recording_analysis_endpoint_exposes_structured_backend_feedback(tmp_path: Path) -> None:
    client, _storage, queue, session_local = build_client(tmp_path)

    learner = client.post("/v1/learners", json={"anonymous_id": "anonymous-analysis"}).json()
    client.post(
        "/v1/consents/recording",
        json={"learner_id": learner["id"], "granted": True, "source": "settings"},
    )
    session = client.post(
        "/v1/sessions",
        json={
            "learner_id": learner["id"],
            "activity_type": "chord_check",
            "client_metadata": {"chordId": "G", "chordName": "G"},
        },
    ).json()

    upload_response = client.post(
        f"/v1/sessions/{session['id']}/recordings",
        files={"file": ("clip.wav", b"analysis-audio", "audio/wav")},
    )
    assert upload_response.status_code == 201
    recording_id = upload_response.json()["id"]
    job_id, queued_recording_id = queue.messages[0]
    assert queued_recording_id == recording_id

    with session_local() as db:
        job = db.get(models.AnalysisJob, job_id)
        assert job is not None
        job.status = "completed"
        job.completed_at = models.utcnow()
        db.add(
            models.AnalysisResult(
                job_id=job_id,
                recording_id=recording_id,
                guidance="Chord check accepted for G.",
                metrics={
                    "placeholder": False,
                    "activity": "chord_check",
                    "durationSec": 2.5,
                    "detector": {
                        "detector": "solitito",
                        "modelId": "greblus/solitito-ai",
                        "modelRevision": "revision-1",
                        "modelFilename": "model.onnx",
                    },
                    "expectedChordId": "G",
                    "predictedChordId": "G",
                    "confidence": 0.72,
                    "verifierStatus": "accepted",
                    "acceptedChordId": "G",
                    "bestAlternativeChordId": "C",
                    "expectedSimilarity": 0.72,
                    "alternativeSimilarity": 0.18,
                    "verifierMargin": 0.54,
                    "capture": {
                        "hasSignal": True,
                        "rawRoot": "G",
                        "rawQuality": "",
                        "rootConfidence": 0.9,
                        "qualityConfidence": 0.8,
                        "chromaFrames": 64,
                        "chromaFramesUsed": 12,
                        "captureStartSec": 0.0,
                        "captureEndSec": 2.5,
                        "topK": [
                            {"chordId": "G", "confidence": 0.72, "root": "G", "quality": ""},
                            {"chordId": "C", "confidence": 0.18, "root": "C", "quality": ""},
                        ],
                    },
                },
            )
        )
        db.commit()

    history_response = client.get(f"/v1/learners/{learner['id']}/history")
    assert history_response.status_code == 200
    analysis_summary = history_response.json()[0]["recordings"][0]["analysis"]
    assert analysis_summary["status"] == "completed"
    assert analysis_summary["result"] == "accepted"
    assert analysis_summary["target_chord_id"] == "G"
    assert analysis_summary["predicted_chord_id"] == "G"
    assert analysis_summary["confidence"] == 0.72

    analysis_response = client.get(f"/v1/recordings/{recording_id}/analysis")
    assert analysis_response.status_code == 200
    analysis = analysis_response.json()
    assert analysis["status"] == "completed"
    assert analysis["detector"]["name"] == "solitito"
    assert analysis["target"]["chord_id"] == "G"
    assert analysis["prediction"]["verifier_status"] == "accepted"
    assert analysis["prediction"]["best_alternative_chord_id"] == "C"
    assert analysis["prediction"]["top_predictions"][0]["chord_id"] == "G"
    assert analysis["capture"]["raw_root"] == "G"


def test_recording_analysis_endpoint_exposes_tuner_feedback(tmp_path: Path) -> None:
    client, _storage, queue, session_local = build_client(tmp_path)

    learner = client.post("/v1/learners", json={"anonymous_id": "anonymous-tuner-analysis"}).json()
    client.post(
        "/v1/consents/recording",
        json={"learner_id": learner["id"], "granted": True, "source": "settings"},
    )
    session = client.post(
        "/v1/sessions",
        json={
            "learner_id": learner["id"],
            "activity_type": "tuner",
            "client_metadata": {"tuningResult": {"tuningId": "standard", "tuningName": "Standard"}},
        },
    ).json()

    upload_response = client.post(
        f"/v1/sessions/{session['id']}/recordings",
        files={"file": ("tuner.wav", b"analysis-audio", "audio/wav")},
    )
    assert upload_response.status_code == 201
    recording_id = upload_response.json()["id"]
    job_id, queued_recording_id = queue.messages[0]
    assert queued_recording_id == recording_id

    with session_local() as db:
        job = db.get(models.AnalysisJob, job_id)
        assert job is not None
        job.status = "completed"
        job.completed_at = models.utcnow()
        db.add(
            models.AnalysisResult(
                job_id=job_id,
                recording_id=recording_id,
                guidance="Backend tuner analysis found A2 stable.",
                metrics={
                    "placeholder": False,
                    "activity": "tuner",
                    "durationSec": 1.2,
                    "detector": {"detector": "autocorrelation-tuner", "modelId": "local-dsp-v1"},
                    "capture": {"hasSignal": True, "captureStartSec": 0.0, "captureEndSec": 1.2},
                    "tuner": {
                        "tuningId": "standard",
                        "tuningName": "Standard",
                        "frameCount": 28,
                        "voicedFrameCount": 25,
                        "stableFrameCount": 22,
                        "inTuneFrameRate": 0.88,
                        "medianHz": 110.0,
                        "medianNote": "A2",
                        "medianCents": 0.2,
                        "meanAbsCents": 1.4,
                        "centsStdDev": 2.1,
                    },
                },
            )
        )
        db.commit()

    history_response = client.get(f"/v1/learners/{learner['id']}/history")
    assert history_response.status_code == 200
    analysis_summary = history_response.json()[0]["recordings"][0]["analysis"]
    assert analysis_summary["status"] == "completed"
    assert analysis_summary["result"] == "tuning_analyzed"
    assert analysis_summary["tuner_note"] == "A2"
    assert analysis_summary["tuner_in_tune_rate"] == 0.88
    assert analysis_summary["tuner_mean_abs_cents"] == 1.4

    analysis_response = client.get(f"/v1/recordings/{recording_id}/analysis")
    assert analysis_response.status_code == 200
    analysis = analysis_response.json()
    assert analysis["prediction"] is None
    assert analysis["tuner"]["median_note"] == "A2"
    assert analysis["tuner"]["in_tune_frame_rate"] == 0.88
    assert analysis["capture"]["has_signal"] is True


def test_recording_analysis_endpoint_exposes_practice_attempt_feedback(tmp_path: Path) -> None:
    client, _storage, queue, session_local = build_client(tmp_path)

    learner = client.post("/v1/learners", json={"anonymous_id": "anonymous-practice-analysis"}).json()
    client.post(
        "/v1/consents/recording",
        json={"learner_id": learner["id"], "granted": True, "source": "settings"},
    )
    session = client.post(
        "/v1/sessions",
        json={
            "learner_id": learner["id"],
            "activity_type": "practice_drill",
            "client_metadata": {
                "practiceMode": "timed_chord_practice",
                "bpm": 72,
                "beatsPerChord": 4,
                "countInBeats": 4,
            },
        },
    ).json()

    upload_response = client.post(
        f"/v1/sessions/{session['id']}/recordings",
        files={"file": ("practice.wav", b"analysis-audio", "audio/wav")},
    )
    assert upload_response.status_code == 201
    recording_id = upload_response.json()["id"]
    job_id, queued_recording_id = queue.messages[0]
    assert queued_recording_id == recording_id

    with session_local() as db:
        job = db.get(models.AnalysisJob, job_id)
        assert job is not None
        job.status = "completed"
        job.completed_at = models.utcnow()
        db.add(
            models.AnalysisResult(
                job_id=job_id,
                recording_id=recording_id,
                guidance="Backend analyzed 2/2 chord attempts with Solitito. Accepted 1, rejected 1, uncertain 0.",
                metrics={
                    "placeholder": False,
                    "activity": "practice_drill",
                    "durationSec": 8.0,
                    "detector": {
                        "detector": "solitito",
                        "modelId": "greblus/solitito-ai",
                        "modelRevision": "revision-1",
                        "modelFilename": "model.onnx",
                    },
                    "practice": {
                        "mode": "timed_chord_practice",
                        "bpm": 72,
                        "beatsPerChord": 4,
                        "countInBeats": 4,
                        "attemptCount": 2,
                        "analyzedAttemptCount": 2,
                        "acceptedCount": 1,
                        "rejectedCount": 1,
                        "uncertainCount": 0,
                        "skippedCount": 0,
                        "averageConfidence": 0.61,
                        "attempts": [
                            {
                                "id": "attempt-0",
                                "expectedIndex": 0,
                                "expectedChordId": "G",
                                "frontendDetectedChordId": "G",
                                "frontendScore": 8,
                                "predictedChordId": "G",
                                "verifierStatus": "accepted",
                                "confidence": 0.72,
                                "expectedSimilarity": 0.72,
                                "bestAlternativeChordId": "C",
                                "alternativeSimilarity": 0.18,
                                "verifierMargin": 0.54,
                                "detectedAtBeat": 0.05,
                                "timingDeltaMs": 50,
                                "captureStartSec": 3.97,
                                "captureEndSec": 4.95,
                                "rawRoot": "G",
                                "rawQuality": "",
                                "framesUsed": 12,
                                "topK": [
                                    {"chordId": "G", "confidence": 0.72, "root": "G", "quality": ""},
                                ],
                            },
                            {
                                "id": "attempt-1",
                                "expectedIndex": 1,
                                "expectedChordId": "C",
                                "frontendDetectedChordId": "C",
                                "frontendScore": 7,
                                "predictedChordId": "E7",
                                "verifierStatus": "rejected",
                                "confidence": 0.5,
                                "expectedSimilarity": 0.1,
                                "bestAlternativeChordId": "E7",
                                "alternativeSimilarity": 0.72,
                                "verifierMargin": -0.62,
                                "detectedAtBeat": 4,
                                "timingDeltaMs": 0,
                                "captureStartSec": 7.3,
                                "captureEndSec": 8.0,
                                "rawRoot": "E",
                                "rawQuality": "7",
                                "framesUsed": 10,
                                "topK": [
                                    {"chordId": "E7", "confidence": 0.72, "root": "E", "quality": "7"},
                                ],
                            },
                        ],
                    },
                },
            )
        )
        db.commit()

    history_response = client.get(f"/v1/learners/{learner['id']}/history")
    assert history_response.status_code == 200
    analysis_summary = history_response.json()[0]["recordings"][0]["analysis"]
    assert analysis_summary["status"] == "completed"
    assert analysis_summary["result"] == "analyzed"
    assert analysis_summary["attempt_count"] == 2
    assert analysis_summary["analyzed_attempt_count"] == 2
    assert analysis_summary["accepted_count"] == 1
    assert analysis_summary["rejected_count"] == 1
    assert analysis_summary["score"]["value"] == 50
    assert analysis_summary["score"]["label"] == "Building"
    assert analysis_summary["score"]["analysis_coverage"] == 1
    assert analysis_summary["score"]["clarity"] == 1
    assert analysis_summary["score"]["decisive_accuracy"] == 0.5

    analysis_response = client.get(f"/v1/recordings/{recording_id}/analysis")
    assert analysis_response.status_code == 200
    analysis = analysis_response.json()
    assert analysis["prediction"] is None
    assert analysis["practice"]["attempt_count"] == 2
    assert analysis["practice"]["score"]["value"] == 50
    assert analysis["practice"]["score"]["label"] == "Building"
    assert analysis["practice"]["score"]["accepted_rate"] == 0.5
    assert analysis["practice"]["score"]["rejected_rate"] == 0.5
    assert analysis["practice"]["score"]["uncertain_rate"] == 0
    assert analysis["practice"]["attempts"][0]["expected_chord_id"] == "G"
    assert analysis["practice"]["attempts"][0]["backend_predicted_chord_id"] == "G"
    assert analysis["practice"]["attempts"][1]["verifier_status"] == "rejected"
    assert analysis["practice"]["attempts"][1]["top_predictions"][0]["chord_id"] == "E7"


def test_local_profile_plan_song_progress_and_recording_controls(tmp_path: Path) -> None:
    client, _storage, _queue, _session_local = build_client(tmp_path)

    learner = client.post("/v1/learners", json={"anonymous_id": "anonymous-platform"}).json()
    learner_id = learner["id"]

    profile_response = client.put(
        f"/v1/learners/{learner_id}/profile",
        json={
            "display_name": "Maya",
            "skill_level": "beginner",
            "goals": ["Play full songs"],
            "handedness": "left",
            "instrument_preference": "electric",
            "daily_practice_target_minutes": 20,
            "preferred_genres": ["rock", "blues"],
            "onboarding_completed": True,
        },
    )
    assert profile_response.status_code == 200
    profile = profile_response.json()
    assert profile["display_name"] == "Maya"
    assert profile["learner_id"] == learner_id
    assert profile["onboarding_completed"] is True

    path_response = client.get(f"/v1/learners/{learner_id}/learning-path")
    assert path_response.status_code == 200
    path = path_response.json()
    assert path["profile"]["display_name"] == "Maya"
    assert path["skills"][0]["status"] == "ready"
    assert "setup-tuning" in path["next_skill_ids"]

    plan_response = client.get(f"/v1/learners/{learner_id}/practice-plan")
    assert plan_response.status_code == 200
    plan = plan_response.json()
    assert [option["minutes"] for option in plan["options"]] == [10, 20, 45]
    assert plan["options"][1]["tasks"][0]["route"] == "/tools/tuner"

    complete_lesson_response = client.post(
        f"/v1/learners/{learner_id}/lessons/tuning-basics/complete",
        json={"minutes": 6, "score": 100},
    )
    assert complete_lesson_response.status_code == 200
    assert complete_lesson_response.json()["item_type"] == "lesson"
    assert complete_lesson_response.json()["status"] == "mastered"

    updated_path = client.get(f"/v1/learners/{learner_id}/learning-path").json()
    assert updated_path["skills"][0]["status"] == "mastered"
    assert updated_path["skills"][1]["status"] == "ready"

    songs_response = client.get(f"/v1/learners/{learner_id}/songs")
    assert songs_response.status_code == 200
    assert songs_response.json()[0]["id"] == "open-road-study"

    song_progress_response = client.patch(
        f"/v1/learners/{learner_id}/songs/open-road-study",
        json={
            "status": "in_progress",
            "mastery": 50,
            "minutes": 8,
            "completed_section_ids": ["verse"],
            "last_tempo": 70,
        },
    )
    assert song_progress_response.status_code == 200
    assert song_progress_response.json()["metadata"]["completedSectionIds"] == ["verse"]
    exported_after_song = client.get(f"/v1/learners/{learner_id}/export").json()
    song_progress_items = {
        item["item_id"]: item
        for item in exported_after_song["progress_items"]
        if item["item_type"] == "song"
    }
    assert song_progress_items["open-road-study"]["attempts"] == 1
    assert song_progress_items["open-road-study"]["minutes"] == 8
    song_section_progress = {
        item["item_id"]: item
        for item in exported_after_song["progress_items"]
        if item["item_type"] == "song-section"
    }
    assert song_section_progress["open-road-study:verse"]["status"] == "mastered"
    assert song_section_progress["open-road-study:verse"]["metadata"]["sectionId"] == "verse"
    repeat_song_progress_response = client.patch(
        f"/v1/learners/{learner_id}/songs/open-road-study",
        json={
            "status": "in_progress",
            "mastery": 50,
            "minutes": 8,
            "completed_section_ids": ["verse"],
            "last_tempo": 70,
        },
    )
    assert repeat_song_progress_response.status_code == 200
    repeated_export = client.get(f"/v1/learners/{learner_id}/export").json()
    repeated_song_sections = [
        item
        for item in repeated_export["progress_items"]
        if item["item_type"] == "song-section" and item["item_id"] == "open-road-study:verse"
    ]
    repeated_song_progress = {
        item["item_id"]: item
        for item in repeated_export["progress_items"]
        if item["item_type"] == "song"
    }
    assert repeated_song_progress["open-road-study"]["attempts"] == 1
    assert repeated_song_progress["open-road-study"]["minutes"] == 8
    assert len(repeated_song_sections) == 1
    assert repeated_song_sections[0]["attempts"] == 1

    dashboard_response = client.get(f"/v1/learners/{learner_id}/dashboard")
    assert dashboard_response.status_code == 200
    dashboard = dashboard_response.json()
    assert dashboard["mastered_count"] >= 1
    assert dashboard["recommendations"]
    assert dashboard["challenges"]

    client.post(
        "/v1/consents/recording",
        json={"learner_id": learner_id, "granted": True, "source": "settings"},
    )
    session = client.post(
        "/v1/sessions",
        json={"learner_id": learner_id, "activity_type": "chord_check"},
    ).json()
    journal_response = client.post(
        f"/v1/sessions/{session['id']}/journal",
        json={"learner_id": learner_id, "body": "Best take was the slow one.", "focus": "best take"},
    )
    assert journal_response.status_code == 201
    upload = client.post(
        f"/v1/sessions/{session['id']}/recordings",
        files={"file": ("clip.wav", b"audio", "audio/wav")},
    )
    assert upload.status_code == 201
    recording_id = upload.json()["id"]

    export_response = client.post(f"/v1/recordings/{recording_id}/export", json={})
    assert export_response.status_code == 200
    assert export_response.json()["export_count"] == 1

    delete_response = client.request(
        "DELETE",
        f"/v1/recordings/{recording_id}",
        json={"reason": "test cleanup"},
    )
    assert delete_response.status_code == 204
    assert client.get(f"/v1/recordings/{recording_id}/media").status_code == 410
    history = client.get(f"/v1/learners/{learner_id}/history").json()
    assert history[0]["recording_available"] is False

    learner_export_response = client.get(f"/v1/learners/{learner_id}/export")
    assert learner_export_response.status_code == 200
    exported = learner_export_response.json()
    assert exported["profile"]["display_name"] == "Maya"
    assert exported["deleted_recording_count"] == 1
    assert exported["journal_entries"][0]["body"] == "Best take was the slow one."
    assert any(item["item_id"] == "tuning-basics" for item in exported["progress_items"])
