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
from app.storage import get_object_storage


class FakeStorage:
    bucket = "test-recordings"

    def __init__(self) -> None:
        self.saved: list[tuple[str, bytes, str]] = []

    def put_recording(
        self,
        learner_id: str,
        session_id: str,
        recording_id: str,
        file_obj: BinaryIO,
        content_type: str,
    ) -> tuple[str, int]:
        content = file_obj.read()
        key = f"learners/{learner_id}/sessions/{session_id}/recordings/{recording_id}.webm"
        self.saved.append((key, content, content_type))
        return key, len(content)


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
