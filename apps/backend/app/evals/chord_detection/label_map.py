from __future__ import annotations

from .catalog import CHORDS_BY_ID

ROOT_ALIASES = {
    "B#": "C",
    "C#": "C#",
    "Db": "C#",
    "D#": "D#",
    "Eb": "D#",
    "Fb": "E",
    "E#": "F",
    "F#": "F#",
    "Gb": "F#",
    "G#": "G#",
    "Ab": "G#",
    "A#": "A#",
    "Bb": "A#",
    "Cb": "B",
}


def normalize_chord_label(raw_label: str) -> str | None:
    raw = raw_label.strip()
    if not raw or raw.upper() == "N" or raw.lower() == "noise":
        return None
    without_bass = raw.split("/", 1)[0]
    root_part, quality_part = (
        split_harte_label(without_bass) if ":" in without_bass else split_compact_label(without_bass)
    )
    root = normalize_root(root_part)
    if root is None:
        return None
    suffix = normalize_quality(quality_part)
    if suffix is None:
        return None
    chord_id = f"{root}{suffix}"
    return chord_id if chord_id in CHORDS_BY_ID else None


def split_harte_label(label: str) -> tuple[str, str]:
    parts = label.split(":", 1)
    return parts[0], parts[1] if len(parts) > 1 else "maj"


def split_compact_label(label: str) -> tuple[str, str]:
    if len(label) >= 2 and label[1] in {"#", "b"}:
        return label[:2], label[2:]
    return label[:1], label[1:]


def normalize_root(root: str) -> str | None:
    if not root:
        return None
    normalized = root[:1].upper() + root[1:]
    return ROOT_ALIASES.get(normalized, normalized)


def normalize_quality(quality: str) -> str | None:
    q = quality.strip()
    if q in {"", "maj", "major"}:
        return ""
    if q in {"m", "min", "minor"}:
        return "m"
    if q in {"7", "dom7"}:
        return "7"
    if q in {"5", "power"}:
        return "5"
    return None
