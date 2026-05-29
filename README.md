# Guitar Coach

[![CI](https://github.com/shivamk3r/guitar/actions/workflows/ci.yml/badge.svg)](https://github.com/shivamk3r/guitar/actions/workflows/ci.yml)

Guitar Coach is an end-to-end app for learning guitar. The goal is that a learner should not need anything outside the app, except a guitar, themselves, and normal physical accessories, to tune, practice, measure progress, and know what to work on next.

The app has two feedback loops:

1. **Immediate browser feedback** - Web Audio and AudioWorklet analyze pitch, chords, and timing in real time so tuner and practice feedback stays fast.
2. **Long-term learning analysis** - with explicit consent, tuning, chord-check, and practice sessions are recorded, uploaded to the local backend, stored, queued for analysis, and used to build progress guidance over time.

The frontend also includes a **Learn** tab with browser-only glossary lessons for beginner terms such as pitch, fret, cent, beat, chord, rhythm, tempo, tuning, and string.

## Architecture

This is now a local-first monorepo:

```text
apps/frontend   Vite + React + TypeScript app
apps/backend    FastAPI API, SQLAlchemy models, and Python worker
infra/          Local infrastructure bootstrap
docs/           Product, stack, architecture, and system diagram
```

The local stack uses Postgres, MinIO for S3-compatible recording storage, and LocalStack SQS for analysis jobs. See [docs/system_diagram.md](docs/system_diagram.md) and [docs/architecture.md](docs/architecture.md).

## Running Locally

Run the whole platform:

```sh
docker compose up --build
```

Services:

- Frontend: `http://localhost:7653`
- API: `http://localhost:7654`
- Postgres: `localhost:7655`
- MinIO API: `http://localhost:7656`
- MinIO console: `http://localhost:7657`
- LocalStack edge: `http://localhost:7658`

Frontend-only development is still available:

```sh
pnpm install
pnpm --filter @guitar/frontend dev
```

## Verification

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
docker compose config
```

Backend tests require Python dependencies:

```sh
cd apps/backend
python3 -m pip install -e ".[dev]"
python3 -m pytest
```

### Chord Detection Evals

Offline chord detection evals benchmark the browser production detector, the Python DSP baseline, and the Python Solitito backend detector against public labelled guitar datasets. They are manual because the first full run downloads about 2.1 GB of cached dataset files.

```sh
pnpm eval:chords:prepare
pnpm eval:chords
pnpm eval:chords:frontend
pnpm eval:chords:python
pnpm eval:chords:python -- --detector solitito
pnpm eval:chords:models
pnpm eval:chords:compare
pnpm eval:chords -- --limit 100
pnpm eval:chords -- --force
```

Datasets, Solitito model assets, and per-sample results are cached in `.eval-cache/chord-detection/`, which is ignored by git. Latest reports are written under `.eval-cache/chord-detection/reports/{frontend,python,python-solitito,comparison}/`; see [apps/frontend/evals/chord-detection/README.md](apps/frontend/evals/chord-detection/README.md) for details.

Current full target-aware + WCSR evals, generated 2026-05-29 IST:

| Implementation | Evaluated | Duration | Top-1 accuracy | Exact WCSR | Root WCSR | Maj-Min WCSR | Verifier recall | Verifier weighted recall | False accept trials | Wrong-accept samples |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Frontend `42dbecafd82639db` | 955 | 2502.5s | 14.3% | 13.3% | 37.3% | 30.5% | 10.1% | 9.5% | 0.7% | 11.8% |
| Python DSP `24601413f5c157c8` | 955 | 2502.5s | 14.2% | 13.2% | 37.7% | 30.7% | 9.7% | 9.3% | 0.7% | 11.0% |
| Python Solitito `397a440dd8aa9433` | 955 | 2502.5s | 72.4% | 74.7% | 82.8% | 78.5% | 53.2% | 57.4% | 0.2% | 4.0% |

## Privacy and Consent

Realtime feedback stays in the browser. Recording upload is only enabled after explicit consent in Settings. The current implementation creates anonymous learner profiles; full account auth, retention controls, export, and deletion are planned before production use with real users.

## Status

Work-in-progress platform scaffold. The worker runs Solitito ONNX chord analysis for consented WAV `chord_check` recordings and keeps placeholder analysis for other activity types.

## License

MIT. See [LICENSE](LICENSE).
