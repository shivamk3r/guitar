from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from .config import CAPTURE_CONFIG, EVAL_VERSION, repo_root, threshold_path

DSP_SOURCE_FILES = (
    "apps/backend/app/evals/chord_detection/dsp.py",
    "apps/backend/app/evals/chord_detection/catalog.py",
    "apps/backend/app/evals/chord_detection/label_map.py",
    "apps/frontend/src/audio/chord-verifier-thresholds.json",
)

SOLITITO_SOURCE_FILES = (
    "apps/backend/app/chord_detection/solitito.py",
    "apps/backend/app/chord_detection/solitito_assets.py",
    "apps/backend/app/evals/chord_detection/catalog.py",
    "apps/backend/app/evals/chord_detection/label_map.py",
)


def algorithm_fingerprint(*, detector: str = "dsp") -> str:
    root = repo_root()
    digest = hashlib.sha256()
    digest.update(EVAL_VERSION.encode())
    digest.update(detector.encode())
    if detector == "solitito":
        from app.chord_detection import solitito_assets

        source_files = SOLITITO_SOURCE_FILES
        digest.update(solitito_assets.MODEL_ID.encode())
        digest.update(solitito_assets.MODEL_REVISION.encode())
        digest.update(solitito_assets.MODEL_FILENAME.encode())
        digest.update(solitito_assets.MODEL_SHA256.encode())
        digest.update(solitito_assets.DSP_WEIGHTS_FILENAME.encode())
        digest.update(solitito_assets.DSP_WEIGHTS_SHA256.encode())
    else:
        source_files = DSP_SOURCE_FILES
        digest.update(json.dumps(CAPTURE_CONFIG, sort_keys=True).encode())
    for relative_path in source_files:
        digest.update(relative_path.encode())
        digest.update((root / relative_path).read_bytes())
    return digest.hexdigest()[:16]


def sample_result_cache_key(sample: dict[str, Any]) -> str:
    return stable_hash(
        {
            "datasetId": sample["datasetId"],
            "id": sample["id"],
            "expectedChordId": sample["expectedChordId"],
            "sourcePath": sample["sourcePath"],
            "startSec": sample["startSec"],
            "endSec": sample["endSec"],
            "sampleFingerprint": sample["sampleFingerprint"],
        }
    )[:32]


def stable_hash(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def threshold_fingerprint() -> str:
    return hashlib.sha256(threshold_path().read_bytes()).hexdigest()[:16]
