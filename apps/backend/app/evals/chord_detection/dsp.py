from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

import numpy as np
from numpy.typing import NDArray
from scipy.io import wavfile

from .catalog import CHORDS, CHORDS_BY_ID, ChordDef
from .config import CAPTURE_CONFIG, load_thresholds


@dataclass(frozen=True)
class DecodedAudio:
    sample_rate: int
    samples: NDArray[np.float64]


@dataclass
class ChromaFrame:
    t: float
    rms: float
    chroma: NDArray[np.float64]


class ChromaExtractor:
    def __init__(
        self,
        sample_rate: int,
        fft_size: int,
        min_hz: float = 70,
        max_hz: float = 2000,
        sigma: float = 0.5,
        harmonics: int = 6,
        harmonic_rolloff: float = 2.4,
        whitening_bins: int = 12,
    ) -> None:
        self.bin_count = fft_size // 2 + 1
        self.whitening_bins = whitening_bins
        self.whitening_kernel = np.ones(2 * whitening_bins + 1, dtype=np.float64)
        self.weights = np.zeros((self.bin_count, 12), dtype=np.float64)
        for index in range(self.bin_count):
            hz = index * sample_rate / fft_size
            if hz < min_hz or hz > max_hz:
                continue
            midi_float = 12 * np.log2(hz / 440) + 69
            harmonic_weight_total = 0.0
            for harmonic in range(1, harmonics + 1):
                fundamental_midi = midi_float - 12 * np.log2(harmonic)
                pc_float = fundamental_midi % 12
                harmonic_weight = 4 if harmonic == 1 else harmonic ** -harmonic_rolloff
                harmonic_weight_total += harmonic_weight
                for pc in range(12):
                    delta = ((pc_float - pc + 6) % 12) - 6
                    self.weights[index, pc] += harmonic_weight * np.exp(
                        -(delta * delta) / (2 * sigma * sigma)
                    )
            if harmonic_weight_total > 0:
                self.weights[index, :] /= harmonic_weight_total

    def compute(self, mag: NDArray[np.float64]) -> NDArray[np.float64]:
        spectrum = self._prepare_spectrum(mag)
        chroma = spectrum @ self.weights
        norm = np.linalg.norm(chroma)
        return chroma / norm if norm > 1e-6 else chroma

    def _prepare_spectrum(self, mag: NDArray[np.float64]) -> NDArray[np.float64]:
        mag = mag[: self.bin_count]
        positive = mag > 0
        local_sum = np.convolve(np.where(positive, mag, 0), self.whitening_kernel, mode="same")
        local_count = np.convolve(positive.astype(np.float64), self.whitening_kernel, mode="same")
        local_mean = np.divide(
            local_sum,
            local_count,
            out=np.zeros_like(local_sum),
            where=local_count > 0,
        )
        ratio = np.divide(mag, local_mean, out=np.zeros_like(mag), where=local_mean > 0)
        whitened = np.maximum(0, np.log1p(ratio) - np.log(2))
        fallback = np.log1p(mag)
        whitened = np.where((local_mean > 0) & positive, whitened, np.where(positive, fallback, 0))
        whitened[0] = 0
        return whitened


class OnsetDetector:
    def __init__(self, bins: int, hop_ms: float) -> None:
        self.bins = bins
        self.prev: NDArray[np.float64] | None = None
        self.history: list[float] = []
        self.history_len = max(4, int(400 / max(1, hop_ms)))
        self.min_gap = max(1, int(80 / max(1, hop_ms)))
        self.cooldown = 0

    def process(self, mag: NDArray[np.float64]) -> tuple[bool, float]:
        flux = 0.0
        if self.prev is not None:
            diff = mag[: self.bins] - self.prev[: self.bins]
            flux = float(diff[diff > 0].sum())
        self.prev = mag.copy()
        self.history.append(flux)
        if len(self.history) > self.history_len:
            self.history.pop(0)
        sorted_history = np.sort(np.asarray(self.history, dtype=np.float64))
        median = float(np.median(sorted_history)) if sorted_history.size > 0 else 0.0
        mad = float(np.median(np.abs(sorted_history - median))) if sorted_history.size > 0 else 0.0
        threshold = median + 2.5 * mad + 1e-3
        if self.cooldown > 0:
            self.cooldown -= 1
        onset = self.cooldown == 0 and flux > threshold and flux > 0.05
        if onset:
            self.cooldown = self.min_gap
        return onset, flux


def decode_wav_file(file_path: str) -> DecodedAudio:
    sample_rate, data = wavfile.read(file_path)
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


def analyze_chord_capture(audio: DecodedAudio, segment_start_sec: float, segment_end_sec: float) -> dict:
    fft_size = int(CAPTURE_CONFIG["fftSize"])
    hop_size = int(CAPTURE_CONFIG["hopSize"])
    extractor = get_chroma_extractor(audio.sample_rate, fft_size)
    hann = get_hann(fft_size)
    hop_ms = hop_size / audio.sample_rate * 1000
    onset = OnsetDetector(fft_size // 2 + 1, hop_ms)
    segment_start = max(0.0, segment_start_sec)
    audio_end_sec = len(audio.samples) / audio.sample_rate
    segment_end = min(max(segment_end_sec, segment_start), audio_end_sec)
    scan_start_sec = max(0.0, segment_start - float(CAPTURE_CONFIG["onsetLookbackMs"]) / 1000)
    scan_start_sample = max(fft_size, int(np.floor(scan_start_sec * audio.sample_rate)))
    scan_end_sample = min(len(audio.samples), int(np.ceil(segment_end * audio.sample_rate)))
    frames: list[ChromaFrame] = []
    onset_sec: float | None = None

    for window_end in range(scan_start_sample, scan_end_sample + 1, hop_size):
        window_start = window_end - fft_size
        if window_start < 0:
            continue
        window = audio.samples[window_start:window_end].copy()
        window *= hann
        mag = np.abs(np.fft.rfft(window))
        t = window_end / audio.sample_rate
        onset_detected, _ = onset.process(mag)
        if onset_sec is None and segment_start <= t <= segment_end and onset_detected:
            onset_sec = t
        rms = window_rms(audio.samples, window_start, window_end)
        if rms > float(CAPTURE_CONFIG["rmsThreshold"]):
            frames.append(ChromaFrame(t=t, rms=rms, chroma=extractor.compute(mag)))

    strategy = "onset" if onset_sec is not None else "midpoint"
    capture_start_sec = onset_sec or max(segment_start, segment_start + (segment_end - segment_start) / 2)
    capture_end_sec = min(segment_end, capture_start_sec + float(CAPTURE_CONFIG["captureMs"]) / 1000)
    capture_frames = [frame for frame in frames if capture_start_sec <= frame.t <= capture_end_sec]
    capture_strategy = strategy
    if len(capture_frames) == 0:
        capture_frames = [frame for frame in frames if segment_start <= frame.t <= segment_end]
        capture_strategy = "fallback"
    aggregate = aggregate_chroma_frames(capture_frames)
    return {
        "chroma": aggregate["avgChroma"].tolist(),
        "hasSignal": aggregate["hasSignal"],
        "captureStartSec": capture_start_sec,
        "captureEndSec": capture_end_sec,
        "captureStrategy": capture_strategy,
        "onsetSec": onset_sec,
        "chromaFrames": len(capture_frames),
        "chromaFramesUsed": aggregate["framesUsed"],
    }


def aggregate_chroma_frames(frames: list[ChromaFrame]) -> dict:
    avg_chroma = np.zeros(12, dtype=np.float64)
    if len(frames) == 0:
        return {"avgChroma": avg_chroma, "hasSignal": False, "framesReceived": 0, "framesUsed": 0}
    first_t = min(frame.t for frame in frames)
    transient_skip_sec = float(CAPTURE_CONFIG["transientSkipMs"]) / 1000
    candidates = [frame for frame in frames if frame.t - first_t >= transient_skip_sec]
    if len(candidates) < min(2, len(frames)):
        candidates = list(frames)
    if len(candidates) >= 4:
        by_rms = sorted(candidates, key=lambda frame: frame.rms)
        trim = int(len(by_rms) * float(CAPTURE_CONFIG["trimRatio"]))
        candidates = by_rms[trim : len(by_rms) - trim] or by_rms
    total_weight = 0.0
    for frame in candidates:
        weight = max(1e-5, frame.rms * frame.rms)
        total_weight += weight
        avg_chroma += frame.chroma * weight
    if total_weight <= 0:
        return {"avgChroma": avg_chroma, "hasSignal": False, "framesReceived": len(frames), "framesUsed": 0}
    avg_chroma /= total_weight
    norm = np.linalg.norm(avg_chroma)
    if norm <= 1e-8:
        return {"avgChroma": avg_chroma, "hasSignal": False, "framesReceived": len(frames), "framesUsed": 0}
    return {
        "avgChroma": avg_chroma / norm,
        "hasSignal": True,
        "framesReceived": len(frames),
        "framesUsed": len(candidates),
    }


def match_chord(captured_chroma: NDArray[np.float64], expected: ChordDef | None = None) -> dict:
    scored = sorted(
        ((chord, cosine_similarity(captured_chroma, chord.chroma)) for chord in CHORDS),
        key=lambda item: item[1],
        reverse=True,
    )
    best_chord, best_sim = scored[0]
    runner_up = scored[1] if len(scored) > 1 else None
    return {
        "chord": best_chord,
        "similarity": best_sim,
        "runnerUp": runner_up,
        "sameFamily": expected is not None and best_chord.root == expected.root,
    }


def verify_chord(captured_chroma: NDArray[np.float64], expected: ChordDef) -> dict:
    thresholds = load_thresholds()
    threshold = thresholds["perChord"].get(expected.id, thresholds["default"])
    expected_similarity = cosine_similarity(captured_chroma, expected.chroma)
    alternatives = [chord for chord in CHORDS if chord.id != expected.id]
    best_alternative = max(alternatives, key=lambda chord: cosine_similarity(captured_chroma, chord.chroma))
    alternative_similarity = cosine_similarity(captured_chroma, best_alternative.chroma)
    margin = expected_similarity - alternative_similarity
    accepted = (
        expected_similarity >= threshold["acceptSimilarity"]
        and margin >= threshold["acceptMargin"]
    )
    rejected = (
        not accepted
        and alternative_similarity >= threshold["rejectAlternativeSimilarity"]
        and alternative_similarity - expected_similarity >= threshold["rejectMargin"]
    )
    status = "accepted" if accepted else "rejected" if rejected else "uncertain"
    return {
        "status": status,
        "expectedChordId": expected.id,
        "acceptedChordId": expected.id if accepted else None,
        "bestAlternativeChordId": best_alternative.id,
        "expectedSimilarity": expected_similarity,
        "alternativeSimilarity": alternative_similarity,
        "margin": margin,
        "confidence": confidence_for(
            accepted=accepted,
            rejected=rejected,
            expected_similarity=expected_similarity,
            alternative_similarity=alternative_similarity,
            margin=margin,
            threshold=threshold,
        ),
    }


def uncertain_trial(expected_chord_id: str) -> dict:
    return {
        "status": "uncertain",
        "expectedChordId": expected_chord_id,
        "acceptedChordId": None,
        "bestAlternativeChordId": None,
        "expectedSimilarity": 0,
        "alternativeSimilarity": None,
        "margin": 0,
        "confidence": 0,
    }


def cosine_similarity(a: NDArray[np.float64], b: NDArray[np.float64]) -> float:
    denom = float(np.linalg.norm(a) * np.linalg.norm(b))
    return float(np.dot(a, b) / denom) if denom > 1e-8 else 0.0


def confidence_for(
    *,
    accepted: bool,
    rejected: bool,
    expected_similarity: float,
    alternative_similarity: float,
    margin: float,
    threshold: dict,
) -> float:
    if accepted:
        sim_headroom = expected_similarity - threshold["acceptSimilarity"]
        margin_headroom = margin - threshold["acceptMargin"]
        return clamp01(0.55 + sim_headroom * 1.2 + margin_headroom * 2.5)
    if rejected:
        alternative_lead = alternative_similarity - expected_similarity
        return clamp01(
            0.5
            + (alternative_similarity - threshold["rejectAlternativeSimilarity"]) * 1.2
            + (alternative_lead - threshold["rejectMargin"]) * 2
        )
    similarity_closeness = (
        expected_similarity / threshold["acceptSimilarity"]
        if threshold["acceptSimilarity"] > 0
        else 0
    )
    return clamp01(0.5 * similarity_closeness + max(0.0, margin) * 0.5)


def clamp01(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def window_rms(samples: NDArray[np.float64], start: int, end: int) -> float:
    window = samples[start:end]
    if window.size == 0:
        return 0.0
    return float(np.sqrt(np.mean(window * window)))


def chord_by_id(chord_id: str) -> ChordDef:
    return CHORDS_BY_ID[chord_id]


@lru_cache(maxsize=8)
def get_chroma_extractor(sample_rate: int, fft_size: int) -> ChromaExtractor:
    return ChromaExtractor(
        sample_rate=sample_rate,
        fft_size=fft_size,
        min_hz=float(CAPTURE_CONFIG["minHz"]),
        max_hz=float(CAPTURE_CONFIG["maxHz"]),
    )


@lru_cache(maxsize=8)
def get_hann(fft_size: int) -> NDArray[np.float64]:
    return np.hanning(fft_size)
