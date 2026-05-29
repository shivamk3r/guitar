from pathlib import Path
from collections.abc import Generator
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

    analysis_response = client.get(f"/v1/recordings/{recording_id}/analysis")
    assert analysis_response.status_code == 200
    analysis = analysis_response.json()
    assert analysis["prediction"] is None
    assert analysis["practice"]["attempt_count"] == 2
    assert analysis["practice"]["attempts"][0]["expected_chord_id"] == "G"
    assert analysis["practice"]["attempts"][0]["backend_predicted_chord_id"] == "G"
    assert analysis["practice"]["attempts"][1]["verifier_status"] == "rejected"
    assert analysis["practice"]["attempts"][1]["top_predictions"][0]["chord_id"] == "E7"
