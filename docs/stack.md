# Stack Decision

**Status:** accepted (2026-05-28)
**Scope:** end-to-end local-first learning platform.

## Summary

| Area | Choice |
| --- | --- |
| Frontend | Vite + React 18 + TypeScript strict |
| Frontend state | Zustand + IndexedDB (`idb`) |
| Realtime audio | Web Audio + AudioWorklet |
| Backend API | FastAPI |
| Backend persistence | Postgres + SQLAlchemy |
| Audio/object storage | MinIO locally, S3 later |
| Queue | LocalStack SQS locally, Amazon SQS later |
| Worker | Python worker sharing backend domain modules |
| Local runtime | Docker Compose |
| Frontend tests | Vitest + Playwright |
| Audio evals | TypeScript frontend CLI + Python DSP/Solitito eval CLI with cached public datasets |
| Backend tests | Pytest |
| Frontend lint/format | Biome |
| Package manager | pnpm workspace |

## Why This Shape

- **Vite stays.** The app still depends on microphone permission and browser audio APIs; server rendering does not help the core learning loop.
- **FastAPI fits the backend.** Python is a good fit for future audio analysis, ML experimentation, and API development.
- **Postgres owns durable relational state.** Learners, consents, sessions, recordings, jobs, and results need queryable history.
- **MinIO keeps local S3 parity.** Audio recordings should be object storage, not database blobs.
- **LocalStack SQS keeps queue semantics AWS-compatible.** The worker path can later move to Amazon SQS without changing the application boundary.
- **Docker Compose is the default local runtime.** Contributors should be able to run the whole platform locally with persistent data.

## Frontend Notes

Immediate tuner, chord, and rhythm feedback remains browser-side to meet latency requirements. The frontend records consented sessions from the unprocessed mic stream as PCM WAV before app analysis, uploads completed recordings to the API, and does not upload high-frequency audio analysis events.

Chord detection reliability is measured by manual eval CLIs in `apps/frontend/evals/chord-detection` and `apps/backend/app/evals/chord_detection`. The frontend CLI reuses the browser detector code path and remains the production real-time instrument. The Python CLI can run the classical DSP baseline or the pinned Solitito ONNX backend detector. Both read prepared public labelled guitar datasets under `.eval-cache/chord-detection/`, write the same target-aware report schema, and report top-1 accuracy, WCSR variants, verifier recall, positive rejects, uncertain outcomes, false-accept trials, wrong-accept samples, per-chord metrics, and confusion matrices.

## Backend Notes

The backend starts with SQLAlchemy table creation rather than a migration framework. Add Alembic before production or before multiple deployed environments need schema upgrades.

The worker runs Solitito ONNX analysis for consented WAV `chord_check` recordings and supported `practice_drill` chord attempts, then writes structured target-aware feedback and conservative verified practice scores for history. It writes placeholder analysis results for activity types whose deeper analysis is not implemented yet. Full tuning, rhythm, and guidance models belong to later milestones.

## Deferred

- Account authentication and authorization.
- Production retention/export/delete flows.
- Alembic migrations.
- Full ML model training/inference pipeline.
- Production AWS deployment manifests.
