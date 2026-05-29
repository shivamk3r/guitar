import json
import logging
import time
from datetime import datetime
from functools import lru_cache
from io import BytesIO
from typing import Any

import numpy as np
from scipy.io import wavfile
from sqlalchemy.orm import Session

from . import models
from .chord_detection.solitito import (
    SolititoChordDetector,
    SolititoPrediction,
    model_metadata,
    solitito_match,
    verify_prediction,
)
from .config import get_settings
from .database import SessionLocal, init_db
from .evals.chord_detection.catalog import CHORDS_BY_ID
from .evals.chord_detection.dsp import DecodedAudio
from .practice_score import build_practice_score_metrics
from .queue import AnalysisQueue
from .storage import ObjectStorage

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("guitar.worker")

PRACTICE_SEGMENT_LEAD_SEC = 0.08
PRACTICE_SEGMENT_MIN_SEC = 0.35
PRACTICE_SEGMENT_MAX_SEC = 0.9


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
    if recording.session.activity_type == "practice_drill":
        return analyze_practice_drill_recording(recording, storage=storage, chord_detector=chord_detector)
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
    prediction_metrics = chord_prediction_metrics(
        prediction,
        expected,
        capture_start_sec=0.0,
        capture_end_sec=duration_sec,
    )
    return {
        "metrics": {
            "placeholder": False,
            "activity": recording.session.activity_type,
            "size_bytes": recording.size_bytes,
            "contentType": recording.content_type,
            "durationSec": duration_sec,
            "detector": model_metadata(),
            **prediction_metrics,
        },
        "guidance": chord_check_guidance(
            prediction_metrics["verifierStatus"],
            expected.id,
            prediction_metrics["predictedChordId"],
        ),
    }


def analyze_practice_drill_recording(
    recording: models.AudioRecording,
    *,
    storage: ObjectStorage | None = None,
    chord_detector: SolititoChordDetector | None = None,
) -> dict[str, Any]:
    metadata = recording.session.client_metadata or {}
    practice_mode = string_value(metadata.get("practiceMode"))
    attempts = metadata.get("attempts")
    if not is_wav_content_type(recording.content_type):
        return skipped_analysis(
            recording,
            skip_reason="unsupported_audio_content_type",
            guidance="Recording captured. Backend practice chord analysis currently requires WAV recordings.",
            extra={"contentType": recording.content_type},
        )
    if not isinstance(attempts, list) or len(attempts) == 0:
        return skipped_analysis(
            recording,
            skip_reason="missing_attempts",
            guidance="Recording captured, but backend practice chord analysis needs saved chord attempts.",
        )

    storage = storage or ObjectStorage()
    detector = chord_detector or get_chord_detector()
    audio = decode_wav_bytes(storage.get_recording(recording.object_key))
    duration_sec = len(audio.samples) / audio.sample_rate if audio.sample_rate > 0 else 0.0
    analysis = detector.analyze_audio(audio)

    analyzed_attempts = []
    skipped_count = 0
    bpm = number_value(metadata.get("bpm"))
    beats_per_chord = first_number_value(metadata.get("beatsPerChord"), metadata.get("beatsPerChange"))
    count_in_beats = number_value(metadata.get("countInBeats")) or 0.0
    for index, item in enumerate(attempts):
        if not isinstance(item, dict):
            skipped_count += 1
            continue
        expected_chord_id = practice_attempt_chord_id(item)
        if expected_chord_id is None or expected_chord_id not in CHORDS_BY_ID:
            skipped_count += 1
            continue
        window = practice_attempt_window(
            item,
            recording=recording,
            metadata=metadata,
            duration_sec=duration_sec,
        )
        if window is None:
            skipped_count += 1
            continue
        start_sec, end_sec = window
        expected = CHORDS_BY_ID[expected_chord_id]
        prediction = detector.predict_segment(analysis, start_sec=start_sec, end_sec=end_sec)
        prediction_metrics = chord_prediction_metrics(
            prediction,
            expected,
            capture_start_sec=start_sec,
            capture_end_sec=end_sec,
        )
        capture = prediction_metrics["capture"]
        expected_index = int_value(item.get("expectedIndex"))
        analyzed_attempts.append(
            {
                "id": string_value(item.get("id")),
                "expectedIndex": expected_index if expected_index is not None else index,
                "expectedChordId": expected.id,
                "frontendDetectedChordId": string_value(item.get("detectedChordId")),
                "frontendScore": practice_attempt_score(item),
                "detectedAtBeat": number_value(item.get("detectedAtBeat")),
                "timingDeltaMs": number_value(item.get("timingDeltaMs")),
                "captureStartSec": start_sec,
                "captureEndSec": end_sec,
                "rawRoot": capture["rawRoot"],
                "rawQuality": capture["rawQuality"],
                "framesUsed": capture["chromaFramesUsed"],
                "topK": capture["topK"],
                **{key: value for key, value in prediction_metrics.items() if key != "capture"},
            }
        )

    if len(analyzed_attempts) == 0:
        if practice_mode == "strumming_drill":
            guidance = "Recording captured. Backend chord feedback is not available for strumming drills yet."
        else:
            guidance = "Recording captured, but no supported chord attempts were available for backend analysis."
        return skipped_analysis(
            recording,
            skip_reason="no_supported_chord_attempts",
            guidance=guidance,
            extra={
                "practiceMode": practice_mode,
                "attemptCount": len(attempts),
                "skippedCount": skipped_count,
            },
        )

    accepted_count = sum(1 for attempt in analyzed_attempts if attempt["verifierStatus"] == "accepted")
    rejected_count = sum(1 for attempt in analyzed_attempts if attempt["verifierStatus"] == "rejected")
    uncertain_count = sum(1 for attempt in analyzed_attempts if attempt["verifierStatus"] == "uncertain")
    score = build_practice_score_metrics(
        attempt_count=len(attempts),
        analyzed_attempt_count=len(analyzed_attempts),
        accepted_count=accepted_count,
        rejected_count=rejected_count,
        uncertain_count=uncertain_count,
    )
    confidences = [
        confidence
        for attempt in analyzed_attempts
        if isinstance(confidence := attempt.get("confidence"), (int, float))
    ]
    practice = {
        "mode": practice_mode,
        "bpm": bpm,
        "beatsPerChord": beats_per_chord,
        "countInBeats": count_in_beats,
        "attemptCount": len(attempts),
        "analyzedAttemptCount": len(analyzed_attempts),
        "acceptedCount": accepted_count,
        "rejectedCount": rejected_count,
        "uncertainCount": uncertain_count,
        "skippedCount": skipped_count,
        "score": score,
        "averageConfidence": float(np.mean(confidences)) if confidences else None,
        "attempts": analyzed_attempts,
    }
    return {
        "metrics": {
            "placeholder": False,
            "activity": recording.session.activity_type,
            "size_bytes": recording.size_bytes,
            "contentType": recording.content_type,
            "durationSec": duration_sec,
            "detector": model_metadata(),
            "practice": practice,
        },
        "guidance": practice_guidance(practice),
    }


def chord_prediction_metrics(
    prediction: SolititoPrediction,
    expected,
    *,
    capture_start_sec: float,
    capture_end_sec: float,
) -> dict[str, Any]:
    match = solitito_match(prediction, expected)
    verifier = verify_prediction(prediction, expected)
    predicted_chord = match["chord"] if match else None
    runner_up = match["runnerUp"] if match else None
    runner_up_chord = runner_up[0] if runner_up else None
    runner_up_similarity = runner_up[1] if runner_up else None
    similarity = match["similarity"] if match else 0
    margin = similarity if runner_up_similarity is None else similarity - runner_up_similarity
    return {
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
            "captureStartSec": capture_start_sec,
            "captureEndSec": capture_end_sec,
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
    }


def placeholder_analysis(recording: models.AudioRecording) -> dict[str, Any]:
    return {
        "metrics": {
            "placeholder": True,
            "activity": recording.session.activity_type,
            "size_bytes": recording.size_bytes,
        },
        "guidance": placeholder_guidance(recording),
    }


def skipped_analysis(
    recording: models.AudioRecording,
    *,
    skip_reason: str,
    guidance: str,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    metrics = {
        "placeholder": True,
        "activity": recording.session.activity_type,
        "size_bytes": recording.size_bytes,
        "analysisSkipped": True,
        "skipReason": skip_reason,
    }
    if extra:
        metrics.update(extra)
    return {"metrics": metrics, "guidance": guidance}


def placeholder_guidance(recording: models.AudioRecording) -> str:
    if recording.session.activity_type == "tuner":
        return "Recording captured. Backend analysis is not available for tuner recordings yet."
    return "Recording captured. Backend analysis is not available for this activity yet."


def practice_guidance(practice: dict[str, Any]) -> str:
    accepted = int(practice["acceptedCount"])
    rejected = int(practice["rejectedCount"])
    uncertain = int(practice["uncertainCount"])
    score = practice.get("score")
    score_value = score.get("value") if isinstance(score, dict) else None
    if not isinstance(score_value, (int, float)):
        score_value = 0.0
    return (
        f"Backend score {score_value:.0f}/100 · "
        f"{accepted} confirmed correct, {rejected} wrong, {uncertain} inconclusive."
    )


def practice_attempt_chord_id(attempt: dict[str, Any]) -> str | None:
    return first_string_value(attempt.get("chordId"), attempt.get("expectedChordId"))


def practice_attempt_score(attempt: dict[str, Any]) -> float | None:
    score = attempt.get("score")
    if isinstance(score, dict):
        return number_value(score.get("score"))
    return number_value(score)


def practice_attempt_window(
    attempt: dict[str, Any],
    *,
    recording: models.AudioRecording,
    metadata: dict,
    duration_sec: float,
) -> tuple[float, float] | None:
    bpm = first_number_value(attempt.get("bpm"), metadata.get("bpm"))
    if bpm is not None and bpm > 0:
        expected_beat = number_value(attempt.get("expectedBeat"))
        if expected_beat is not None:
            seconds_per_beat = 60.0 / bpm
            count_in_beats = number_value(metadata.get("countInBeats")) or 0.0
            beats_per_chord = first_number_value(
                metadata.get("beatsPerChord"),
                metadata.get("beatsPerChange"),
            )
            if beats_per_chord is None or beats_per_chord <= 0:
                beats_per_chord = 1.0
            detected_beat = number_value(attempt.get("detectedAtBeat"))
            timing_delta_ms = number_value(attempt.get("timingDeltaMs"))
            anchor_beat = detected_beat
            if anchor_beat is None and timing_delta_ms is not None:
                anchor_beat = expected_beat + timing_delta_ms / 1000.0 / seconds_per_beat
            if anchor_beat is None:
                anchor_beat = expected_beat

            slot_start = (count_in_beats + expected_beat) * seconds_per_beat
            slot_end = (count_in_beats + expected_beat + beats_per_chord) * seconds_per_beat
            anchor_sec = (count_in_beats + anchor_beat) * seconds_per_beat
            segment_duration = min(
                PRACTICE_SEGMENT_MAX_SEC,
                max(PRACTICE_SEGMENT_MIN_SEC, (slot_end - slot_start) * 0.6),
            )
            start_sec = max(0.0, max(slot_start - 0.25, anchor_sec - PRACTICE_SEGMENT_LEAD_SEC))
            end_sec = min(duration_sec, min(slot_end + 0.2, anchor_sec + segment_duration))
            if end_sec - start_sec < 0.2:
                end_sec = min(duration_sec, start_sec + PRACTICE_SEGMENT_MIN_SEC)
            if end_sec > start_sec:
                return start_sec, end_sec

    at_sec = seconds_from_recording_capture(recording, attempt.get("atIso"))
    if at_sec is None:
        return None
    start_sec = max(0.0, at_sec - 0.35)
    end_sec = min(duration_sec, start_sec + PRACTICE_SEGMENT_MAX_SEC)
    return (start_sec, end_sec) if end_sec > start_sec else None


def seconds_from_recording_capture(recording: models.AudioRecording, at_iso: object) -> float | None:
    if not isinstance(at_iso, str) or not at_iso:
        return None
    try:
        at = datetime.fromisoformat(at_iso.replace("Z", "+00:00"))
    except ValueError:
        return None
    captured_at = recording.captured_at
    if at.tzinfo is not None and captured_at.tzinfo is None:
        captured_at = captured_at.replace(tzinfo=at.tzinfo)
    if at.tzinfo is None and captured_at.tzinfo is not None:
        at = at.replace(tzinfo=captured_at.tzinfo)
    return (at - captured_at).total_seconds()


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


def first_string_value(*values: object) -> str | None:
    for value in values:
        parsed = string_value(value)
        if parsed is not None:
            return parsed
    return None


def string_value(value: object) -> str | None:
    return value if isinstance(value, str) and value else None


def first_number_value(*values: object) -> float | None:
    for value in values:
        parsed = number_value(value)
        if parsed is not None:
            return parsed
    return None


def number_value(value: object) -> float | None:
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def int_value(value: object) -> int | None:
    return int(value) if isinstance(value, int) and not isinstance(value, bool) else None


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
