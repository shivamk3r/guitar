from __future__ import annotations


def build_practice_score_metrics(
    *,
    attempt_count: int,
    analyzed_attempt_count: int,
    accepted_count: int,
    rejected_count: int,
    uncertain_count: int,
) -> dict[str, float | str | None]:
    analyzed = normalized_count(analyzed_attempt_count)
    accepted = normalized_count(accepted_count)
    rejected = normalized_count(rejected_count)
    uncertain = normalized_count(uncertain_count)
    attempts = normalized_count(attempt_count)
    decisive = accepted + rejected
    value = safe_percent(accepted, analyzed) or 0.0

    return {
        "value": value,
        "label": practice_score_label(value),
        "analysisCoverage": safe_rate(analyzed, attempts),
        "clarity": safe_rate(decisive, analyzed),
        "decisiveAccuracy": safe_rate(accepted, decisive),
        "acceptedRate": safe_rate(accepted, analyzed),
        "rejectedRate": safe_rate(rejected, analyzed),
        "uncertainRate": safe_rate(uncertain, analyzed),
    }


def practice_score_label(value: float) -> str:
    if value >= 85:
        return "Strong"
    if value >= 70:
        return "Solid"
    if value >= 50:
        return "Building"
    if value > 0:
        return "Needs focus"
    return "Not yet verified"


def normalized_count(value: int) -> int:
    return max(0, value)


def safe_rate(numerator: int, denominator: int) -> float | None:
    return float(numerator / denominator) if denominator > 0 else None


def safe_percent(numerator: int, denominator: int) -> float | None:
    rate = safe_rate(numerator, denominator)
    return None if rate is None else rate * 100.0
