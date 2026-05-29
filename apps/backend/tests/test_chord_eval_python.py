from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

import numpy as np
from scipy.io import wavfile

from app.evals.chord_detection.catalog import CHORDS_BY_ID, SUPPORTED_CHORD_ID_LIST
from app.evals.chord_detection.config import repo_root
from app.evals.chord_detection.dsp import (
    DecodedAudio,
    analyze_chord_capture,
    decode_wav_file,
    verify_chord,
)
from app.evals.chord_detection.metrics import compute_metrics
from app.evals.chord_detection.wcsr import compare_wcsr_variant
from app.chord_detection.solitito import (
    QUALITIES,
    ROOTS,
    SolititoPrediction,
    product_chord_id,
    top_product_predictions,
    verify_prediction,
)


def test_python_chord_catalog_matches_frontend_ids() -> None:
    frontend_chords = repo_root() / "apps" / "frontend" / "src" / "data" / "chords.ts"
    ids = sorted(set(re.findall(r'id: "([^"]+)"', frontend_chords.read_text())))
    assert ids == SUPPORTED_CHORD_ID_LIST


def test_decode_wav_file_converts_to_mono_float(tmp_path: Path) -> None:
    wav_path = tmp_path / "stereo.wav"
    data = np.asarray([[0, 16384], [32767, -32768]], dtype=np.int16)
    wavfile.write(wav_path, 48_000, data)

    decoded = decode_wav_file(str(wav_path))

    assert decoded.sample_rate == 48_000
    assert decoded.samples.shape == (2,)
    assert np.max(np.abs(decoded.samples)) <= 1


def test_feature_extraction_and_verifier_on_synthetic_chord() -> None:
    chord = CHORDS_BY_ID["C"]
    audio = DecodedAudio(sample_rate=48_000, samples=synth_strum(chord.played_midi))

    capture = analyze_chord_capture(audio, 0, len(audio.samples) / audio.sample_rate)
    result = verify_chord(np.asarray(capture["chroma"], dtype=np.float64), chord)

    assert capture["hasSignal"] is True
    assert result["expectedChordId"] == "C"
    assert result["expectedSimilarity"] > 0.55


def test_python_cli_writes_report_schema_for_fixture(tmp_path: Path) -> None:
    cache_root = tmp_path / "cache"
    wav_dir = cache_root / "datasets" / "isolated-guitar-chords" / "data" / "Test" / "C"
    wav_dir.mkdir(parents=True)
    wavfile.write(wav_dir / "c.wav", 48_000, synth_strum(CHORDS_BY_ID["C"].played_midi).astype(np.float32))

    completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "app.evals.chord_detection.cli",
            "--datasets",
            "isolated-guitar-chords",
            "--cache-root",
            str(cache_root),
            "--limit",
            "1",
            "--force",
        ],
        cwd=Path(__file__).resolve().parents[1],
        check=True,
        text=True,
        capture_output=True,
    )

    report_path = cache_root / "reports" / "python" / "latest.json"
    assert "Python chord detection eval complete" in completed.stdout
    assert report_path.exists()
    report_text = report_path.read_text()
    assert '"implementation": "python"' in report_text
    assert '"detector": "dsp"' in report_text
    assert '"wcsr"' in report_text


def test_python_metrics_duration_weight_wcsr() -> None:
    metrics = compute_metrics(
        [
            result("long", "A", "A", "accepted", 9),
            result("short", "D", "A", "rejected", 1),
        ]
    )

    summary = metrics["summary"]
    assert summary["accuracy"] == 0.5
    assert summary["verifierRecall"] == 0.5
    assert summary["totalDurationSec"] == 10
    assert summary["wcsr"]["exact"]["score"] == 0.9
    assert summary["verifierWeightedRecall"] == 0.9


def test_python_metrics_exclude_wcsr_out_of_gamut_duration() -> None:
    metrics = compute_metrics(
        [
            result("power", "E5", "E5", "accepted", 2),
            result("major", "A", "A", "accepted", 3),
        ]
    )

    summary = metrics["summary"]
    assert summary["wcsr"]["exact"]["score"] == 1
    assert summary["wcsr"]["majmin"]["score"] == 1
    assert summary["wcsr"]["majmin"]["validDurationSec"] == 3
    assert summary["wcsr"]["majmin"]["outOfGamutDurationSec"] == 2
    assert summary["wcsr"]["mirex"]["outOfGamutDurationSec"] == 2


def test_python_wcsr_compares_representative_mir_vocabularies() -> None:
    assert compare_wcsr_variant("A7", "Am", "root") == 1
    assert compare_wcsr_variant("A7", "A", "thirds") == 1
    assert compare_wcsr_variant("A7", "A", "triads") == 1
    assert compare_wcsr_variant("A7", "A", "tetrads") == 0
    assert compare_wcsr_variant("A7", "A7", "sevenths") == 1
    assert compare_wcsr_variant("E5", "E", "mirex") == -1


def test_solitito_product_adapter_limits_predictions_to_supported_chords() -> None:
    assert product_chord_id("C", "") == "C"
    assert product_chord_id("A", "m") == "Am"
    assert product_chord_id("G", "7") == "G7"
    assert product_chord_id("C", "Maj7") is None
    assert product_chord_id("Noise", "") is None

    root_probabilities = np.zeros(len(ROOTS), dtype=np.float64)
    quality_probabilities = np.zeros(len(QUALITIES), dtype=np.float64)
    root_probabilities[ROOTS.index("A")] = 0.8
    quality_probabilities[QUALITIES.index("m")] = 0.7
    quality_probabilities[QUALITIES.index("m7")] = 0.9

    top_k = top_product_predictions(root_probabilities, quality_probabilities)

    assert top_k[0]["chordId"] == "Am"
    assert abs(float(top_k[0]["confidence"]) - 0.56) < 1e-12


def test_solitito_verifier_uses_expected_product_probability() -> None:
    root_probabilities = np.zeros(len(ROOTS), dtype=np.float64)
    quality_probabilities = np.zeros(len(QUALITIES), dtype=np.float64)
    root_probabilities[ROOTS.index("D")] = 0.9
    quality_probabilities[QUALITIES.index("")] = 0.8
    prediction = SolititoPrediction(
        predicted_chord_id="D",
        root="D",
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

    result = verify_prediction(prediction, CHORDS_BY_ID["D"])

    assert result["status"] == "accepted"
    assert result["acceptedChordId"] == "D"


def synth_strum(midis: tuple[int | None, ...], sample_rate: int = 48_000, seconds: float = 1.0) -> np.ndarray:
    total = int(sample_rate * seconds)
    output = np.zeros(total, dtype=np.float64)
    offset = 0.0
    for midi in midis:
        if midi is None:
            continue
        hz = 440 * 2 ** ((midi - 69) / 12)
        start_index = int(offset * sample_rate)
        t = np.arange(total - start_index, dtype=np.float64) / sample_rate
        decay = np.exp(-t * 1.2)
        sample = np.zeros_like(t)
        for harmonic in range(1, 5):
            sample += harmonic ** -1.5 * np.sin(2 * np.pi * hz * harmonic * t) * decay
        output[start_index:] += sample * 0.12
        offset += 0.005
    peak = np.max(np.abs(output))
    return output / peak * 0.8 if peak > 0 else output


def result(sample_id: str, expected: str, predicted: str | None, verifier_status: str, duration_sec: float) -> dict:
    return {
        "status": "evaluated",
        "cacheStatus": "miss",
        "datasetId": "isolated-guitar-chords",
        "sampleId": sample_id,
        "expectedChordId": expected,
        "evaluationStartSec": 0,
        "evaluationEndSec": duration_sec,
        "durationSec": duration_sec,
        "predictedChordId": predicted,
        "similarity": 0.8 if predicted else 0,
        "runnerUpChordId": None,
        "runnerUpSimilarity": None,
        "margin": 0.1,
        "correct": predicted == expected,
        "sameFamily": False,
        "verifierStatus": verifier_status,
        "acceptedChordId": expected if verifier_status == "accepted" else None,
        "bestAlternativeChordId": None,
        "expectedSimilarity": 0.8 if verifier_status == "accepted" else 0.4,
        "alternativeSimilarity": None,
        "verifierMargin": 0.1,
        "confidence": 0.8 if verifier_status == "accepted" else 0.2,
        "negativeTrials": [],
        "capture": {},
        "metadata": {},
    }
