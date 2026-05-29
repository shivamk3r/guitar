from __future__ import annotations

import argparse
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .config import EVAL_VERSION, default_cache_root
from .datasets import DATASET_IDS, load_dataset
from .evaluator import DETECTOR_DSP, DETECTOR_SOLITITO, evaluate_samples
from .hashing import algorithm_fingerprint
from .metrics import compute_metrics
from .report import write_reports


def main() -> None:
    options = parse_args()
    options.cache_root.mkdir(parents=True, exist_ok=True)
    fingerprint = algorithm_fingerprint(detector=options.detector)
    dataset_loads = [
        load_dataset(dataset_id, cache_root=options.cache_root, guitarset_mode=options.guitarset_mode)
        for dataset_id in options.datasets
    ]
    all_samples = [sample for load in dataset_loads for sample in load["samples"]]
    samples = all_samples[: options.limit] if options.limit is not None else all_samples
    print(
        f"Running {len(samples)}/{len(all_samples)} Python chord eval samples "
        f"with algorithm {fingerprint}"
    )
    results = evaluate_samples(
        samples=samples,
        cache_root=options.cache_root,
        algorithm_fingerprint=fingerprint,
        detector=options.detector,
        force=options.force,
    )
    report = build_report(options=options, fingerprint=fingerprint, dataset_loads=dataset_loads, results=results)
    written = write_reports(options.cache_root, report)
    print_summary(report, written["markdownPath"])


def build_report(*, options: argparse.Namespace, fingerprint: str, dataset_loads: list[dict], results: list[dict]) -> dict:
    dataset_skips = {
        dataset_id: next((load["skipped"] for load in dataset_loads if load["datasetId"] == dataset_id), [])
        for dataset_id in DATASET_IDS
    }
    by_dataset = {}
    for dataset_id in DATASET_IDS:
        dataset_results = [result for result in results if result["datasetId"] == dataset_id]
        by_dataset[dataset_id] = compute_metrics(dataset_results) if dataset_results else None
    return {
        "implementation": "python" if options.detector == DETECTOR_DSP else f"python-{options.detector}",
        "generatedAtIso": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "evalVersion": EVAL_VERSION,
        "algorithmFingerprint": fingerprint,
        "options": {
            "datasets": options.datasets,
            "limit": options.limit,
            "guitarSetMode": options.guitarset_mode,
            "detector": options.detector,
        },
        "datasetSkips": dataset_skips,
        "cache": {
            "hits": len([result for result in results if result["cacheStatus"] == "hit"]),
            "misses": len([result for result in results if result["cacheStatus"] == "miss"]),
        },
        "summary": compute_metrics(results),
        "byDataset": by_dataset,
        "samples": results,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the Python chord detection eval bench.")
    parser.add_argument("--datasets", default=",".join(DATASET_IDS))
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--cache-root", type=Path, default=default_cache_root())
    parser.add_argument("--guitarset-mode", choices=("comp", "all"), default="comp")
    parser.add_argument("--detector", choices=(DETECTOR_DSP, DETECTOR_SOLITITO), default=DETECTOR_DSP)
    argv = sys.argv[1:]
    if argv[:1] == ["--"]:
        argv = argv[1:]
    options = parser.parse_args(argv)
    options.datasets = parse_datasets(options.datasets)
    if options.limit is not None and options.limit <= 0:
        parser.error("--limit requires a positive integer")
    return options


def parse_datasets(value: str) -> list[str]:
    datasets = [item.strip() for item in value.split(",") if item.strip()]
    if not datasets:
        raise ValueError("--datasets requires at least one dataset")
    unknown = [dataset for dataset in datasets if dataset not in DATASET_IDS]
    if unknown:
        raise ValueError(f"unknown dataset(s): {', '.join(unknown)}")
    return datasets


def print_summary(report: dict[str, Any], markdown_path: str) -> None:
    summary = report["summary"]["summary"]
    print("")
    print("Python chord detection eval complete")
    print(f"Detector: {report['options']['detector']}")
    print(f"Evaluated: {summary['evaluated']}")
    print(f"Duration: {summary['totalDurationSec']:.1f}s")
    print(f"Top-1 accuracy: {pct(summary['accuracy'])}")
    print(f"Exact WCSR: {pct(summary['wcsr']['exact']['score'])}")
    print(f"Root WCSR: {pct(summary['wcsr']['root']['score'])}")
    print(f"Maj-Min WCSR: {pct(summary['wcsr']['majmin']['score'])}")
    print(f"Sevenths WCSR: {pct(summary['wcsr']['sevenths']['score'])}")
    print(f"Verifier recall: {pct(summary['verifierRecall'])}")
    print(f"Verifier weighted recall: {pct(summary['verifierWeightedRecall'])}")
    print(f"False accept trials: {pct(summary['falseAcceptRate'])}")
    print(f"Wrong-accept samples: {pct(summary['wrongAcceptedRate'])}")
    print(f"Uncertain: {pct(summary['unknownRate'])}")
    print(f"Cache: {report['cache']['hits']} hits, {report['cache']['misses']} misses")
    print(f"Report: {markdown_path}")


def pct(value: float) -> str:
    return f"{value * 100:.1f}%"


if __name__ == "__main__":
    main()
