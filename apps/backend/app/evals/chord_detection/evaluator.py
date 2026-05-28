from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

from .catalog import CHORDS_BY_ID, SUPPORTED_CHORD_ID_LIST
from .dsp import analyze_chord_capture, decode_wav_file, match_chord, uncertain_trial, verify_chord
from .hashing import sample_result_cache_key


def evaluate_samples(
    *,
    samples: list[dict[str, Any]],
    cache_root: Path,
    algorithm_fingerprint: str,
    force: bool,
) -> list[dict]:
    results: list[dict] = []
    last_audio_path: str | None = None
    last_audio = None
    for sample in samples:
        if not force:
            cached = read_cached_result(cache_root, algorithm_fingerprint, sample)
            if cached is not None:
                cached["cacheStatus"] = "hit"
                results.append(cached)
                continue
        if last_audio_path != sample["audioPath"]:
            last_audio = decode_wav_file(sample["audioPath"])
            last_audio_path = sample["audioPath"]
        if last_audio is None:
            raise RuntimeError("audio decode failed")
        result = evaluate_sample(sample, last_audio)
        write_cached_result(cache_root, algorithm_fingerprint, sample, result)
        results.append(result)
    return results


def evaluate_sample(sample: dict[str, Any], audio) -> dict:
    try:
        end_sec = (
            sample["endSec"]
            if math.isfinite(sample["endSec"]) and sample["endSec"] > sample["startSec"]
            else len(audio.samples) / audio.sample_rate
        )
        capture = analyze_chord_capture(audio, sample["startSec"], end_sec)
        expected = CHORDS_BY_ID[sample["expectedChordId"]]
        captured_chroma = capture["chroma"]
        if capture["hasSignal"]:
            import numpy as np

            chroma = np.asarray(captured_chroma, dtype=np.float64)
            match = match_chord(chroma, expected)
            verifier = verify_chord(chroma, expected)
            negative_trials = [
                verify_chord(chroma, CHORDS_BY_ID[chord_id])
                for chord_id in SUPPORTED_CHORD_ID_LIST
                if chord_id != expected.id
            ]
        else:
            match = None
            verifier = uncertain_trial(expected.id)
            negative_trials = [
                uncertain_trial(chord_id)
                for chord_id in SUPPORTED_CHORD_ID_LIST
                if chord_id != expected.id
            ]
        predicted_chord = match["chord"] if match else None
        runner_up = match["runnerUp"] if match else None
        runner_up_chord = runner_up[0] if runner_up else None
        runner_up_similarity = runner_up[1] if runner_up else None
        similarity = match["similarity"] if match else 0
        margin = similarity if runner_up_similarity is None else similarity - runner_up_similarity
        return {
            "status": "evaluated",
            "cacheStatus": "miss",
            "datasetId": sample["datasetId"],
            "sampleId": sample["id"],
            "expectedChordId": sample["expectedChordId"],
            "predictedChordId": predicted_chord.id if predicted_chord else None,
            "similarity": similarity,
            "runnerUpChordId": runner_up_chord.id if runner_up_chord else None,
            "runnerUpSimilarity": runner_up_similarity,
            "margin": margin,
            "correct": predicted_chord is not None and predicted_chord.id == sample["expectedChordId"],
            "sameFamily": bool(match["sameFamily"]) if match else False,
            "verifierStatus": verifier["status"],
            "acceptedChordId": verifier["acceptedChordId"],
            "bestAlternativeChordId": verifier["bestAlternativeChordId"],
            "expectedSimilarity": verifier["expectedSimilarity"],
            "alternativeSimilarity": verifier["alternativeSimilarity"],
            "verifierMargin": verifier["margin"],
            "confidence": verifier["confidence"],
            "negativeTrials": negative_trials,
            "capture": capture,
            "metadata": sample["metadata"],
        }
    except Exception as err:  # noqa: BLE001 - eval reports should capture per-sample failures.
        return {
            "status": "failed",
            "cacheStatus": "miss",
            "datasetId": sample["datasetId"],
            "sampleId": sample["id"],
            "expectedChordId": sample["expectedChordId"],
            "reason": str(err),
            "metadata": sample["metadata"],
        }


def read_cached_result(cache_root: Path, algorithm_fingerprint: str, sample: dict[str, Any]) -> dict | None:
    path = cache_path(cache_root, algorithm_fingerprint, sample)
    if not path.exists():
        return None
    return json.loads(path.read_text())


def write_cached_result(cache_root: Path, algorithm_fingerprint: str, sample: dict[str, Any], result: dict) -> None:
    path = cache_path(cache_root, algorithm_fingerprint, sample)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(result, indent=2, default=json_default) + "\n")


def cache_path(cache_root: Path, algorithm_fingerprint: str, sample: dict[str, Any]) -> Path:
    return (
        cache_root
        / "results"
        / "python"
        / algorithm_fingerprint
        / f"{sample_result_cache_key(sample)}.json"
    )


def json_default(value: Any) -> Any:
    try:
        import numpy as np

        if isinstance(value, np.generic):
            return value.item()
    except Exception:
        pass
    raise TypeError(f"not JSON serializable: {type(value)!r}")
