from pathlib import Path
from collections.abc import Generator
from typing import BinaryIO

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

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


def build_client(tmp_path: Path) -> tuple[TestClient, FakeStorage, FakeQueue]:
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
    return TestClient(app), storage, queue


def test_session_recording_upload_enqueues_analysis(tmp_path: Path) -> None:
    client, storage, queue = build_client(tmp_path)

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
    client, _storage, queue = build_client(tmp_path)

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
    client, _storage, _queue = build_client(tmp_path)

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


def test_recording_media_is_replayable_for_saved_recording(tmp_path: Path) -> None:
    client, storage, _queue = build_client(tmp_path)

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
