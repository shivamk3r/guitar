# Chord Detection Evals

Manual offline benchmarks for the browser chord detection algorithm.

```sh
pnpm eval:chords:prepare
pnpm eval:chords
pnpm eval:chords -- --datasets isolated-guitar-chords
pnpm eval:chords -- --datasets guitarset
pnpm eval:chords -- --limit 100
pnpm eval:chords -- --force
```

The eval cache lives at `.eval-cache/chord-detection/` and is ignored by git. Dataset downloads
and per-sample detector results are reused automatically. Result cache keys include the dataset
sample identity, segment timing, detector source fingerprint, and capture configuration.

Reports are written to:

```text
.eval-cache/chord-detection/reports/latest.md
.eval-cache/chord-detection/reports/latest.json
```

Use `--force` to recompute sample results for the same algorithm fingerprint. Use
`--refresh-datasets` to redownload dataset artifacts. By default, `pnpm eval:chords` runs both
datasets.

## Datasets

- `isolated-guitar-chords`: Hugging Face `severyn-k/isolated-guitar-chords`, Test split only.
- `guitarset`: Zenodo GuitarSet record `3371780`, using only `annotation.zip` and
  `audio_mono-mic.zip`. By default only `_comp` performances are evaluated.

Unsupported chord labels are skipped because the product can only detect chords present in
`src/data/chords.ts`.

## Metrics

The headline report is verifier-focused: whether the expected chord would be accepted, rejected,
or confused with another chord. Reports also include top-1 recognizer accuracy, per-chord
precision/recall/F1, confusion matrices, cache hits, skipped samples, and threshold sweeps for
similarity and runner-up margin.

## Current Baseline

Latest full run: 2026-05-29 IST, report timestamp `2026-05-28T21:34:56.921Z`, algorithm
fingerprint `55679441ce783a38`.

| Scope | Evaluated | Accuracy | Verifier recall | False reject | Wrong accepted | Unknown |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Overall | 955 | 22.8% | 22.8% | 77.2% | 77.2% | 0.0% |
| Isolated Guitar Chords | 54 | 16.7% | 16.7% | 83.3% | 83.3% | 0.0% |
| GuitarSet | 901 | 23.2% | 23.2% | 76.8% | 76.8% | 0.0% |

Top baseline confusions:

| Expected | Predicted | Count |
| --- | --- | ---: |
| E | F | 66 |
| A | Am | 61 |
| D | D7 | 59 |
| C | G7 | 48 |
| G | F | 45 |
| G | G7 | 43 |

This baseline does not meet the product accuracy target. It is a measurement of the current
open-ended chroma/template matcher, not the desired target-aware verifier strategy.
