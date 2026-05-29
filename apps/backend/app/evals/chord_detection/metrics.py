from __future__ import annotations

from .catalog import SUPPORTED_CHORD_ID_LIST
from .wcsr import compute_duration_weighted_metrics


def compute_metrics(results: list[dict]) -> dict:
    evaluated = [result for result in results if result["status"] == "evaluated"]
    failed = len(results) - len(evaluated)
    per_chord = {
        chord_id: {"chordId": chord_id, "support": 0, "predicted": 0, "correct": 0}
        for chord_id in SUPPORTED_CHORD_ID_LIST
    }
    confusion_matrix: dict[str, dict[str, int]] = {}
    top_one_correct = 0
    positive_accepted = 0
    positive_rejected = 0
    positive_uncertain = 0
    negative_trials = 0
    false_accepts = 0
    wrong_accepted_samples = 0

    for result in evaluated:
        expected = result["expectedChordId"]
        predicted = result["predictedChordId"] or "unknown"
        confusion_matrix.setdefault(expected, {})
        confusion_matrix[expected][predicted] = confusion_matrix[expected].get(predicted, 0) + 1
        expected_metrics = ensure_chord(per_chord, expected)
        expected_metrics["support"] += 1
        if result["correct"]:
            top_one_correct += 1
        if result["verifierStatus"] == "accepted":
            positive_accepted += 1
            expected_metrics["correct"] += 1
            expected_metrics["predicted"] += 1
        elif result["verifierStatus"] == "rejected":
            positive_rejected += 1
        else:
            positive_uncertain += 1
        accepted_negatives = [
            trial for trial in result["negativeTrials"] if trial["status"] == "accepted"
        ]
        negative_trials += len(result["negativeTrials"])
        false_accepts += len(accepted_negatives)
        if accepted_negatives:
            wrong_accepted_samples += 1
        for trial in accepted_negatives:
            ensure_chord(per_chord, trial["expectedChordId"])["predicted"] += 1

    evaluated_count = len(evaluated)
    weighted = compute_duration_weighted_metrics(evaluated)
    return {
        "summary": {
            "evaluated": evaluated_count,
            "failed": failed,
            "totalDurationSec": weighted["totalDurationSec"],
            "negativeTrials": negative_trials,
            "falseAccepts": false_accepts,
            "wrongAcceptedSamples": wrong_accepted_samples,
            "accuracy": safe_divide(top_one_correct, evaluated_count),
            "verifierRecall": safe_divide(positive_accepted, evaluated_count),
            "verifierWeightedRecall": weighted["verifierWeightedRecall"],
            "falseRejectRate": safe_divide(evaluated_count - positive_accepted, evaluated_count),
            "falseAcceptRate": safe_divide(false_accepts, negative_trials),
            "wrongAcceptedRate": safe_divide(wrong_accepted_samples, evaluated_count),
            "unknownRate": safe_divide(positive_uncertain, evaluated_count),
            "rejectedRate": safe_divide(positive_rejected, evaluated_count),
            "wcsr": weighted["wcsr"],
        },
        "perChord": [to_per_chord_metrics(item) for item in per_chord.values() if item["support"] > 0 or item["predicted"] > 0],
        "confusionMatrix": confusion_matrix,
    }


def ensure_chord(per_chord: dict[str, dict], chord_id: str) -> dict:
    if chord_id not in per_chord:
        per_chord[chord_id] = {"chordId": chord_id, "support": 0, "predicted": 0, "correct": 0}
    return per_chord[chord_id]


def to_per_chord_metrics(item: dict) -> dict:
    precision = safe_divide(item["correct"], item["predicted"])
    recall = safe_divide(item["correct"], item["support"])
    return {
        **item,
        "precision": precision,
        "recall": recall,
        "f1": 0 if precision + recall == 0 else (2 * precision * recall) / (precision + recall),
    }


def safe_divide(numerator: int | float, denominator: int | float) -> float:
    return float(numerator / denominator) if denominator > 0 else 0.0
