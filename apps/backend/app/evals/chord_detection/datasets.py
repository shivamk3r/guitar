from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

from .label_map import normalize_chord_label

DATASET_IDS = ("isolated-guitar-chords", "guitarset")
HF_SPLIT_ROOT = Path("data") / "Test"


def load_dataset(dataset_id: str, *, cache_root: Path, guitarset_mode: str = "comp") -> dict:
    if dataset_id == "isolated-guitar-chords":
        return load_isolated_dataset(cache_root)
    if dataset_id == "guitarset":
        return load_guitarset(cache_root, guitarset_mode=guitarset_mode)
    raise ValueError(f"unknown dataset: {dataset_id}")


def load_isolated_dataset(cache_root: Path) -> dict:
    root = cache_root / "datasets" / "isolated-guitar-chords"
    split_root = root / HF_SPLIT_ROOT
    skipped: dict[str, int] = {}
    samples: list[dict[str, Any]] = []
    for file_path in sorted(split_root.rglob("*.wav")) if split_root.exists() else []:
        label = file_path.parent.name
        expected_chord_id = normalize_chord_label(label)
        if expected_chord_id is None:
            increment(skipped, "unsupported label")
            continue
        relative = file_path.relative_to(root).as_posix()
        samples.append(
            {
                "id": f"isolated:{relative}",
                "datasetId": "isolated-guitar-chords",
                "expectedChordId": expected_chord_id,
                "label": label,
                "audioPath": str(file_path),
                "sourcePath": relative,
                "startSec": 0,
                "endSec": math.inf,
                "sampleFingerprint": file_stat_fingerprint(file_path),
                "metadata": {"split": "Test"},
            }
        )
    return {"datasetId": "isolated-guitar-chords", "samples": samples, "skipped": to_skips(skipped)}


def load_guitarset(cache_root: Path, *, guitarset_mode: str) -> dict:
    root = cache_root / "datasets" / "guitarset"
    annotation_root = root / "extracted" / "annotation"
    audio_root = root / "extracted" / "audio_mono-mic"
    skipped: dict[str, int] = {}
    samples: list[dict[str, Any]] = []
    jams_files = sorted(annotation_root.rglob("*.jams")) if annotation_root.exists() else []
    audio_by_base = index_audio_by_jams_base(
        sorted(audio_root.rglob("*.wav")) if audio_root.exists() else []
    )
    for jams_path in jams_files:
        base = jams_path.stem
        if guitarset_mode == "comp" and not base.endswith("_comp"):
            increment(skipped, "non-comp performance")
            continue
        audio_path = audio_by_base.get(base)
        if audio_path is None:
            increment(skipped, "missing mono-mic audio")
            continue
        jams = json.loads(jams_path.read_text())
        chord_annotations = [
            annotation for annotation in jams.get("annotations", []) if annotation.get("namespace") == "chord"
        ]
        simple_annotation = chord_annotations[0] if len(chord_annotations) > 0 else None
        performed_annotation = chord_annotations[1] if len(chord_annotations) > 1 else None
        if simple_annotation is None:
            increment(skipped, "missing chord annotation")
            continue
        audio_fingerprint = file_stat_fingerprint(audio_path)
        simple_data = simple_annotation.get("data", [])
        performed_data = performed_annotation.get("data", []) if performed_annotation else []
        for index, simple in enumerate(simple_data):
            duration = float(simple.get("duration", 0))
            if duration < 0.25:
                increment(skipped, "too-short chord segment")
                continue
            performed = performed_data[index] if index < len(performed_data) else None
            simple_value = str(simple.get("value", ""))
            performed_value = str(performed.get("value", "")) if performed else ""
            expected_chord_id = (
                normalize_chord_label(performed_value) if performed else None
            ) or normalize_chord_label(simple_value)
            if expected_chord_id is None:
                increment(skipped, "unsupported label")
                continue
            source_path = jams_path.relative_to(root).as_posix()
            start_sec = float(simple.get("time", 0))
            end_sec = start_sec + duration
            samples.append(
                {
                    "id": f"guitarset:{base}:{index}:{start_sec:.3f}:{end_sec:.3f}:{expected_chord_id}",
                    "datasetId": "guitarset",
                    "expectedChordId": expected_chord_id,
                    "label": performed_value if performed else simple_value,
                    "audioPath": str(audio_path),
                    "sourcePath": source_path,
                    "startSec": start_sec,
                    "endSec": end_sec,
                    "sampleFingerprint": f"{audio_fingerprint}:{source_path}:{index}:{simple_value}:{performed_value}",
                    "metadata": {
                        "performance": base,
                        "chordIndex": index,
                        "simpleLabel": simple_value,
                        "performedLabel": performed_value if performed else None,
                        "mode": guitarset_mode,
                    },
                }
            )
    return {"datasetId": "guitarset", "samples": samples, "skipped": to_skips(skipped)}


def index_audio_by_jams_base(audio_files: list[Path]) -> dict[str, Path]:
    out: dict[str, Path] = {}
    for audio_path in audio_files:
        base = audio_path.stem
        out[base] = audio_path
        out[base.removesuffix("_mic")] = audio_path
        out[base.removesuffix("_mono-mic")] = audio_path
    return out


def file_stat_fingerprint(file_path: Path) -> str:
    stat = file_path.stat()
    return f"{stat.st_size}:{round(stat.st_mtime * 1000)}"


def increment(skipped: dict[str, int], reason: str) -> None:
    skipped[reason] = skipped.get(reason, 0) + 1


def to_skips(skipped: dict[str, int]) -> list[dict[str, int | str]]:
    return [{"reason": reason, "count": count} for reason, count in sorted(skipped.items())]
