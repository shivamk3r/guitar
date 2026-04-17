# Architecture

This document describes how Guitar Coach is structured. For the stack decision, see [stack.md](stack.md). For product requirements, see [software_requirements.md](software_requirements.md).

## 1. High-level shape

Single-page React app with a dedicated real-time audio pipeline. No backend in v1. All data stays on the device.

```
┌──────────────────────────────────────────────────────────────┐
│  React app (main thread)                                     │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐  │
│  │ features/      │  │ features/      │  │ features/      │  │
│  │   tuner        │  │   chord-lib    │  │   practice     │  │
│  └──────┬─────────┘  └──────┬─────────┘  └──────┬─────────┘  │
│         │                   │                   │             │
│         └──────────┬────────┴──────────┬────────┘             │
│                    ▼                   ▼                      │
│            ┌───────────────┐   ┌───────────────┐              │
│            │ src/audio     │   │ src/storage   │              │
│            │ (engine API)  │   │ (IndexedDB)   │              │
│            └──────┬────────┘   └───────────────┘              │
└───────────────────┼───────────────────────────────────────────┘
                    │ port.postMessage
                    ▼
┌──────────────────────────────────────────────────────────────┐
│  AudioWorklet (audio thread, real-time)                      │
│  - pitch detection (YIN)                                     │
│  - onset detection (spectral flux)                           │
│  - chroma / chord features                                   │
└──────────────────────────────────────────────────────────────┘
```

## 2. Layers and dependency rules

Four layers. Dependencies point downward only.

1. **features/** — one directory per top-level feature (`tuner`, `chord-library`, `practice`). Each feature owns its UI, its local state, and its composition of lower-layer services.
2. **audio/**, **storage/**, **data/**, **ui/**, **lib/** — stable services with narrow, typed APIs. These are shared across features.
3. **app/** — the shell: root component, routing, error boundaries, global providers. Imports features but features do not import `app/`.
4. **platform** — `index.html`, `main.tsx`, `vite.config.ts`, service worker. Boots the app.

**Hard rule:** a feature does not import from another feature. If two features need the same thing, that thing moves down into a shared layer. This keeps features replaceable and reviewable in isolation, and gives agents a predictable graph.

## 3. Directory layout

```
src/
├── app/
│   ├── App.tsx                 # root component, route shell
│   ├── routes.tsx              # route table
│   └── providers.tsx           # global providers (theme, toast, etc.)
├── features/
│   ├── tuner/
│   │   ├── TunerPage.tsx
│   │   ├── tuner-store.ts      # Zustand slice scoped to this feature
│   │   ├── TunerNeedle.tsx
│   │   └── tuner-store.test.ts
│   ├── chord-library/
│   │   ├── ChordLibraryPage.tsx
│   │   ├── ChordDetail.tsx
│   │   ├── chord-check-store.ts
│   │   └── ...
│   └── practice/
│       ├── PracticePage.tsx
│       ├── drills/
│       │   ├── ChordChangeDrill.tsx
│       │   ├── ProgressionDrill.tsx
│       │   └── StrummingDrill.tsx
│       ├── practice-store.ts
│       └── scoring.ts          # 1–10 score computation (pure)
├── audio/
│   ├── engine.ts               # public API: createAudioEngine()
│   ├── engine.test.ts
│   ├── worklet/
│   │   ├── analyzer.worklet.ts # AudioWorkletProcessor entry
│   │   ├── yin.ts              # pitch detection
│   │   ├── onset.ts            # spectral flux onset detector
│   │   └── chroma.ts           # chord chroma features
│   ├── events.ts               # typed event shapes
│   └── calibration.ts
├── data/
│   ├── chords.ts               # chord definitions (typed, static)
│   ├── progressions.ts
│   └── tunings.ts
├── storage/
│   ├── db.ts                   # idb schema + open()
│   ├── settings-store.ts       # persistent settings (Zustand + idb)
│   └── progress-store.ts       # personal bests, session history
├── ui/
│   ├── Button.tsx
│   ├── Fretboard.tsx           # shared SVG fretboard diagram
│   └── ...
├── lib/
│   ├── math.ts
│   ├── events.ts               # tiny typed event-emitter
│   └── assert.ts
└── main.tsx
```

## 4. The audio pipeline

This is the most technical part of the app. It is explicitly carved out as its own module so it can be reasoned about independently of UI.

### 4.1 Lifecycle

1. **Before first gesture**: nothing runs. `AudioContext` cannot be created.
2. **User clicks "Start" (in Tuner, Chord Check, or Practice)**:
   - Create `AudioContext({ sampleRate: 48000, latencyHint: 'interactive' })`.
   - Request mic: `navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false } })`. `autoGainControl` is off because AGC distorts pitch-stability signals.
   - Load the worklet module: `ctx.audioWorklet.addModule('/audio/analyzer.worklet.js')`.
   - Wire: `source → analyzerNode → ctx.destination` (analyzer does not produce audio; we route to destination with gain 0 to keep the graph alive).
3. **During use**: the AudioWorklet emits typed events via its port; the main thread's `AudioEngine` turns them into calls on subscribers.
4. **On feature unmount / page blur**: stop tracks, disconnect nodes, close the context to release the mic.

### 4.2 Why AudioWorklet and not main-thread analysis

- **Real-time constraints.** The audio thread runs at a fixed quantum (128 frames ≈ 2.67 ms at 48 kHz). Code in the worklet can't be preempted by GC pauses on the main thread.
- **Latency.** Any main-thread analysis adds the render-loop's jitter to the result. Onset timestamps must have ≤20 ms accuracy (per requirements §6), which is hard to meet without the audio thread.
- **`ScriptProcessorNode` is deprecated.** AudioWorklet is the supported path.

### 4.3 Event shapes

Events are plain JSON objects. The worklet doesn't reference DOM or any React types.

```ts
// audio/events.ts
export type AudioEvent =
  | { type: 'pitch';  hz: number;   cents: number;   confidence: number;   t: number }
  | { type: 'onset';  strength: number;   t: number }
  | { type: 'chroma'; chroma: Float32Array;   t: number };
```

`t` is an `AudioContext.currentTime`-based timestamp so rhythm drills can align strums to the metronome without wall-clock jitter.

### 4.4 Public API (audio/engine.ts)

```ts
export interface AudioEngine {
  start(): Promise<void>
  stop(): Promise<void>
  on<T extends AudioEvent['type']>(type: T, handler: (e: Extract<AudioEvent, { type: T }>) => void): () => void
  readonly state: 'idle' | 'starting' | 'running' | 'stopping' | 'error'
}

export function createAudioEngine(options?: { deviceId?: string }): AudioEngine
```

Features consume this and never touch `AudioContext` directly. One engine per app; features subscribe to the events they care about.

### 4.5 Feature → engine mapping

- **Tuner** subscribes to `pitch`. Displays detected note and cents deviation.
- **Chord check** subscribes to `onset` and `chroma`. On an onset, it captures the next ~200 ms of chroma and classifies.
- **Practice drills** subscribe to `onset`, `chroma`, and (for some drills) `pitch`. They time-align events against the metronome and emit scored events to `practice-store`.

## 5. State model

Three persistence tiers, chosen per data's role.

### 5.1 Persistent (IndexedDB via `storage/`)
- **Settings** — tuning choice, metronome preference, calibration profile.
- **Progress** — per-chord best scores, per-transition BPM ceilings, session summaries.

These are exposed as Zustand stores in `storage/` that hydrate from `idb` on boot and write through on change.

### 5.2 Global in-memory (Zustand stores)
- **AudioState** — engine state, selected input device, calibration result. Not persisted beyond device selection.
- **Navigation / UI state** — current route, modal stack. Mostly handled by the router, not a store.

### 5.3 Feature-local
- Scoped Zustand slice per feature (`features/*/\*-store.ts`), or plain `useState`/`useReducer` for component-local state.
- Feature stores may read from global stores but do not export mutators for them.

**Rule:** never hold audio event objects in React state. Write to the feature store and let React subscribe; audio events fire too fast to round-trip through React reconciliation.

## 6. Scoring

The 1–10 scoring logic (spec §10) lives in `features/practice/scoring.ts` as pure functions:

```ts
export function scoreEvent(input: {
  expectedChord?: ChordId
  detectedChord?: ChordId
  strings: StringState[]           // length 6; each: clean | dull | muted | wrong
  timingDeltaMs?: number           // undefined in free-strum mode
}): ScoredEvent { /* ... */ }
```

Pure functions make this trivially testable against fixtures — the scoring rubric is the most important thing to get right and the easiest thing to regress silently.

## 7. Performance budget

| Path                               | Target                  |
| ---------------------------------- | ----------------------- |
| Pitch event → tuner needle update  | ≤ 50 ms                 |
| Strum → onset event                | ≤ 20 ms (NFR-1)         |
| Strum → chord classification       | ≤ 250 ms                |
| React render per frame             | ≤ 16 ms (60 fps)        |
| Initial JS bundle (gzipped)        | ≤ 300 KB                |
| Time to interactive (Tuner)        | ≤ 2 s on mid-tier laptop |

Meeting these depends on: AudioWorklet-only DSP, memoised selectors from Zustand, SVG (not Canvas) for the tuner at 60 Hz updates, and no layout thrash in the render path.

## 8. Testing strategy

- **Unit (Vitest):** DSP primitives (`yin`, `onset`, `chroma`) against fixture buffers; `scoring.ts` against expected-score fixtures; store reducers.
- **Component (Vitest + RTL):** feature pages render with a stubbed `AudioEngine`. Snapshot-free — assert on semantics, not markup.
- **Integration (Playwright):** run the real worklet against injected `fake-media-stream` WAVs covering clean chords, muted chords, and timing errors. This is the signal that matters — a tuner that works on synthesized sines but misbehaves on a real E string is a broken tuner.
- **Manual smoke:** each milestone checkout has a short "plug in a guitar and try X" script in `docs/`. Automated tests can't validate that feedback *feels* fast.

## 9. How to add a new feature

1. Create `src/features/<name>/` with the feature's page, store, and components.
2. Wire it into `src/app/routes.tsx`.
3. Consume `audio/` for mic input and `storage/` for persistence. Do **not** import from another feature.
4. Add unit tests next to the code and, if the feature is scored, fixture-driven tests in `scoring.test.ts`.
5. Update `docs/software_requirements.md` only if the feature changes a specified behavior. Otherwise the spec stays stable.

## 10. What this architecture does not do

- No SSR. The app is useless without mic permission and a user gesture.
- No cross-feature shared mutable state. Features coordinate through `audio/` and `storage/` only.
- No global event bus. Subscriptions are direct: feature → `audio/engine`, or feature → its own store. A global bus would hide who depends on what.
- No "smart" client-side ML in v1. Classical DSP (YIN, chroma templates) is accurate enough for the defined scope and stays within the latency budget.
