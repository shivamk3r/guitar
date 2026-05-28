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
    assert '"implementation": "python"' in report_path.read_text()


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
