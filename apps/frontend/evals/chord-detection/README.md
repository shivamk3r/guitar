# Chord Detection Evals

Manual offline benchmarks for chord detection. The frontend eval exercises the browser production detector path. The Python eval reads the same prepared datasets and report schema, and can run either the classical DSP baseline or the Solitito ONNX backend detector. The backend worker uses Solitito only for async WAV `chord_check` recording analysis.

```sh
pnpm eval:chords:prepare
pnpm eval:chords
pnpm eval:chords:frontend
pnpm eval:chords:python
pnpm eval:chords:python -- --detector solitito
pnpm eval:chords:models
pnpm eval:chords:compare
pnpm eval:chords -- --datasets isolated-guitar-chords
pnpm eval:chords -- --datasets guitarset
pnpm eval:chords -- --limit 100
pnpm eval:chords -- --force
```

`pnpm eval:chords` is preserved as the frontend path. The first dataset preparation downloads about 2.1 GB. `pnpm eval:chords:models` downloads the pinned Solitito ONNX model and DSP weights into the ignored eval cache.

The eval cache lives at `.eval-cache/chord-detection/` and is ignored by git. Dataset downloads, Solitito model assets, and per-sample detector results are reused automatically unless `--force` is passed. Result cache keys include the dataset sample identity, segment timing, detector selector, detector source fingerprint, and either DSP threshold/capture config or Solitito model revision/checksums.

Reports are written to:

```text
.eval-cache/chord-detection/reports/frontend/latest.md
.eval-cache/chord-detection/reports/frontend/latest.json
.eval-cache/chord-detection/reports/python/latest.md
.eval-cache/chord-detection/reports/python/latest.json
.eval-cache/chord-detection/reports/python-solitito/latest.md
.eval-cache/chord-detection/reports/python-solitito/latest.json
.eval-cache/chord-detection/reports/comparison/latest.md
.eval-cache/chord-detection/reports/comparison/latest.json
```

Use `--force` to recompute sample results for the same algorithm fingerprint. Use `--refresh-datasets` with the frontend CLI to redownload dataset artifacts. By default, `pnpm eval:chords` and `pnpm eval:chords:python` run both datasets. The Python CLI defaults to `--detector dsp`; pass `--detector solitito` for the backend model.

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
- `Exact WCSR`: duration-weighted top-1 chord ID accuracy over resolved eval segments.
- `Root`/`MIREX`/`Thirds`/`Triads`/`Tetrads`/`Maj-Min`/`Sevenths` WCSR: `mir_eval`-style duration-weighted chord comparisons over the current product chord vocabulary. Variants with `+ bass` are reported too, but currently mirror non-bass variants because normalized product labels do not preserve slash-bass annotations.
- `Verifier weighted recall`: duration-weighted positive trials accepted for the true target.

Learner-facing scoring uses the verifier status: `accepted` scores the expected chord as correct, `rejected` scores wrong using the best alternative when available, and `uncertain` reports no detected chord.

## Current Baseline

Latest full target-aware + WCSR runs: 2026-05-29 IST.

| Implementation | Timestamp | Fingerprint | Evaluated | Duration | Top-1 accuracy | Exact WCSR | Root WCSR | Maj-Min WCSR | Sevenths WCSR | Verifier recall | Verifier weighted recall | Positive rejected | Uncertain | False accept trials | Wrong-accept samples |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Frontend | `2026-05-29T03:16:49.487Z` | `42dbecafd82639db` | 955 | 2502.5s | 14.3% | 13.3% | 37.3% | 30.5% | 13.3% | 10.1% | 9.5% | 20.7% | 69.2% | 0.7% | 11.8% |
| Python DSP | `2026-05-29T03:16:01.201643Z` | `24601413f5c157c8` | 955 | 2502.5s | 14.2% | 13.2% | 37.7% | 30.7% | 13.2% | 9.7% | 9.3% | 20.8% | 69.4% | 0.7% | 11.0% |
| Python Solitito | `2026-05-29T03:13:19.880711Z` | `397a440dd8aa9433` | 955 | 2502.5s | 72.4% | 74.7% | 82.8% | 78.5% | 74.7% | 53.2% | 57.4% | 2.7% | 44.1% | 0.2% | 4.0% |

The target-aware verifier sharply reduces confident wrong accepts compared with the previous open-ended baseline. Solitito substantially improves async backend chord analysis while keeping false accepts below the classical DSP baseline; the browser path still needs a separate real-time accuracy upgrade.
