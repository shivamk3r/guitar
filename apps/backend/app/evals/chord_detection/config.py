from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

EVAL_VERSION = "chord-detection-eval-v3-wcsr"

CAPTURE_CONFIG: dict[str, float | int] = {
    "fftSize": 2048,
    "hopSize": 512,
    "captureMs": 320,
    "minHz": 70,
    "maxHz": 2000,
    "rmsThreshold": 0.01,
    "onsetLookbackMs": 500,
    "transientSkipMs": 80,
    "trimRatio": 0.15,
}


def repo_root() -> Path:
    return Path(__file__).resolve().parents[5]


def default_cache_root() -> Path:
    return repo_root() / ".eval-cache" / "chord-detection"


def threshold_path() -> Path:
    return repo_root() / "apps" / "frontend" / "src" / "audio" / "chord-verifier-thresholds.json"


@lru_cache(maxsize=1)
def load_thresholds() -> dict[str, Any]:
    return json.loads(threshold_path().read_text())
