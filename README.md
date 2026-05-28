# Guitar Coach

[![CI](https://github.com/shivamk3r/guitar/actions/workflows/ci.yml/badge.svg)](https://github.com/shivamk3r/guitar/actions/workflows/ci.yml)

Guitar Coach is an end-to-end app for learning guitar. The goal is that a learner should not need anything outside the app, except a guitar, themselves, and normal physical accessories, to tune, practice, measure progress, and know what to work on next.

The app has two feedback loops:

1. **Immediate browser feedback** - Web Audio and AudioWorklet analyze pitch, chords, and timing in real time so tuner and practice feedback stays fast.
2. **Long-term learning analysis** - with explicit consent, tuning, chord-check, and practice sessions are recorded, uploaded to the local backend, stored, queued for analysis, and used to build progress guidance over time.

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

- Frontend: `http://localhost:5173`
- API: `http://localhost:8000`
- MinIO console: `http://localhost:9001`
- LocalStack edge: `http://localhost:4566`
- Postgres: `localhost:5432`

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

## Privacy and Consent

Realtime feedback stays in the browser. Recording upload is only enabled after explicit consent in Settings. The current implementation creates anonymous learner profiles; full account auth, retention controls, export, and deletion are planned before production use with real users.

## Status

Work-in-progress platform scaffold. The worker currently writes placeholder analysis results; deeper audio-derived skill modeling is a later milestone.

## License

MIT. See [LICENSE](LICENSE).
