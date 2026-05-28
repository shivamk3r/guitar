from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from .config import CAPTURE_CONFIG, EVAL_VERSION, repo_root, threshold_path

DETECTOR_SOURCE_FILES = (
    "apps/backend/app/evals/chord_detection/dsp.py",
    "apps/backend/app/evals/chord_detection/catalog.py",
    "apps/backend/app/evals/chord_detection/label_map.py",
    "apps/frontend/src/audio/chord-verifier-thresholds.json",
)


def algorithm_fingerprint() -> str:
    root = repo_root()
    digest = hashlib.sha256()
    digest.update(EVAL_VERSION.encode())
    digest.update(json.dumps(CAPTURE_CONFIG, sort_keys=True).encode())
    for relative_path in DETECTOR_SOURCE_FILES:
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
