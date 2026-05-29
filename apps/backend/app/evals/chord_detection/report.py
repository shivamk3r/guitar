from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .wcsr import WCSR_VARIANT_IDS


def write_reports(cache_root: Path, report: dict) -> dict[str, str]:
    reports_dir = cache_root / "reports" / report["implementation"]
    reports_dir.mkdir(parents=True, exist_ok=True)
    json_path = reports_dir / "latest.json"
    markdown_path = reports_dir / "latest.md"
    json_path.write_text(json.dumps(report, indent=2, default=json_default) + "\n")
    markdown_path.write_text(render_markdown_report(report))
    return {"jsonPath": str(json_path), "markdownPath": str(markdown_path)}


def render_markdown_report(report: dict) -> str:
    lines = [
        f"# Chord Detection Eval Report ({report['implementation']})",
        "",
        f"Generated: {report['generatedAtIso']}",
        f"Algorithm fingerprint: `{report['algorithmFingerprint']}`",
        f"Datasets: {', '.join(report['options']['datasets'])}",
        f"Detector: {report['options'].get('detector', report['implementation'])}",
        f"Cache: {report['cache']['hits']} hits, {report['cache']['misses']} misses",
        "",
        "## Headline",
        "",
        render_metrics_table([("overall", report["summary"]), *dataset_rows(report)]),
        "",
        "## WCSR",
        "",
        render_wcsr_table(report["summary"]),
        "",
        "## Per-Chord Verifier",
        "",
        render_per_chord_table(report["summary"]),
        "",
        "## Top Confusions",
        "",
        render_top_confusions(report["summary"]),
        "",
        "## Dataset Skips",
        "",
        render_skips(report),
        "",
    ]
    return "\n".join(lines) + "\n"


def dataset_rows(report: dict) -> list[tuple[str, dict]]:
    return [(dataset_id, metrics) for dataset_id, metrics in report["byDataset"].items() if metrics]


def render_metrics_table(rows: list[tuple[str, dict]]) -> str:
    out = [
        "| Scope | Evaluated | Duration | Top-1 accuracy | Exact WCSR | Root WCSR | Maj-Min WCSR | Sevenths WCSR | Verifier recall | Verifier weighted recall | Positive rejected | Uncertain | False accept trials | Wrong-accept samples |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for label, metrics in rows:
        summary = metrics["summary"]
        out.append(
            f"| {label} | {summary['evaluated']} | {seconds(summary['totalDurationSec'])} | "
            f"{pct(summary['accuracy'])} | {pct(summary['wcsr']['exact']['score'])} | "
            f"{pct(summary['wcsr']['root']['score'])} | {pct(summary['wcsr']['majmin']['score'])} | "
            f"{pct(summary['wcsr']['sevenths']['score'])} | {pct(summary['verifierRecall'])} | "
            f"{pct(summary['verifierWeightedRecall'])} | {pct(summary['rejectedRate'])} | "
            f"{pct(summary['unknownRate'])} | {pct(summary['falseAcceptRate'])} | "
            f"{pct(summary['wrongAcceptedRate'])} |"
        )
    return "\n".join(out)


def render_wcsr_table(metrics: dict) -> str:
    out = [
        "| Variant | Score | Valid duration | Correct duration | Out-of-gamut duration |",
        "|---|---:|---:|---:|---:|",
    ]
    for variant in WCSR_VARIANT_IDS:
        item = metrics["summary"]["wcsr"][variant]
        out.append(
            f"| {wcsr_label(variant)} | {pct(item['score'])} | {seconds(item['validDurationSec'])} | "
            f"{seconds(item['correctDurationSec'])} | {seconds(item['outOfGamutDurationSec'])} |"
        )
    return "\n".join(out)


def render_per_chord_table(metrics: dict) -> str:
    out = [
        "| Chord | Support | Accepted target precision | Verifier recall | F1 |",
        "|---|---:|---:|---:|---:|",
    ]
    for item in metrics["perChord"]:
        out.append(
            f"| {item['chordId']} | {item['support']} | {pct(item['precision'])} | "
            f"{pct(item['recall'])} | {pct(item['f1'])} |"
        )
    return "\n".join(out)


def render_top_confusions(metrics: dict) -> str:
    rows = []
    for expected, predictions in metrics["confusionMatrix"].items():
        for predicted, count in predictions.items():
            if predicted != expected:
                rows.append({"expected": expected, "predicted": predicted, "count": count})
    rows.sort(key=lambda row: row["count"], reverse=True)
    if not rows:
        return "No confusions."
    out = ["| Expected | Top-1 predicted | Count |", "|---|---|---:|"]
    out.extend(f"| {row['expected']} | {row['predicted']} | {row['count']} |" for row in rows[:15])
    return "\n".join(out)


def render_skips(report: dict) -> str:
    rows = [
        f"| {dataset_id} | {skip['reason']} | {skip['count']} |"
        for dataset_id, skips in report["datasetSkips"].items()
        for skip in skips
    ]
    if not rows:
        return "No dataset skips."
    return "\n".join(["| Dataset | Reason | Count |", "|---|---|---:|", *rows])


def pct(value: float) -> str:
    return f"{value * 100:.1f}%"


def seconds(value: float) -> str:
    return f"{value:.1f}s"


def wcsr_label(variant: str) -> str:
    labels = {
        "exact": "Exact",
        "root": "Root",
        "mirex": "MIREX",
        "thirds": "Thirds",
        "thirdsInv": "Thirds + bass",
        "triads": "Triads",
        "triadsInv": "Triads + bass",
        "tetrads": "Tetrads",
        "tetradsInv": "Tetrads + bass",
        "majmin": "Maj-Min",
        "majminInv": "Maj-Min + bass",
        "sevenths": "Sevenths",
        "seventhsInv": "Sevenths + bass",
    }
    return labels[variant]


def json_default(value: Any) -> Any:
    try:
        import numpy as np

        if isinstance(value, np.generic):
            return value.item()
    except Exception:
        pass
    raise TypeError(f"not JSON serializable: {type(value)!r}")
