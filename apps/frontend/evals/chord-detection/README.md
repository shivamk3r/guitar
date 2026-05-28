# Chord Detection Evals

Manual offline benchmarks for chord detection. The frontend eval exercises the browser production detector path. The Python eval is a research bench only; it reads the same prepared datasets and writes the same report schema, but it is not wired into the backend worker.

```sh
pnpm eval:chords:prepare
pnpm eval:chords
pnpm eval:chords:frontend
pnpm eval:chords:python
pnpm eval:chords:compare
pnpm eval:chords -- --datasets isolated-guitar-chords
pnpm eval:chords -- --datasets guitarset
pnpm eval:chords -- --limit 100
pnpm eval:chords -- --force
```

`pnpm eval:chords` is preserved as the frontend path. The first dataset preparation downloads about 2.1 GB.

The eval cache lives at `.eval-cache/chord-detection/` and is ignored by git. Dataset downloads and per-sample detector results are reused automatically unless `--force` is passed. Result cache keys include the dataset sample identity, segment timing, detector source fingerprint, threshold config, and capture configuration.

Reports are written to:

```text
.eval-cache/chord-detection/reports/frontend/latest.md
.eval-cache/chord-detection/reports/frontend/latest.json
.eval-cache/chord-detection/reports/python/latest.md
.eval-cache/chord-detection/reports/python/latest.json
.eval-cache/chord-detection/reports/comparison/latest.md
.eval-cache/chord-detection/reports/comparison/latest.json
```

Use `--force` to recompute sample results for the same algorithm fingerprint. Use `--refresh-datasets` with the frontend CLI to redownload dataset artifacts. By default, `pnpm eval:chords` and `pnpm eval:chords:python` run both datasets.

## Datasets

- `isolated-guitar-chords`: Hugging Face `severyn-k/isolated-guitar-chords`, Test split only.
- `guitarset`: Zenodo GuitarSet record `3371780`, using only `annotation.zip` and `audio_mono-mic.zip`. By default only `_comp` performances are evaluated.

Unsupported chord labels are skipped because the product can only detect chords present in `src/data/chords.ts`.

## Metrics

Reports are target-aware. Every evaluated sample is tested once against the true chord as a positive trial and against every other supported chord as negative trials.

- `Verifier recall`: positive trials accepted for the true target.
- `Positive rejected`: positive trials where a confident alternative beat the expected chord.
- `Uncertain`: positive trials where the verifier avoided a confident identity.
- `False accept trials`: negative target trials that were accepted.
- `Wrong-accept samples`: samples with at least one accepted negative target.
- `Top-1 accuracy`: open-ended debug matcher accuracy, not the learner scoring contract.

Learner-facing scoring uses the verifier status: `accepted` scores the expected chord as correct, `rejected` scores wrong using the best alternative when available, and `uncertain` reports no detected chord.

## Current Baseline

Latest full target-aware runs: 2026-05-29 IST.

| Implementation | Timestamp | Fingerprint | Evaluated | Top-1 accuracy | Verifier recall | Positive rejected | Uncertain | False accept trials | Wrong-accept samples |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Frontend | `2026-05-28T23:08:22.140Z` | `b2bc7dcc3144d973` | 955 | 14.3% | 10.1% | 20.7% | 69.2% | 0.7% | 11.8% |
| Python | `2026-05-28T23:13:33.957028Z` | `8f17959faef3430b` | 955 | 14.2% | 9.7% | 20.8% | 69.4% | 0.7% | 11.0% |

The target-aware verifier sharply reduces confident wrong accepts compared with the previous open-ended baseline, but recall is still far below the product target. This is a conservative classical DSP v1 baseline, not the endpoint for learner-trustworthy chord recognition.
