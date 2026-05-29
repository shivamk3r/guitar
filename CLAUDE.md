# AGENTS.md

Agent-facing guide to this repository. Human-facing overview is in [README.md](README.md). Keep this aligned with [CLAUDE.md](CLAUDE.md).

## What This Is

Guitar Coach is an end-to-end app for learning guitar. It combines immediate browser audio feedback with consented recording, backend persistence, asynchronous analysis, and future progress guidance.

## Read First

- [docs/software_requirements.md](docs/software_requirements.md) - product requirements and data policy.
- [docs/stack.md](docs/stack.md) - accepted technology choices.
- [docs/architecture.md](docs/architecture.md) - monorepo, service boundaries, and runtime.
- [docs/system_diagram.md](docs/system_diagram.md) - browser/API/storage/queue/worker diagram.

If implementation and docs disagree, update the docs in the same change.

## Current Stack

- Frontend: Vite, React 18, TypeScript strict, Tailwind, Zustand, IndexedDB, Web Audio, AudioWorklet.
- Backend: FastAPI, SQLAlchemy, Postgres, MinIO, LocalStack SQS, Python worker.
- Tests/evals: Vitest, Playwright, Pytest, manual target-aware + WCSR chord detection evals for frontend and Python research bench.
- Tooling: pnpm workspace, Biome, Docker Compose.

## Layout

```text
apps/frontend/   React app, browser audio pipeline, frontend tests
apps/backend/    FastAPI app, SQLAlchemy models, worker, backend tests
infra/           local infrastructure bootstrap
docs/            source-of-truth design docs
```

## Commands

```sh
docker compose up --build
docker compose config
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm eval:chords
pnpm eval:chords:frontend
pnpm eval:chords:python
pnpm eval:chords:compare
pnpm eval:chords:prepare
```

Backend-only:

```sh
cd apps/backend
python3 -m pip install -e ".[dev]"
python3 -m pytest
```

## Rules

- Immediate musical feedback stays browser-side for latency.
- Recording/upload requires explicit learner consent.
- The frontend uploads recordings through the API, not directly to MinIO.
- Audio bytes go to object storage; metadata goes to Postgres.
- Analysis work goes through SQS and the worker.
- Frontend features remain isolated from each other.
- Do not store high-frequency audio events in React state.
- Keep files focused and split them before they become hard to review.
