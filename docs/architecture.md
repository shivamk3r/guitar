# Architecture

This document describes the end-to-end Guitar Coach architecture. For the stack rationale, see [stack.md](stack.md). For product behavior, see [software_requirements.md](software_requirements.md). For a visual system view, see [system_diagram.md](system_diagram.md).

## 1. High-Level Shape

Guitar Coach is a monorepo with a React frontend, FastAPI backend, Postgres database, MinIO object storage, LocalStack SQS queue, and an async worker.

Immediate musical feedback stays in the browser. The backend receives consented session recordings, persists metadata, queues analysis, and exposes progress read models.

## 2. Repository Layout

```text
guitar/
├── apps/
│   ├── frontend/       # Vite + React app, Web Audio, local UI state
│   └── backend/        # FastAPI API, SQLAlchemy models, worker, tests
├── infra/
│   └── localstack/     # local SQS bootstrap
├── docs/
├── docker-compose.yml
├── pnpm-workspace.yaml
├── AGENTS.md
└── CLAUDE.md
```

## 3. Service Boundaries

- **Frontend (`apps/frontend`)**
  - Owns React routes, UI, Web Audio/AudioWorklet DSP, target-aware chord verification, immediate scoring, browser-only Learn lessons, and raw browser recording orchestration.
  - Stores local settings, preferred microphone input, and anonymous learner identifiers in IndexedDB. Microphone labels and device identifiers stay browser-local by default.
  - Requests browser speech processing off for instrument capture and uploads recordings to the API only after explicit consent.

- **API (`apps/backend/app/main.py`)**
  - Owns HTTP contracts, learner/session/recording metadata, consent history, history reads, and progress reads.
  - Writes relational data to Postgres.
  - Writes audio bytes to MinIO through an S3-compatible adapter.
  - Enqueues recording-analysis jobs to SQS.

- **Worker (`apps/backend/app/worker.py`)**
  - Polls SQS, loads job/recording metadata, runs asynchronous analysis, and writes results.
  - The current worker writes placeholder metrics; later milestones add real extraction.

- **Python chord eval bench (`apps/backend/app/evals/chord_detection`)**
  - Reads the same prepared `.eval-cache/chord-detection` datasets as the frontend eval CLI.
  - Mirrors the classical DSP verifier for research and comparison only.
  - Is not part of the realtime browser feedback path or the backend worker path in this milestone.

- **Infrastructure**
  - Postgres persists relational state.
  - MinIO simulates S3 for recordings.
  - LocalStack simulates SQS for analysis jobs.

## 4. Frontend Architecture Rules

The existing frontend feature isolation still applies inside `apps/frontend/src`.

- Features must not import from other features.
- Shared code belongs in `audio/`, `storage/`, `data/`, `ui/`, `api/`, or `lib/`.
- Static lesson/glossary content belongs in `data/`; feature screens can render it without backend calls.
- AudioWorklet code stays plain TypeScript/JavaScript with no React or DOM dependencies.
- High-frequency audio events must not be stored in React state.
- Recording is an outer session concern; it must not slow or replace the real-time DSP path.

## 5. Backend API Contracts

Initial v1 endpoints:

- `GET /health`
- `POST /v1/learners`
- `POST /v1/consents/recording`
- `POST /v1/sessions`
- `PATCH /v1/sessions/{session_id}`
- `POST /v1/sessions/{session_id}/recordings`
- `GET /v1/learners/{learner_id}/history`
- `GET /v1/sessions/{session_id}`
- `GET /v1/recordings/{recording_id}/media`
- `GET /v1/learners/{learner_id}/progress`

The API uses anonymous learner profiles for now. Account auth is a later milestone.

## 6. Browser Learning, Recording, and Analysis Flow

1. Learner enables recording consent in Settings.
2. Frontend creates or reuses an anonymous learner profile.
3. Tuner, chord-check, and practice sessions continue using Web Audio for immediate feedback.
4. Learn glossary lessons use Web Audio synthesis and UI animation without microphone access or backend calls.
5. The learner can choose a browser `audioinput` device before starting the audio engine. If that preferred device is unavailable, the browser default input is used and the learner is told.
6. When meaningful tuner, chord-check, or practice activity starts, the frontend creates a backend session with configuration metadata even if recording consent is off.
7. If recording consent is on, the frontend also starts a raw PCM WAV recorder on the existing mic stream before app DSP. `MediaRecorder` is retained only as a compressed fallback when raw recording is unavailable.
8. When the session stops, the frontend closes the backend session with result metadata such as tuning completion, scores, score breakdowns, and attempts.
9. For consented recordings only, the frontend uploads the recorded audio blob to the API.
10. API stores metadata in Postgres, stores consented audio in MinIO, and enqueues an SQS analysis job for saved recordings.
11. Worker consumes the job and writes `AnalysisResult` rows.
12. History and progress endpoints use session and analysis history to guide the learner.

## 7. Local Runtime

`docker compose up --build` runs:

- `frontend` on `http://localhost:7653`
- `api` on `http://localhost:7654`
- `worker`
- `postgres` on `localhost:7655`
- `minio` on `localhost:7656` and console on `localhost:7657`
- `localstack` on `localhost:7658`

Persistent Docker volumes keep Postgres, MinIO, and LocalStack state across restarts.

## 8. Testing Strategy

- **Frontend unit tests:** Vitest for DSP, scoring, stores, glossary data, and components.
- **Frontend e2e:** Playwright with fake media devices.
- **Chord detection evals:** Manual target-aware + WCSR eval harnesses against cached public labelled guitar datasets. Run the browser production path with `pnpm eval:chords` or `pnpm eval:chords:frontend`, run the Python research bench with `pnpm eval:chords:python`, and generate side-by-side reports with `pnpm eval:chords:compare`. Outputs live under `.eval-cache/chord-detection/reports/{frontend,python,comparison}/`.
- **Backend unit/API tests:** Pytest with SQLite and fake storage/queue dependencies.
- **Compose smoke:** `docker compose config`, `docker compose up --build`, `/health`, and a recording-upload path.

## 9. Cloud Mapping

The local stack is intentionally AWS-shaped:

- Postgres -> Amazon RDS/PostgreSQL.
- MinIO -> Amazon S3.
- LocalStack SQS -> Amazon SQS.
- API -> ECS/Fargate, App Runner, or Kubernetes.
- Worker -> ECS/Fargate service, Kubernetes worker deployment, or another container runner.
