from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np
from numpy.typing import NDArray
from scipy import signal

from app.evals.chord_detection.catalog import CHORDS, CHORDS_BY_ID, ChordDef
from app.evals.chord_detection.dsp import DecodedAudio, clamp01, decode_wav_file

from .solitito_assets import (
    DSP_WEIGHTS_FILENAME,
    MODEL_FILENAME,
    MODEL_ID,
    MODEL_REVISION,
    ensure_solitito_assets,
    solitito_asset_paths,
)

TARGET_SR = 16_000
FFT_SIZE = 8192
HOP_LENGTH = 256
CQT_BINS = 144
CHROMA_BINS = 12
FEATURE_SIZE = CQT_BINS + CHROMA_BINS
CTX_FRAMES = 32
MIN_REF_LEVEL = 0.02
SILENCE_THRESHOLD = 0.02
PREDICTION_STRIDE = 4
ACCEPT_CONFIDENCE = 0.35
REJECT_CONFIDENCE = 0.45

ROOTS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B", "Noise"]
QUALITIES = ["", "m", "7", "Maj7", "m7", "dim7", "m7b5", "9", "13", "Note"]

SUPPORTED_QUALITY_BY_CHORD_QUALITY = {
    "major": "",
    "minor": "m",
    "dom7": "7",
}


@dataclass(frozen=True)
class SolititoPrediction:
    predicted_chord_id: str | None
    root: str
    quality: str
    confidence: float
    root_confidence: float
    quality_confidence: float
    root_probabilities: NDArray[np.float64]
    quality_probabilities: NDArray[np.float64]
    frame_count: int
    frames_used: int
    top_k: list[dict[str, float | str | None]]


@dataclass(frozen=True)
class SolititoAudioAnalysis:
    features: NDArray[np.float32]
    energy: NDArray[np.float64]
    frame_times_sec: NDArray[np.float64]


class SolititoChordDetector:
    def __init__(self, *, cache_root: Path | None = None) -> None:
        ensure_solitito_assets(cache_root)
        paths = solitito_asset_paths(cache_root)
        self.extractor = SolititoFeatureExtractor(paths[DSP_WEIGHTS_FILENAME])
        self.session = create_onnx_session(paths[MODEL_FILENAME])
        self.input_name = self.session.get_inputs()[0].name

    def analyze_audio(self, audio: DecodedAudio) -> SolititoAudioAnalysis:
        return self.extractor.analyze(audio)

    def predict_segment(
        self,
        analysis: SolititoAudioAnalysis,
        *,
        start_sec: float,
        end_sec: float,
    ) -> SolititoPrediction:
        windows = self._segment_windows(analysis, start_sec=start_sec, end_sec=end_sec)
        if len(windows) == 0:
            zero_roots = np.zeros(len(ROOTS), dtype=np.float64)
            zero_qualities = np.zeros(len(QUALITIES), dtype=np.float64)
            return SolititoPrediction(
                predicted_chord_id=None,
                root="Noise",
                quality="",
                confidence=0.0,
                root_confidence=0.0,
                quality_confidence=0.0,
                root_probabilities=zero_roots,
                quality_probabilities=zero_qualities,
                frame_count=int(analysis.features.shape[0]),
                frames_used=0,
                top_k=[],
            )

        root_sum = np.zeros(len(ROOTS), dtype=np.float64)
        quality_sum = np.zeros(len(QUALITIES), dtype=np.float64)
        weight_sum = 0.0
        for window_start, weight in windows:
            window = analysis.features[window_start : window_start + CTX_FRAMES]
            root_logits, quality_logits = self._run_window(window)
            root_probs = softmax(root_logits)
            quality_probs = softmax(quality_logits)
            root_sum += root_probs * weight
            quality_sum += quality_probs * weight
            weight_sum += weight

        if weight_sum <= 0:
            weight_sum = float(len(windows))
        root_probs = root_sum / weight_sum
        quality_probs = quality_sum / weight_sum
        root_index = int(np.argmax(root_probs))
        quality_index = int(np.argmax(quality_probs))
        root = ROOTS[root_index]
        quality = QUALITIES[quality_index]
        root_confidence = float(root_probs[root_index])
        quality_confidence = float(quality_probs[quality_index])
        top_k = top_product_predictions(root_probs, quality_probs)
        predicted_chord_id = str(top_k[0]["chordId"]) if top_k else None
        confidence = float(top_k[0]["confidence"]) if top_k else 0.0
        return SolititoPrediction(
            predicted_chord_id=predicted_chord_id,
            root=root,
            quality=quality,
            confidence=confidence,
            root_confidence=root_confidence,
            quality_confidence=quality_confidence,
            root_probabilities=root_probs,
            quality_probabilities=quality_probs,
            frame_count=int(analysis.features.shape[0]),
            frames_used=len(windows),
            top_k=top_k,
        )

    def _segment_windows(
        self,
        analysis: SolititoAudioAnalysis,
        *,
        start_sec: float,
        end_sec: float,
    ) -> list[tuple[int, float]]:
        features = analysis.features
        if features.shape[0] < CTX_FRAMES:
            return []
        max_start = features.shape[0] - CTX_FRAMES
        window_starts = np.arange(0, max_start + 1, PREDICTION_STRIDE)
        centers = (window_starts + CTX_FRAMES // 2) * HOP_LENGTH / TARGET_SR
        selected = window_starts[(centers >= start_sec) & (centers <= end_sec)]
        if selected.size == 0:
            midpoint = start_sec + max(0.0, end_sec - start_sec) / 2
            center_index = int(round(midpoint * TARGET_SR / HOP_LENGTH - CTX_FRAMES / 2))
            selected = np.asarray([min(max(center_index, 0), max_start)], dtype=np.int64)

        out: list[tuple[int, float]] = []
        for window_start in selected:
            energy = float(np.mean(analysis.energy[window_start : window_start + CTX_FRAMES]))
            if energy < SILENCE_THRESHOLD:
                continue
            out.append((int(window_start), max(1e-4, energy)))
        if len(out) == 0 and selected.size > 0:
            window_start = int(selected[len(selected) // 2])
            out.append((window_start, 1e-4))
        return out

    def _run_window(self, window: NDArray[np.float32]) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
        outputs = self.session.run(None, {self.input_name: window[np.newaxis, :, :].astype(np.float32)})
        return np.asarray(outputs[0][0], dtype=np.float64), np.asarray(outputs[1][0], dtype=np.float64)


class SolititoFeatureExtractor:
    def __init__(self, dsp_weights_path: Path) -> None:
        data = load_dsp_weights(dsp_weights_path)
        self.cqt_weights = np.asarray(data["cqt_weights_re"], dtype=np.float32).reshape(
            FFT_SIZE // 2 + 1, CQT_BINS
        ) + 1j * np.asarray(data["cqt_weights_im"], dtype=np.float32).reshape(
            FFT_SIZE // 2 + 1, CQT_BINS
        )
        self.chroma_weights = np.asarray(data["chroma_weights"], dtype=np.float32).reshape(
            CQT_BINS, CHROMA_BINS
        )
        self.hann = np.hanning(FFT_SIZE).astype(np.float32)

    def analyze(self, audio: DecodedAudio) -> SolititoAudioAnalysis:
        samples = resample_audio(audio.samples, audio.sample_rate)
        if samples.size < FFT_SIZE:
            samples = np.pad(samples, (0, FFT_SIZE - samples.size))
        frame_count = max(0, 1 + (samples.size - FFT_SIZE) // HOP_LENGTH)
        features = np.zeros((frame_count, FEATURE_SIZE), dtype=np.float32)
        energy = np.zeros(frame_count, dtype=np.float64)
        running_ref = 0.05

        for frame_index in range(frame_count):
            start = frame_index * HOP_LENGTH
            frame = samples[start : start + FFT_SIZE]
            rms = float(np.sqrt(np.mean(frame * frame))) if frame.size > 0 else 0.0
            energy[frame_index] = rms
            cqt = self.compute_cqt(frame)
            cqt[:28] *= 0.1
            frame_max = float(np.max(cqt)) if cqt.size > 0 else 0.0
            if frame_max > running_ref:
                running_ref = running_ref * 0.5 + frame_max * 0.5
            else:
                running_ref = running_ref * 0.995 + frame_max * 0.005
            cqt_norm = normalize_cqt(cqt, max(running_ref, MIN_REF_LEVEL))
            chroma = cqt_norm @ self.chroma_weights
            chroma_max = max(float(np.max(chroma)), 1e-9)
            chroma = chroma / chroma_max
            features[frame_index, :CQT_BINS] = cqt_norm.astype(np.float32)
            features[frame_index, CQT_BINS:] = chroma.astype(np.float32)

        if energy.size > 0 and np.max(energy) > 0:
            energy = energy / np.max(energy)
        frame_times = np.arange(frame_count, dtype=np.float64) * HOP_LENGTH / TARGET_SR
        return SolititoAudioAnalysis(features=features, energy=energy, frame_times_sec=frame_times)

    def compute_cqt(self, frame: NDArray[np.float64]) -> NDArray[np.float32]:
        if frame.shape[0] != FFT_SIZE:
            frame = np.pad(frame, (0, max(0, FFT_SIZE - frame.shape[0])))[:FFT_SIZE]
        spectrum = np.fft.rfft(frame.astype(np.float32) * self.hann)
        return np.abs(spectrum @ self.cqt_weights).astype(np.float32)


def verify_prediction(prediction: SolititoPrediction, expected: ChordDef) -> dict:
    expected_probability = expected_probability_for(prediction, expected)
    best_alternative = best_alternative_for(prediction, expected)
    alternative_probability = best_alternative[1] if best_alternative else None
    accepted = (
        prediction.predicted_chord_id == expected.id
        and expected_probability >= ACCEPT_CONFIDENCE
        and supported_expected(expected)
    )
    rejected = (
        not accepted
        and prediction.predicted_chord_id is not None
        and prediction.predicted_chord_id != expected.id
        and prediction.confidence >= REJECT_CONFIDENCE
    )
    margin = expected_probability - (alternative_probability or 0.0)
    return {
        "status": "accepted" if accepted else "rejected" if rejected else "uncertain",
        "expectedChordId": expected.id,
        "acceptedChordId": expected.id if accepted else None,
        "bestAlternativeChordId": best_alternative[0] if best_alternative else prediction.predicted_chord_id,
        "expectedSimilarity": expected_probability,
        "alternativeSimilarity": alternative_probability,
        "margin": margin,
        "confidence": confidence_for_prediction(
            accepted=accepted,
            rejected=rejected,
            expected_probability=expected_probability,
            prediction_confidence=prediction.confidence,
            margin=margin,
        ),
    }


def solitito_match(prediction: SolititoPrediction, expected: ChordDef | None = None) -> dict:
    chord = CHORDS_BY_ID.get(prediction.predicted_chord_id or "")
    alternatives = [
        (CHORDS_BY_ID[item["chordId"]], float(item["confidence"]))
        for item in prediction.top_k
        if item["chordId"] in CHORDS_BY_ID and item["chordId"] != prediction.predicted_chord_id
    ]
    runner_up = alternatives[0] if alternatives else None
    return {
        "chord": chord,
        "similarity": prediction.confidence,
        "runnerUp": runner_up,
        "sameFamily": expected is not None and chord is not None and chord.root == expected.root,
    }


def analyze_wav_file(file_path: str, *, cache_root: Path | None = None) -> tuple[SolititoChordDetector, SolititoAudioAnalysis]:
    detector = SolititoChordDetector(cache_root=cache_root)
    return detector, detector.analyze_audio(decode_wav_file(file_path))


def product_chord_id(root: str, quality: str) -> str | None:
    if root == "Noise" or quality == "Note":
        return None
    suffix = {"": "", "m": "m", "7": "7"}.get(quality)
    if suffix is None:
        return None
    chord_id = f"{root}{suffix}"
    return chord_id if chord_id in CHORDS_BY_ID else None


def expected_probability_for(prediction: SolititoPrediction, expected: ChordDef) -> float:
    quality = SUPPORTED_QUALITY_BY_CHORD_QUALITY.get(expected.quality)
    if quality is None:
        return 0.0
    root_index = ROOTS.index(expected.root)
    quality_index = QUALITIES.index(quality)
    return float(prediction.root_probabilities[root_index] * prediction.quality_probabilities[quality_index])


def best_alternative_for(prediction: SolititoPrediction, expected: ChordDef) -> tuple[str, float] | None:
    alternatives = [
        (str(item["chordId"]), float(item["confidence"]))
        for item in prediction.top_k
        if item["chordId"] in CHORDS_BY_ID and item["chordId"] != expected.id
    ]
    return alternatives[0] if alternatives else None


def supported_expected(expected: ChordDef) -> bool:
    return expected.quality in SUPPORTED_QUALITY_BY_CHORD_QUALITY


def top_product_predictions(
    root_probabilities: NDArray[np.float64],
    quality_probabilities: NDArray[np.float64],
    *,
    limit: int = 5,
) -> list[dict[str, float | str | None]]:
    items: list[dict[str, float | str | None]] = []
    for root_index, root in enumerate(ROOTS):
        for quality_index, quality in enumerate(QUALITIES):
            chord_id = product_chord_id(root, quality)
            if chord_id is None:
                continue
            confidence = float(root_probabilities[root_index] * quality_probabilities[quality_index])
            items.append(
                {
                    "chordId": chord_id,
                    "root": root,
                    "quality": quality,
                    "confidence": confidence,
                }
            )
    return sorted(items, key=lambda item: float(item["confidence"]), reverse=True)[:limit]


def confidence_for_prediction(
    *,
    accepted: bool,
    rejected: bool,
    expected_probability: float,
    prediction_confidence: float,
    margin: float,
) -> float:
    if accepted:
        return clamp01(0.55 + (expected_probability - ACCEPT_CONFIDENCE) * 1.2 + max(0.0, margin) * 0.8)
    if rejected:
        return clamp01(0.5 + (prediction_confidence - REJECT_CONFIDENCE) * 1.4)
    return clamp01(expected_probability / ACCEPT_CONFIDENCE * 0.4 if ACCEPT_CONFIDENCE > 0 else 0.0)


def normalize_cqt(cqt: NDArray[np.float32], reference: float) -> NDArray[np.float32]:
    values = np.maximum(cqt, 1e-12)
    db = 20.0 * np.log10(values / reference)
    norm = np.clip((db + 80.0) / 80.0, 0.0, 1.0)
    norm = np.where(norm < 0.20, 0.0, (norm - 0.20) / 0.80)
    return norm.astype(np.float32)


def resample_audio(samples: NDArray[np.float64], sample_rate: int) -> NDArray[np.float64]:
    if sample_rate == TARGET_SR:
        return samples.astype(np.float64)
    gcd = int(np.gcd(sample_rate, TARGET_SR))
    up = TARGET_SR // gcd
    down = sample_rate // gcd
    return signal.resample_poly(samples, up, down).astype(np.float64)


def softmax(logits: NDArray[np.float64]) -> NDArray[np.float64]:
    shifted = logits - np.max(logits)
    exp = np.exp(shifted)
    total = float(np.sum(exp))
    return exp / total if total > 0 else np.zeros_like(logits)


def create_onnx_session(model_path: Path) -> Any:
    try:
        import onnxruntime as ort
    except ImportError as err:
        raise RuntimeError(
            "onnxruntime is required for the Solitito detector. "
            'Install backend dependencies with python3 -m pip install -e ".[dev]".'
        ) from err
    return ort.InferenceSession(str(model_path), providers=["CPUExecutionProvider"])


@lru_cache(maxsize=2)
def load_dsp_weights(path: Path) -> dict[str, Any]:
    import json

    return json.loads(path.read_text())


def model_metadata() -> dict[str, str]:
    return {
        "detector": "solitito",
        "modelId": MODEL_ID,
        "modelRevision": MODEL_REVISION,
        "modelFilename": MODEL_FILENAME,
    }
