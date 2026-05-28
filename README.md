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

Offline chord detection evals benchmark the browser production detector and the Python research bench against public labelled guitar datasets. They are manual because the first full run downloads about 2.1 GB of cached dataset files.

```sh
pnpm eval:chords:prepare
pnpm eval:chords
pnpm eval:chords:frontend
pnpm eval:chords:python
pnpm eval:chords:compare
pnpm eval:chords -- --limit 100
pnpm eval:chords -- --force
```

Datasets and per-sample results are cached in `.eval-cache/chord-detection/`, which is ignored by git. Latest reports are written under `.eval-cache/chord-detection/reports/{frontend,python,comparison}/`; see [apps/frontend/evals/chord-detection/README.md](apps/frontend/evals/chord-detection/README.md) for details.

Current full target-aware evals, generated 2026-05-29 IST:

| Implementation | Evaluated | Top-1 accuracy | Verifier recall | False accept trials | Wrong-accept samples |
| --- | ---: | ---: | ---: | ---: | ---: |
| Frontend `b2bc7dcc3144d973` | 955 | 14.3% | 10.1% | 0.7% | 11.8% |
| Python `8f17959faef3430b` | 955 | 14.2% | 9.7% | 0.7% | 11.0% |

## Privacy and Consent

Realtime feedback stays in the browser. Recording upload is only enabled after explicit consent in Settings. The current implementation creates anonymous learner profiles; full account auth, retention controls, export, and deletion are planned before production use with real users.

## Status

Work-in-progress platform scaffold. The worker currently writes placeholder analysis results; deeper audio-derived skill modeling is a later milestone.

## License

MIT. See [LICENSE](LICENSE).
