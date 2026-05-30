# Architecture

This document describes the end-to-end Guitar Coach architecture. For the stack rationale, see [stack.md](stack.md). For product behavior, see [software_requirements.md](software_requirements.md). For a visual system view, see [system_diagram.md](system_diagram.md).

## 1. High-Level Shape

Guitar Coach is a monorepo with a React frontend, FastAPI backend, Postgres database, MinIO object storage, LocalStack SQS queue, and an async worker.

Immediate musical feedback stays in the browser. The backend receives consented session recordings, persists metadata, queues analysis, and exposes single-learner profile, curriculum, plan, song, journal, retention, and progress read models. The current product scope is a complete local-first single-user learning platform; cloud deployment and multi-user production auth are intentionally skipped.

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
  - Owns Today, profile onboarding, deterministic local coaching rules, structured lessons, local seed songs, progress dashboard, checked ear/fretboard trainers, and tools navigation.
  - Stores local settings, preferred microphone input, single learner profile fields, progress items, song progress, session summaries, local journal notes, pending backend sync records, and anonymous learner identifiers in IndexedDB. Today onboarding and Settings edits save locally first. On startup it drains pending profile/session syncs and restores the singleton backend learner profile/progress/session/journal export into IndexedDB, including completion status and learner-facing result summaries, when the API is available. Microphone labels and device identifiers stay browser-local by default.
  - Requests browser speech processing off for instrument capture and uploads recordings to the API only after explicit consent.

- **API (`apps/backend/app/main.py`)**
  - Owns HTTP contracts, singleton local learner creation, learner/session/recording metadata, session-derived progress updates, single profile persistence, consent history, learning path reads, practice plan reads, song progress, journal notes, recording export/delete metadata, history reads, and progress reads.
  - Writes relational data to Postgres.
  - Writes audio bytes to MinIO through an S3-compatible adapter.
  - Enqueues recording-analysis jobs to SQS.

- **Worker (`apps/backend/app/worker.py`)**
  - Polls SQS, loads job/recording metadata, runs asynchronous analysis, and writes results.
  - Runs local autocorrelation tuner analysis for consented WAV `tuner` recordings.
  - Runs the pinned Solitito ONNX detector for consented WAV `chord_check` recordings and supported `practice_drill` chord attempts.
  - Writes placeholder metrics for activity types whose deeper extraction is not implemented yet.

- **Python chord eval bench (`apps/backend/app/evals/chord_detection`)**
  - Reads the same prepared `.eval-cache/chord-detection` datasets as the frontend eval CLI.
  - Runs the classical DSP verifier by default and can run the Solitito backend detector with `--detector solitito`.
  - Is not part of the realtime browser feedback path.

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
- `GET /v1/learners/{learner_id}/profile`
- `PUT /v1/learners/{learner_id}/profile`
- `POST /v1/consents/recording`
- `GET /v1/learners/{learner_id}/learning-path`
- `GET /v1/learners/{learner_id}/practice-plan`
- `GET /v1/learners/{learner_id}/dashboard`
- `GET /v1/learners/{learner_id}/export`
- `POST /v1/learners/{learner_id}/progress-items`
- `POST /v1/learners/{learner_id}/lessons/{lesson_id}/complete`
- `GET /v1/learners/{learner_id}/songs`
- `PATCH /v1/learners/{learner_id}/songs/{song_id}`
- `POST /v1/sessions` (optionally accepts a client-generated session id and start time for local-first/idempotent session sync)
- `PATCH /v1/sessions/{session_id}`
- `GET /v1/sessions/{session_id}/journal`
- `POST /v1/sessions/{session_id}/journal`
- `POST /v1/sessions/{session_id}/recordings`
- `GET /v1/learners/{learner_id}/history`
- `GET /v1/sessions/{session_id}`
- `GET /v1/recordings/{recording_id}/media`
- `POST /v1/recordings/{recording_id}/export`
- `DELETE /v1/recordings/{recording_id}`
- `GET /v1/recordings/{recording_id}/analysis`
- `GET /v1/learners/{learner_id}/progress`

The API uses one durable local learner/profile for now. Multi-user account auth is out of scope for this stage.
`POST /v1/learners` accepts the browser's current anonymous id, guarantees the singleton profile row exists, and if any learner already exists in the local database returns that existing learner instead of creating another one. The frontend stores the returned learner id and anonymous id as the durable local account reference.

## 6. Browser Learning, Recording, and Analysis Flow

1. Learner completes Today onboarding or edits Settings to create the one local profile.
2. Frontend saves onboarding and Settings profile edits into IndexedDB before requiring the API. When the API is reachable, it asks for the local learner; the API creates the first learner once and returns that same learner on later anonymous-id changes. At startup the frontend pushes any pending local profile, consent, tuner, chord-check, lesson, song, trainer, or technique syncs, then imports the backend profile, progress items, closed-session summaries, and synced journal notes into IndexedDB so a browser storage reset can recover the durable local account without losing stopped/completed status, result text, or practice notes. If the browser has an onboarded profile but the backend profile is still default, the frontend pushes the local profile to the backend instead of overwriting it.
3. Today builds a deterministic 10/20/45 minute plan from profile, IndexedDB progress, sessions, weak chords/transitions, lessons, and songs.
4. Tuner, chord-check, practice, song practice, interval/chord-quality/progression ear training, all-string fretboard trainers, and lesson experiences continue using browser-local feedback where latency matters.
5. Learn glossary and structured lessons use browser visuals/audio without requiring microphone access or recording upload.
6. The learner can choose a browser `audioinput` device before starting the audio engine. If that preferred device is unavailable, the browser default input is used and the learner is told. Tools also exposes a browser-only audio calibration check that runs the same AudioWorklet level path, classifies signal quality, shows a coarse AudioContext latency estimate, and stores only the last quality category in IndexedDB.
7. When meaningful tuner, chord-check, lesson, practice, song-practice, ear-training, fretboard, or technique activity starts, the frontend creates or later syncs a backend session with configuration metadata even if recording consent is off. Tuner, chord-check, chord-change, progression, timed chord, strumming, lesson, song practice, checked trainer attempts, and self-rated technique practice use browser-generated session ids so local history and backend restore refer to the same work. Local and backend summaries preserve completion status and result text; stopped local sessions remain durable history without awarding score or mastery. If a completed local session cannot reach the API, an IndexedDB pending-sync record retries the idempotent backend start/close later; song completions include the song-progress patch in that retry payload, and repeated song-progress patches do not double-count sections that were already completed.
8. If recording consent is on, the frontend also starts a raw PCM WAV recorder on the existing mic stream before app DSP. `MediaRecorder` is retained only as a compressed fallback when raw recording is unavailable.
9. When the session stops, the frontend closes the backend session with result metadata such as tuning completion, lesson completion, checked trainer results, self-rated technique work, scores, score breakdowns, attempts, stopped song loops, and completed song sections. The API derives durable progress items for tuning, lessons, chords, transitions, rhythm, ear training, fretboard work, technique, scales, and theory from that metadata, while song section completion also patches the song progress endpoint and creates stable `song-section` progress items such as `open-road-study:verse`, so guidance improves even when recording consent is off.
10. For consented recordings only, the frontend uploads the recorded audio blob to the API.
11. API stores metadata in Postgres, stores consented audio in MinIO, and enqueues an SQS analysis job for saved recordings.
12. Worker consumes the job and writes `AnalysisResult` rows. Tuner recordings get pitch-stability metrics; chord checks are analyzed as one target chord; supported practice drills are segmented by saved BPM/timing metadata and analyzed per attempt.
13. History responses include per-recording analysis summaries with verified backend practice scores, recording export/delete controls, and `GET /v1/recordings/{recording_id}/analysis` exposes detailed learner-facing feedback.
14. History uses IndexedDB session summaries immediately and overlays richer backend history when the API is available, so local practice remains reviewable during backend outages. Practice notes are written to IndexedDB first and then synced to backend journal entries when a backend session is available; startup restore drains pending sessions before retrying unsynced notes, imports backend journal notes into IndexedDB, and History refresh retries note sync again. History and progress endpoints use profile, progress items, target evidence, sessions, songs, journal notes, grace-day-aware streaks, weekly/monthly recaps, and analysis history to guide the learner.
15. Settings can export the local account metadata as JSON, including profile, progress items, session summaries, local journal entries, and recording retention counts. The download always includes the IndexedDB account snapshot and includes the backend export when reachable. Raw audio export remains per recording from History.

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

- **Frontend unit tests:** Vitest for DSP, scoring, stores, curriculum data, coaching rules, glossary data, and components.
- **Frontend e2e:** Playwright with fake media devices.
- **Chord detection evals:** Manual target-aware + WCSR eval harnesses against cached public labelled guitar datasets. Run the browser production path with `pnpm eval:chords` or `pnpm eval:chords:frontend`, run the Python DSP bench with `pnpm eval:chords:python`, run Solitito with `pnpm eval:chords:python -- --detector solitito`, and generate side-by-side frontend/Python-DSP reports with `pnpm eval:chords:compare`. Outputs live under `.eval-cache/chord-detection/reports/{frontend,python,python-solitito,comparison}/`.
- **Backend unit/API tests:** Pytest with SQLite and fake storage/queue dependencies.
- **Compose smoke:** `docker compose config`, `docker compose up --build`, `/health`, and a recording-upload path.

## 9. Cloud Mapping

The local stack is intentionally AWS-shaped:

- Postgres -> Amazon RDS/PostgreSQL.
- MinIO -> Amazon S3.
- LocalStack SQS -> Amazon SQS.
- API -> ECS/Fargate, App Runner, or Kubernetes.
- Worker -> ECS/Fargate service, Kubernetes worker deployment, or another container runner.
