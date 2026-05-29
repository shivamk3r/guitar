from __future__ import annotations

from typing import Any

from .catalog import CHORDS_BY_ID, ChordDef

WCSR_VARIANT_IDS = (
    "exact",
    "root",
    "mirex",
    "thirds",
    "thirdsInv",
    "triads",
    "triadsInv",
    "tetrads",
    "tetradsInv",
    "majmin",
    "majminInv",
    "sevenths",
    "seventhsInv",
)

ROOT_TO_SEMITONE = {
    "C": 0,
    "C#": 1,
    "D": 2,
    "D#": 3,
    "E": 4,
    "F": 5,
    "F#": 6,
    "G": 7,
    "G#": 8,
    "A": 9,
    "A#": 10,
    "B": 11,
}

QUALITY_BITMAPS = {
    "maj": (1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0),
    "min": (1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0),
    "aug": (1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0),
    "dim": (1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0),
    "sus4": (1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0),
    "sus2": (1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0),
    "7": (1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0),
    "maj7": (1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1),
    "min7": (1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0),
    "5": (1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0),
    "": (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
}

QUALITY_TO_HARTE = {
    "major": "maj",
    "minor": "min",
    "dom7": "7",
    "min7": "min7",
    "power": "5",
    "sus": "sus4",
}

NO_CHORD_SYMBOL = {
    "chordId": None,
    "root": -1,
    "semitones": QUALITY_BITMAPS[""],
    "bass": -1,
}


def compute_duration_weighted_metrics(results: list[dict[str, Any]]) -> dict[str, Any]:
    accumulators = {
        variant: {
            "correctDurationSec": 0.0,
            "validDurationSec": 0.0,
            "outOfGamutDurationSec": 0.0,
        }
        for variant in WCSR_VARIANT_IDS
    }
    total_duration_sec = 0.0
    verifier_accepted_duration_sec = 0.0

    for result in results:
        duration_sec = safe_duration(result.get("durationSec", 0))
        total_duration_sec += duration_sec
        if result["verifierStatus"] == "accepted":
            verifier_accepted_duration_sec += duration_sec

        for variant in WCSR_VARIANT_IDS:
            comparison = compare_wcsr_variant(
                result["expectedChordId"],
                result.get("predictedChordId"),
                variant,
            )
            accumulator = accumulators[variant]
            if comparison < 0:
                accumulator["outOfGamutDurationSec"] += duration_sec
            else:
                accumulator["validDurationSec"] += duration_sec
                accumulator["correctDurationSec"] += comparison * duration_sec

    return {
        "totalDurationSec": total_duration_sec,
        "verifierWeightedRecall": safe_divide(verifier_accepted_duration_sec, total_duration_sec),
        "wcsr": finalize_accumulators(accumulators),
    }


def compare_wcsr_variant(reference_chord_id: str | None, estimated_chord_id: str | None, variant: str) -> float:
    if variant == "exact":
        return 1.0 if reference_chord_id == estimated_chord_id else 0.0

    reference = encode_chord_symbol(reference_chord_id)
    estimated = encode_chord_symbol(estimated_chord_id)

    if variant == "root":
        return 1.0 if reference["root"] == estimated["root"] else 0.0
    if variant == "mirex":
        return compare_mirex(reference, estimated)
    if variant == "thirds":
        return 1.0 if same_root(reference, estimated) and same_third(reference, estimated) else 0.0
    if variant == "thirdsInv":
        return (
            1.0
            if same_root(reference, estimated)
            and same_third(reference, estimated)
            and same_bass(reference, estimated)
            else 0.0
        )
    if variant == "triads":
        return 1.0 if same_root(reference, estimated) and same_prefix(reference, estimated, 8) else 0.0
    if variant == "triadsInv":
        return (
            1.0
            if same_root(reference, estimated)
            and same_prefix(reference, estimated, 8)
            and same_bass(reference, estimated)
            else 0.0
        )
    if variant == "tetrads":
        return 1.0 if same_root(reference, estimated) and same_semitones(reference, estimated) else 0.0
    if variant == "tetradsInv":
        return (
            1.0
            if same_root(reference, estimated)
            and same_semitones(reference, estimated)
            and same_bass(reference, estimated)
            else 0.0
        )
    if variant == "majmin":
        return compare_majmin(reference, estimated, include_bass=False)
    if variant == "majminInv":
        return compare_majmin(reference, estimated, include_bass=True)
    if variant == "sevenths":
        return compare_sevenths(reference, estimated, include_bass=False)
    if variant == "seventhsInv":
        return compare_sevenths(reference, estimated, include_bass=True)
    raise ValueError(f"unknown WCSR variant: {variant}")


def finalize_accumulators(accumulators: dict[str, dict[str, float]]) -> dict[str, dict[str, float]]:
    return {
        variant: {
            "score": safe_divide(accumulator["correctDurationSec"], accumulator["validDurationSec"]),
            **accumulator,
        }
        for variant, accumulator in accumulators.items()
    }


def encode_chord_symbol(chord_id: str | None) -> dict[str, Any]:
    if chord_id is None:
        return NO_CHORD_SYMBOL
    chord = CHORDS_BY_ID.get(chord_id)
    if chord is None:
        raise ValueError(f"unknown chord id for WCSR: {chord_id}")
    return encode_chord(chord)


def encode_chord(chord: ChordDef) -> dict[str, Any]:
    root = ROOT_TO_SEMITONE.get(chord.root)
    if root is None:
        raise ValueError(f"unsupported chord root for WCSR: {chord.root}")
    quality = QUALITY_TO_HARTE.get(chord.quality)
    if quality is None:
        raise ValueError(f"unsupported chord quality for WCSR: {chord.quality}")
    return {
        "chordId": chord.id,
        "root": root,
        "semitones": QUALITY_BITMAPS[quality],
        "bass": 0,
    }


def compare_mirex(reference: dict[str, Any], estimated: dict[str, Any]) -> float:
    reference_semitone_count = active_count(reference["semitones"])
    if 0 < reference_semitone_count < 3:
        return -1.0
    if is_no_chord(reference) and is_no_chord(estimated):
        return 1.0
    return 1.0 if absolute_intersection_count(reference, estimated) >= 3 else 0.0


def compare_majmin(reference: dict[str, Any], estimated: dict[str, Any], *, include_bass: bool) -> float:
    if not is_majmin_reference(reference):
        return -1.0
    if include_bass and not valid_reference_inversion(reference):
        return -1.0
    return (
        1.0
        if same_root(reference, estimated)
        and same_prefix(reference, estimated, 8)
        and (not include_bass or same_bass(reference, estimated))
        else 0.0
    )


def compare_sevenths(reference: dict[str, Any], estimated: dict[str, Any], *, include_bass: bool) -> float:
    if not is_sevenths_reference(reference):
        return -1.0
    if include_bass and not valid_reference_inversion(reference):
        return -1.0
    return (
        1.0
        if same_root(reference, estimated)
        and same_semitones(reference, estimated)
        and (not include_bass or same_bass(reference, estimated))
        else 0.0
    )


def is_majmin_reference(chord: dict[str, Any]) -> bool:
    return (
        is_no_chord(chord)
        or arrays_equal_prefix(chord["semitones"], QUALITY_BITMAPS["maj"], 8)
        or arrays_equal_prefix(chord["semitones"], QUALITY_BITMAPS["min"], 8)
    )


def is_sevenths_reference(chord: dict[str, Any]) -> bool:
    return any(
        arrays_equal(chord["semitones"], QUALITY_BITMAPS[quality])
        for quality in ("maj", "min", "maj7", "7", "min7", "")
    )


def valid_reference_inversion(chord: dict[str, Any]) -> bool:
    return chord["bass"] < 0 or chord["semitones"][chord["bass"]] == 1


def same_root(reference: dict[str, Any], estimated: dict[str, Any]) -> bool:
    return reference["root"] == estimated["root"]


def same_bass(reference: dict[str, Any], estimated: dict[str, Any]) -> bool:
    return reference["bass"] == estimated["bass"]


def same_third(reference: dict[str, Any], estimated: dict[str, Any]) -> bool:
    return reference["semitones"][3] == estimated["semitones"][3]


def same_prefix(reference: dict[str, Any], estimated: dict[str, Any], length: int) -> bool:
    return arrays_equal_prefix(reference["semitones"], estimated["semitones"], length)


def same_semitones(reference: dict[str, Any], estimated: dict[str, Any]) -> bool:
    return arrays_equal(reference["semitones"], estimated["semitones"])


def absolute_intersection_count(reference: dict[str, Any], estimated: dict[str, Any]) -> int:
    reference_absolute = rotate_to_root(reference["semitones"], reference["root"])
    estimated_absolute = rotate_to_root(estimated["semitones"], estimated["root"])
    return sum(1 for index in range(12) if reference_absolute[index] > 0 and estimated_absolute[index] > 0)


def rotate_to_root(semitones: tuple[int, ...], root: int) -> tuple[int, ...]:
    output = [0] * 12
    for index, value in enumerate(semitones):
        if value > 0:
            output[(index + root) % 12] = 1
    return tuple(output)


def is_no_chord(chord: dict[str, Any]) -> bool:
    return chord["root"] < 0 and active_count(chord["semitones"]) == 0


def active_count(semitones: tuple[int, ...]) -> int:
    return sum(1 for value in semitones if value > 0)


def arrays_equal_prefix(left: tuple[int, ...], right: tuple[int, ...], length: int) -> bool:
    return all(left[index] == right[index] for index in range(length))


def arrays_equal(left: tuple[int, ...], right: tuple[int, ...]) -> bool:
    return len(left) == len(right) and arrays_equal_prefix(left, right, len(left))


def safe_duration(duration_sec: object) -> float:
    return float(duration_sec) if isinstance(duration_sec, int | float) and duration_sec > 0 else 0.0


def safe_divide(numerator: float, denominator: float) -> float:
    return float(numerator / denominator) if denominator > 0 else 0.0
