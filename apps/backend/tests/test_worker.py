from io import BytesIO
from pathlib import Path

import numpy as np
import pytest
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
        session = models.LearningSession(learner_id=learner.id, activity_type="tuner")
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
    assert result.metrics["activity"] == "tuner"


def test_complete_job_analyzes_tuner_wav_recording(tmp_path: Path) -> None:
    engine = create_engine(f"sqlite+pysqlite:///{tmp_path / 'worker-tuner.db'}")
    Base.metadata.create_all(bind=engine)
    session_local = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)
    body = sine_wav_bytes(hz=110.0, duration_sec=1.2)

    with session_local() as db:
        learner = models.Learner(anonymous_id="anonymous-worker-tuner-test")
        db.add(learner)
        db.flush()
        session = models.LearningSession(
            learner_id=learner.id,
            activity_type="tuner",
            client_metadata={
                "tuningResult": {
                    "tuningId": "standard",
                    "tuningName": "Standard",
                },
            },
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

        complete_job(db, job.id, recording.id, storage=FakeStorage(body))

        completed_job = db.get(models.AnalysisJob, job.id)
        result = db.scalar(select(models.AnalysisResult).where(models.AnalysisResult.job_id == job.id))

    assert completed_job is not None
    assert completed_job.status == "completed"
    assert result is not None
    assert result.metrics["placeholder"] is False
    assert result.metrics["detector"]["detector"] == "autocorrelation-tuner"
    tuner = result.metrics["tuner"]
    assert tuner["tuningId"] == "standard"
    assert tuner["medianNote"] == "A2"
    assert tuner["medianHz"] == pytest.approx(110.0, rel=0.02)
    assert tuner["inTuneFrameRate"] > 0.8
    assert tuner["meanAbsCents"] < 2
    assert "stable" in result.guidance


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


def test_complete_job_analyzes_timed_practice_attempt_windows(tmp_path: Path) -> None:
    engine = create_engine(f"sqlite+pysqlite:///{tmp_path / 'worker-practice.db'}")
    Base.metadata.create_all(bind=engine)
    session_local = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)
    body = wav_bytes(duration_sec=10.0)
    detector = SequenceChordDetector(["G", "E7", ("A", 0.2)])

    with session_local() as db:
        learner = models.Learner(anonymous_id="anonymous-worker-practice-test")
        db.add(learner)
        db.flush()
        session = models.LearningSession(
            learner_id=learner.id,
            activity_type="practice_drill",
            client_metadata={
                "practiceMode": "timed_chord_practice",
                "bpm": 60,
                "beatsPerChord": 2,
                "countInBeats": 4,
                "attempts": [
                    {
                        "id": "attempt-0",
                        "expectedIndex": 0,
                        "chordId": "G",
                        "expectedBeat": 0,
                        "detectedAtBeat": 0.05,
                        "detectedChordId": "G",
                        "timingDeltaMs": 50,
                        "score": {"score": 8},
                    },
                    {
                        "id": "attempt-1",
                        "expectedIndex": 1,
                        "chordId": "C",
                        "expectedBeat": 2,
                        "detectedAtBeat": 2,
                        "detectedChordId": "C",
                        "timingDeltaMs": 0,
                        "score": {"score": 7},
                    },
                    {
                        "id": "attempt-2",
                        "expectedIndex": 2,
                        "chordId": "D",
                        "expectedBeat": 4,
                        "detectedAtBeat": 4,
                        "detectedChordId": None,
                        "timingDeltaMs": 0,
                        "score": {"score": 4},
                    },
                ],
            },
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

        complete_job(db, job.id, recording.id, storage=FakeStorage(body), chord_detector=detector)

        completed_job = db.get(models.AnalysisJob, job.id)
        result = db.scalar(select(models.AnalysisResult).where(models.AnalysisResult.job_id == job.id))

    assert completed_job is not None
    assert completed_job.status == "completed"
    assert result is not None
    practice = result.metrics["practice"]
    assert practice["attemptCount"] == 3
    assert practice["analyzedAttemptCount"] == 3
    assert practice["acceptedCount"] == 1
    assert practice["rejectedCount"] == 1
    assert practice["uncertainCount"] == 1
    assert practice["score"]["value"] == pytest.approx(100 / 3)
    assert practice["score"]["label"] == "Needs focus"
    assert practice["score"]["analysisCoverage"] == pytest.approx(1.0)
    assert practice["score"]["clarity"] == pytest.approx(2 / 3)
    assert practice["score"]["decisiveAccuracy"] == pytest.approx(0.5)
    assert practice["score"]["acceptedRate"] == pytest.approx(1 / 3)
    assert practice["score"]["rejectedRate"] == pytest.approx(1 / 3)
    assert practice["score"]["uncertainRate"] == pytest.approx(1 / 3)
    assert practice["attempts"][0]["expectedChordId"] == "G"
    assert practice["attempts"][0]["predictedChordId"] == "G"
    assert practice["attempts"][1]["expectedChordId"] == "C"
    assert practice["attempts"][1]["predictedChordId"] == "E7"
    assert practice["attempts"][2]["expectedChordId"] == "D"
    assert practice["attempts"][2]["verifierStatus"] == "uncertain"
    assert detector.windows[0] == pytest.approx((3.97, 4.95))
    assert detector.windows[1] == pytest.approx((5.92, 6.90))
    assert detector.windows[2] == pytest.approx((7.92, 8.90))


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
            **prediction_kwargs("G", root_probabilities, quality_probabilities),
        )


class SequenceChordDetector:
    def __init__(self, chord_ids: list[str | tuple[str, float]]) -> None:
        self.chord_ids = chord_ids
        self.windows: list[tuple[float, float]] = []

    def analyze_audio(self, audio):
        assert audio.sample_rate == 16_000
        return object()

    def predict_segment(self, analysis, *, start_sec: float, end_sec: float) -> SolititoPrediction:
        self.windows.append((start_sec, end_sec))
        item = self.chord_ids[len(self.windows) - 1]
        chord_id, confidence = item if isinstance(item, tuple) else (item, 0.72)
        root, quality = chord_root_quality(chord_id)
        root_probabilities = np.zeros(len(ROOTS), dtype=np.float64)
        quality_probabilities = np.zeros(len(QUALITIES), dtype=np.float64)
        root_probabilities[ROOTS.index(root)] = 0.9
        quality_probabilities[QUALITIES.index(quality)] = 0.8
        return SolititoPrediction(
            **prediction_kwargs(chord_id, root_probabilities, quality_probabilities, confidence=confidence),
        )


def prediction_kwargs(
    chord_id: str,
    root_probabilities: np.ndarray,
    quality_probabilities: np.ndarray,
    *,
    confidence: float = 0.72,
):
    root, quality = chord_root_quality(chord_id)
    return {
        "predicted_chord_id": chord_id,
        "root": root,
        "quality": quality,
        "confidence": confidence,
        "root_confidence": 0.9,
        "quality_confidence": 0.8,
        "root_probabilities": root_probabilities,
        "quality_probabilities": quality_probabilities,
        "frame_count": 32,
        "frames_used": 1,
        "top_k": top_product_predictions(root_probabilities, quality_probabilities),
    }


def chord_root_quality(chord_id: str) -> tuple[str, str]:
    if chord_id.endswith("m"):
        return chord_id[:-1], "m"
    if chord_id.endswith("7"):
        return chord_id[:-1], "7"
    return chord_id, ""


def wav_bytes(duration_sec: float = 0.1) -> bytes:
    output = BytesIO()
    samples = np.zeros(max(1, int(16_000 * duration_sec)), dtype=np.float32)
    wavfile.write(output, 16_000, samples)
    return output.getvalue()


def sine_wav_bytes(*, hz: float, duration_sec: float) -> bytes:
    output = BytesIO()
    sample_rate = 16_000
    t = np.arange(max(1, int(sample_rate * duration_sec)), dtype=np.float64) / sample_rate
    samples = (0.35 * np.sin(2 * np.pi * hz * t)).astype(np.float32)
    wavfile.write(output, sample_rate, samples)
    return output.getvalue()
