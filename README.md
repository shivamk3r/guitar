# Guitar Coach

[![CI](https://github.com/shivamk3r/guitar/actions/workflows/ci.yml/badge.svg)](https://github.com/shivamk3r/guitar/actions/workflows/ci.yml)

A browser-based guitar learning app for beginners, built around two ideas every good guitar teacher relies on:

1. **Immediate audio feedback** - the app listens to your guitar through the microphone and tells you *right now* whether you're in tune, whether a chord rang cleanly, and whether your change landed on the beat. Feedback is scored **1-10** so you can see small improvements, not just pass/fail.
2. **Deliberate practice** - short, focused drills that target the exact skill a beginner is struggling with (clean chord shapes, fast transitions, steady rhythm), with difficulty that adapts as you improve.

Audio processing is designed to happen in the browser. There is no backend in v1, and audio is not uploaded or stored server-side.

## The three sections

### 1. Tuner
A chromatic tuner with cents-level precision. Pluck a string, see the note, and watch a needle (or equivalent) guide you to pitch. Supports standard tuning out of the box, with room for alternate tunings (Drop D, DADGAD, half-step down) later.

### 2. Chord Library
A browsable catalog of chords with:
- Fretboard diagrams with finger numbers and recommended fingering.
- A reference recording so you know what it's supposed to sound like.
- A "play it for me" check — strum the chord, and the app tells you whether every note rang clearly or a string was muted/buzzed/wrong.
- Organized by difficulty: open chords first, then power chords, then barre chords.

### 3. Practice
The core of the app. Real guitar skill is built here, not in theory.
- **Chord change drills**: Two or more chords, a metronome, and a target BPM. The app listens and scores how cleanly and on-time each change happens.
- **Progression practice**: Common progressions (I–IV–V, vi–IV–I–V, 12-bar blues) at increasing tempos.
- **Strumming patterns**: Visual + audible pattern, app checks your timing.
- **Progress tracking**: Which chords you've mastered, your current BPM ceiling for each transition, and a simple streak.

## Running locally

```sh
pnpm install
pnpm dev
```

The Vite dev server runs at `http://localhost:5173`, which browsers treat as a secure context for microphone access.

## Verification

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

The Playwright e2e suite uses fake browser media devices, so it does not need a live microphone.

## Status

Work-in-progress frontend prototype. See [docs/](docs/) for the full specification, stack decision, and architecture.

## Non-goals (for now)

- Not a tab/sheet music reader.
- Not a full song library with licensed content.
- Not a replacement for a teacher - it's a practice companion that gives feedback between lessons.

## License

MIT. See [LICENSE](LICENSE).
