# CLAUDE.md

Agent-facing guide to this repository. Human-facing overview is in [README.md](README.md).

## What this is

Guitar Coach: a browser-based guitar learning app for beginners. Three features — tuner, chord library, practice — built around real-time microphone feedback and a 1–10 scoring system. Frontend-only in v1, no backend.

## Source of truth for design

Before making non-trivial changes, read:

- [docs/software_requirements.md](docs/software_requirements.md) — what the app does. Requirements are labelled (FR-T1, NFR-1, etc.); reference these when justifying changes.
- [docs/stack.md](docs/stack.md) — technology choices. Don't introduce a new dependency without a reason that fits the rationale here.
- [docs/architecture.md](docs/architecture.md) — code layout and module boundaries. The "hard rule" that features don't import from each other is enforced by convention; respect it.

If the change conflicts with what's in `docs/`, update the doc in the same commit. Docs lag is how specs become fiction.

## Stack at a glance

Vite · React 18 · TypeScript (strict) · Tailwind · Zustand · Web Audio + AudioWorklet · IndexedDB (`idb`) · Vitest + Playwright · Biome · pnpm.

Rationale lives in [docs/stack.md](docs/stack.md).

## Repo layout (once scaffolded)

```
guitar/
├── CLAUDE.md          <- you are here
├── README.md
├── docs/              <- all design docs
├── src/
│   ├── app/           <- app shell, routing
│   ├── features/      <- tuner, chord-library, practice (isolated slices)
│   ├── audio/         <- AudioEngine + AudioWorklet DSP
│   ├── data/          <- chord and progression definitions
│   ├── storage/       <- IndexedDB wrappers
│   ├── ui/            <- shared presentational components
│   └── lib/           <- generic utilities
├── public/
└── tests/             <- Playwright e2e
```

The scaffold itself hasn't been created yet. First code change will set it up.

## Conventions

- **TypeScript strict.** No `any` unless justified in a comment on that line.
- **Features are isolated.** `src/features/<a>/` must not import from `src/features/<b>/`. Share via `audio/`, `storage/`, `data/`, `ui/`, `lib/`.
- **Tests next to code.** `foo.ts` has `foo.test.ts` in the same folder. Playwright specs live in `tests/`.
- **No React in the audio thread.** AudioWorklet code is plain TypeScript, no DOM access.
- **No audio events in React state.** Audio events fire faster than React reconciles; write to a Zustand store and let React subscribe.
- **File size.** Keep source files under ~300 lines. Split when they grow.
- **Comments.** Explain *why* only, and only when the answer isn't obvious. Never describe *what* the code does.

## Commands

```
pnpm install          # install deps
pnpm dev              # Vite dev server (localhost:5173)
pnpm build            # production build (dist/)
pnpm preview          # serve the built output
pnpm test             # Vitest (unit + pipeline)
pnpm test:e2e         # Playwright (builds + serves + runs)
pnpm lint             # Biome check
pnpm format           # Biome format --write
pnpm typecheck        # tsc -b --noEmit
```

## Web Audio gotchas agents regularly miss

- `AudioContext` must be created *after* a user gesture. Creating it at module load time produces a "suspended" context that silently won't run.
- `getUserMedia` must be called from a secure context. Vite's dev server is `http://localhost` which counts as secure; production requires HTTPS.
- `autoGainControl` **off**. AGC distorts the signals we're analyzing.
- AudioWorklet modules are separate files loaded by URL, not bundled imports. Vite has a `?worker` / worklet story for this — follow the pattern used in `src/audio/` when it lands.
- The worklet's `currentTime` (via `AudioWorkletGlobalScope`) is the authoritative clock for onset timestamps. Don't use `performance.now()` for rhythm alignment.

## What agents should not do here

- Don't add a framework on top of React (Next.js, Remix, etc.) without opening a design discussion — see [docs/stack.md](docs/stack.md) for why Vite was chosen.
- Don't upload audio anywhere. Privacy is a product promise (NFR-3).
- Don't introduce a global event bus or shared mutable singletons. Use the typed `AudioEngine` API and Zustand stores.
- Don't scaffold new "utility" folders (`utils/`, `helpers/`, `common/`) — use the existing `lib/` or propose a rename in `docs/architecture.md`.
- Don't add comments describing what code does. If the code needs explaining, rename and restructure first.

## Where to learn more

- Milestones: [docs/software_requirements.md](docs/software_requirements.md) §11.
- Scoring rubric: [docs/software_requirements.md](docs/software_requirements.md) §10.
- Audio pipeline detail: [docs/architecture.md](docs/architecture.md) §4.
