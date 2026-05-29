from io import BytesIO
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app import models
from app.chord_detection.solitito import QUALITIES, ROOTS, SolititoPrediction, top_product_predictions
from app.database import Base
from app.worker import complete_job


def test_complete_job_writes_placeholder_result(tmp_path: Path) -> None:
    engine = create_engine(f"sqlite+pysqlite:///{tmp_path / 'worker.db'}")
    Base.metadata.create_all(bind=engine)
    session_local = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)

    with session_local() as db:
        learner = models.Learner(anonymous_id="anonymous-worker-test")
        db.add(learner)
        db.flush()
        session = models.LearningSession(learner_id=learner.id, activity_type="practice_drill")
        db.add(session)
        db.flush()
        recording = models.AudioRecording(
            session_id=session.id,
            learner_id=learner.id,
            object_key="recordings/test.webm",
            bucket="test-recordings",
            content_type="audio/webm",
            size_bytes=12,
        )
        db.add(recording)
        db.flush()
        job = models.AnalysisJob(recording_id=recording.id, status="queued")
        db.add(job)
        db.commit()

        complete_job(db, job.id, recording.id)

        completed_job = db.get(models.AnalysisJob, job.id)
        result = db.scalar(select(models.AnalysisResult).where(models.AnalysisResult.job_id == job.id))

    assert completed_job is not None
    assert completed_job.status == "completed"
    assert completed_job.completed_at is not None
    assert result is not None
    assert result.metrics["placeholder"] is True
    assert result.metrics["activity"] == "practice_drill"


def test_complete_job_analyzes_chord_check_wav_recording(tmp_path: Path) -> None:
    engine = create_engine(f"sqlite+pysqlite:///{tmp_path / 'worker-chord.db'}")
    Base.metadata.create_all(bind=engine)
    session_local = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)
    body = wav_bytes()

    with session_local() as db:
        learner = models.Learner(anonymous_id="anonymous-worker-chord-test")
        db.add(learner)
        db.flush()
        session = models.LearningSession(
            learner_id=learner.id,
            activity_type="chord_check",
            client_metadata={"chordId": "G", "chordName": "G"},
        )
        db.add(session)
        db.flush()
        recording = models.AudioRecording(
            session_id=session.id,
            learner_id=learner.id,
            object_key="recordings/test.wav",
            bucket="test-recordings",
            content_type="audio/wav",
            size_bytes=len(body),
        )
        db.add(recording)
        db.flush()
        job = models.AnalysisJob(recording_id=recording.id, status="queued")
        db.add(job)
        db.commit()

        complete_job(db, job.id, recording.id, storage=FakeStorage(body), chord_detector=FakeChordDetector())

        completed_job = db.get(models.AnalysisJob, job.id)
        result = db.scalar(select(models.AnalysisResult).where(models.AnalysisResult.job_id == job.id))

    assert completed_job is not None
    assert completed_job.status == "completed"
    assert result is not None
    assert result.metrics["placeholder"] is False
    assert result.metrics["detector"]["detector"] == "solitito"
    assert result.metrics["expectedChordId"] == "G"
    assert result.metrics["predictedChordId"] == "G"
    assert result.metrics["verifierStatus"] == "accepted"
    assert result.metrics["capture"]["rawRoot"] == "G"


class FakeStorage:
    def __init__(self, body: bytes) -> None:
        self.body = body

    def get_recording(self, object_key: str) -> bytes:
        assert object_key == "recordings/test.wav"
        return self.body


class FakeChordDetector:
    def analyze_audio(self, audio):
        assert audio.sample_rate == 16_000
        return object()

    def predict_segment(self, analysis, *, start_sec: float, end_sec: float) -> SolititoPrediction:
        assert start_sec == 0.0
        assert end_sec > 0
        root_probabilities = np.zeros(len(ROOTS), dtype=np.float64)
        quality_probabilities = np.zeros(len(QUALITIES), dtype=np.float64)
        root_probabilities[ROOTS.index("G")] = 0.9
        quality_probabilities[QUALITIES.index("")] = 0.8
        return SolititoPrediction(
            predicted_chord_id="G",
            root="G",
            quality="",
            confidence=0.72,
            root_confidence=0.9,
            quality_confidence=0.8,
            root_probabilities=root_probabilities,
            quality_probabilities=quality_probabilities,
            frame_count=32,
            frames_used=1,
            top_k=top_product_predictions(root_probabilities, quality_probabilities),
        )


def wav_bytes() -> bytes:
    output = BytesIO()
    samples = np.zeros(1600, dtype=np.float32)
    wavfile.write(output, 16_000, samples)
    return output.getvalue()
