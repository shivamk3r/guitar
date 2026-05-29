import json
import logging
import time
from functools import lru_cache
from io import BytesIO
from typing import Any

import numpy as np
from scipy.io import wavfile
from sqlalchemy.orm import Session

from . import models
from .chord_detection.solitito import (
    SolititoChordDetector,
    model_metadata,
    solitito_match,
    verify_prediction,
)
from .config import get_settings
from .database import SessionLocal, init_db
from .evals.chord_detection.catalog import CHORDS_BY_ID
from .evals.chord_detection.dsp import DecodedAudio
from .queue import AnalysisQueue
from .storage import ObjectStorage

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("guitar.worker")


def complete_job(
    db: Session,
    job_id: str,
    recording_id: str,
    *,
    storage: ObjectStorage | None = None,
    chord_detector: SolititoChordDetector | None = None,
) -> None:
    job = db.get(models.AnalysisJob, job_id)
    recording = db.get(models.AudioRecording, recording_id)
    if job is None or recording is None:
        logger.warning("Skipping unknown analysis job=%s recording=%s", job_id, recording_id)
        return

    job.status = "running"
    job.started_at = models.utcnow()
    db.commit()

    analysis = analyze_recording(recording, storage=storage, chord_detector=chord_detector)
    result = models.AnalysisResult(
        job_id=job.id,
        recording_id=recording.id,
        metrics=analysis["metrics"],
        guidance=analysis["guidance"],
    )
    db.add(result)
    job.status = "completed"
    job.completed_at = models.utcnow()
    db.commit()


def handle_message(message: dict[str, Any], queue: AnalysisQueue) -> None:
    payload = json.loads(message["Body"])
    with SessionLocal() as db:
        complete_job(db, job_id=payload["job_id"], recording_id=payload["recording_id"])
    queue.client.delete_message(QueueUrl=queue.queue_url, ReceiptHandle=message["ReceiptHandle"])


def analyze_recording(
    recording: models.AudioRecording,
    *,
    storage: ObjectStorage | None = None,
    chord_detector: SolititoChordDetector | None = None,
) -> dict[str, Any]:
    if recording.session.activity_type == "chord_check":
        return analyze_chord_check_recording(recording, storage=storage, chord_detector=chord_detector)
    return placeholder_analysis(recording)


def analyze_chord_check_recording(
    recording: models.AudioRecording,
    *,
    storage: ObjectStorage | None = None,
    chord_detector: SolititoChordDetector | None = None,
) -> dict[str, Any]:
    metadata = recording.session.client_metadata or {}
    expected_chord_id = metadata.get("chordId")
    if not isinstance(expected_chord_id, str) or expected_chord_id not in CHORDS_BY_ID:
        return {
            "metrics": {
                "placeholder": True,
                "activity": recording.session.activity_type,
                "size_bytes": recording.size_bytes,
                "analysisSkipped": True,
                "skipReason": "missing_or_unknown_chord_id",
            },
            "guidance": "Recording captured, but no supported target chord was available for analysis.",
        }
    if not is_wav_content_type(recording.content_type):
        return {
            "metrics": {
                "placeholder": True,
                "activity": recording.session.activity_type,
                "size_bytes": recording.size_bytes,
                "expectedChordId": expected_chord_id,
                "analysisSkipped": True,
                "skipReason": "unsupported_audio_content_type",
                "contentType": recording.content_type,
            },
            "guidance": "Recording captured. Chord analysis currently requires WAV recordings.",
        }

    storage = storage or ObjectStorage()
    detector = chord_detector or get_chord_detector()
    audio = decode_wav_bytes(storage.get_recording(recording.object_key))
    duration_sec = len(audio.samples) / audio.sample_rate if audio.sample_rate > 0 else 0.0
    expected = CHORDS_BY_ID[expected_chord_id]
    analysis = detector.analyze_audio(audio)
    prediction = detector.predict_segment(analysis, start_sec=0.0, end_sec=duration_sec)
    match = solitito_match(prediction, expected)
    verifier = verify_prediction(prediction, expected)
    predicted_chord = match["chord"] if match else None
    runner_up = match["runnerUp"] if match else None
    runner_up_chord = runner_up[0] if runner_up else None
    runner_up_similarity = runner_up[1] if runner_up else None
    similarity = match["similarity"] if match else 0
    margin = similarity if runner_up_similarity is None else similarity - runner_up_similarity
    return {
        "metrics": {
            "placeholder": False,
            "activity": recording.session.activity_type,
            "size_bytes": recording.size_bytes,
            "contentType": recording.content_type,
            "durationSec": duration_sec,
            "detector": model_metadata(),
            "expectedChordId": expected.id,
            "predictedChordId": predicted_chord.id if predicted_chord else None,
            "similarity": similarity,
            "runnerUpChordId": runner_up_chord.id if runner_up_chord else None,
            "runnerUpSimilarity": runner_up_similarity,
            "margin": margin,
            "correct": predicted_chord is not None and predicted_chord.id == expected.id,
            "sameFamily": bool(match["sameFamily"]) if match else False,
            "verifierStatus": verifier["status"],
            "acceptedChordId": verifier["acceptedChordId"],
            "bestAlternativeChordId": verifier["bestAlternativeChordId"],
            "expectedSimilarity": verifier["expectedSimilarity"],
            "alternativeSimilarity": verifier["alternativeSimilarity"],
            "verifierMargin": verifier["margin"],
            "confidence": verifier["confidence"],
            "capture": {
                "hasSignal": prediction.frames_used > 0 and prediction.confidence > 0,
                "captureStartSec": 0.0,
                "captureEndSec": duration_sec,
                "captureStrategy": "solitito-window",
                "onsetSec": None,
                "chromaFrames": prediction.frame_count,
                "chromaFramesUsed": prediction.frames_used,
                "rawRoot": prediction.root,
                "rawQuality": prediction.quality,
                "rootConfidence": prediction.root_confidence,
                "qualityConfidence": prediction.quality_confidence,
                "topK": prediction.top_k,
            },
        },
        "guidance": chord_check_guidance(
            verifier["status"],
            expected.id,
            predicted_chord.id if predicted_chord else None,
        ),
    }


def placeholder_analysis(recording: models.AudioRecording) -> dict[str, Any]:
    return {
        "metrics": {
            "placeholder": True,
            "activity": recording.session.activity_type,
            "size_bytes": recording.size_bytes,
        },
        "guidance": "Recording captured. Detailed skill analysis will be added in a later milestone.",
    }


def chord_check_guidance(status: str, expected_chord_id: str, predicted_chord_id: str | None) -> str:
    if status == "accepted":
        return f"Chord check accepted for {expected_chord_id}."
    if predicted_chord_id:
        return f"Chord check did not match {expected_chord_id}; strongest estimate was {predicted_chord_id}."
    return f"Chord check for {expected_chord_id} was inconclusive."


def decode_wav_bytes(body: bytes) -> DecodedAudio:
    sample_rate, data = wavfile.read(BytesIO(body))
    samples = data.astype(np.float64)
    if samples.ndim == 2:
        samples = samples.mean(axis=1)
    if np.issubdtype(data.dtype, np.floating):
        samples = np.clip(samples, -1, 1)
    elif data.dtype == np.uint8:
        samples = (samples - 128) / 128
    else:
        max_value = float(2 ** (8 * data.dtype.itemsize - 1))
        samples = samples / max_value
    return DecodedAudio(sample_rate=sample_rate, samples=samples)


def is_wav_content_type(content_type: str) -> bool:
    return content_type.split(";")[0].strip().lower() in {"audio/wav", "audio/wave", "audio/x-wav"}


@lru_cache(maxsize=1)
def get_chord_detector() -> SolititoChordDetector:
    return SolititoChordDetector()


def run_forever() -> None:
    settings = get_settings()
    init_db()
    ObjectStorage(settings).ensure_bucket()
    queue = AnalysisQueue(settings)
    logger.info("Worker polling %s", queue.queue_url)
    while True:
        response = queue.client.receive_message(
            QueueUrl=queue.queue_url,
            MaxNumberOfMessages=5,
            WaitTimeSeconds=settings.worker_poll_seconds,
        )
        for message in response.get("Messages", []):
            try:
                handle_message(message, queue)
            except Exception:
                logger.exception("Failed to process analysis message")
        time.sleep(0.2)


if __name__ == "__main__":
    run_forever()
