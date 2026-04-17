# Guitar Coach — Software Requirements

## 1. Vision

A browser-based guitar learning app for beginners that closes the feedback loop between "I played something" and "was that right?" using the device microphone. Every feature, where possible, is driven by listening to the student play and responding in real time.

## 2. Guiding principles

1. **Feedback in under a second.** If the app can't tell you within a beat whether you played correctly, it isn't fast enough to be useful during practice.
2. **Deliberate practice over content volume.** A small number of well-designed drills that genuinely improve skill beats a large library that doesn't.
3. **Meet the beginner where they are.** Default to open chords, standard tuning, simple 4/4 rhythms. Advanced options exist but stay out of the way.
4. **Honest feedback.** If a note buzzed or a string was muted, say so. A tuner that rounds up isn't helping anyone.
5. **Low friction to start.** Open the page, grant mic access, start playing. No login required for core features.

## 3. User personas

- **Absolute beginner (primary).** Has a guitar, has watched a few YouTube videos, can't yet transition G→C without stopping. Needs: reassurance that they're in tune, clear chord diagrams, drills that build transition muscle memory.
- **Returning player.** Played years ago, picking it back up. Needs: quick tune-up, chord refresher, progression practice to rebuild speed.
- **Self-directed learner (secondary).** Already practices daily. Needs: precise feedback, measurable progress, harder drills (barre chords, faster transitions).

## 4. Functional requirements

### 4.1 Tuner

- **FR-T1** Detect the fundamental pitch of a plucked string from microphone input with ±1 cent accuracy under quiet conditions.
- **FR-T2** Display the detected note name, the target note, and the deviation in cents (needle or equivalent visual).
- **FR-T3** Indicate "in tune" only when the pitch is within ±5 cents of target for ≥500 ms.
- **FR-T4** Support standard tuning (E A D G B E) by default. Provide alternate tunings: Drop D, Half-step down, DADGAD, Open G.
- **FR-T5** Work with acoustic guitar via built-in mic and electric guitar via audio interface input.
- **FR-T6** Handle noisy environments gracefully — show a "signal too weak / too noisy" state instead of jittering.

### 4.2 Chord Library

- **FR-C1** Catalog of chords covering, at minimum: all major and minor open chords, common 7ths, power chords, and the most common barre shapes (E-shape, A-shape).
- **FR-C2** Each chord page displays: a fretboard diagram with fret numbers, finger numbers, open/muted string indicators, and the chord's notes.
- **FR-C3** Each chord has a reference audio clip (clean strum at a known tempo) so the student knows the target sound.
- **FR-C4** "Check my chord" mode: the student strums, the app analyzes the audio and reports whether the chord was played correctly, and if not, which notes were missing, extra, or not ringing cleanly.
- **FR-C5** Chords are grouped by difficulty tier and tagged (e.g., "first chords", "useful in key of G").

### 4.3 Practice

- **FR-P1** **Chord change drill**: user selects two or more chords and a target BPM. A metronome plays; the app indicates when to change; the app listens and scores timing (early / on-time / late) and cleanliness (clean / muted / wrong chord) for each change.
- **FR-P2** **Progression drill**: predefined common progressions (I–IV–V in common keys, vi–IV–I–V, 12-bar blues) at selectable tempo.
- **FR-P3** **Strumming pattern drill**: visual and audible reference pattern, app checks the student's strum timing against the pattern.
- **FR-P4** **Adaptive tempo**: after N successful repetitions at a given BPM, the app offers to increase the tempo. After failures, it suggests slowing down.
- **FR-P5** **Session summary**: at the end of each practice session, show chords practiced, highest clean BPM per transition, and a short "what to work on next" suggestion.
- **FR-P6** **Progress tracking**: per-chord and per-transition history (BPM ceiling, success rate). Persisted locally, no account required initially.

### 4.4 Cross-cutting

- **FR-X1** Microphone permission prompt with a clear explanation of why it's needed and that audio never leaves the device.
- **FR-X2** Calibration / input-level check on first use to confirm the mic is picking up the guitar.
- **FR-X3** Accessible UI: keyboard-navigable, sufficient contrast, text alternatives for visual-only feedback (e.g., "in tune" announced to screen readers).

## 5. Non-functional requirements

- **NFR-1 Latency.** End-to-end feedback latency (sound produced → visual response) ≤ 100 ms for the tuner, ≤ 250 ms for chord/rhythm detection. Above these thresholds, feedback feels disconnected from the playing.
- **NFR-2 Accuracy.**
  - Tuner: ±1 cent under quiet conditions, ±3 cents in typical room noise.
  - Chord detection: ≥95% correct identification on clean strums of library chords in standard tuning.
- **NFR-3 Privacy.** All audio processing happens client-side. No audio is uploaded or stored server-side.
- **NFR-4 Platform.** Works in current Chrome, Safari, and Firefox on desktop. Mobile browsers are a stretch goal; the UI should not actively break on mobile.
- **NFR-5 Offline.** Core tuner and chord library should work offline after first load (PWA-capable).
- **NFR-6 Performance.** Audio analysis should not cause dropped frames in the UI (target 60 fps). Use Web Audio API + Web Workers / AudioWorklet where appropriate.

## 6. Audio and DSP requirements

- **Pitch detection** for the tuner: an autocorrelation-based algorithm (e.g., YIN or a variant) rather than pure FFT, for accuracy on low-frequency guitar strings (low E ~82 Hz).
- **Chord detection**: chroma-feature based analysis (12-bin pitch class profile) with template matching against the chord library. Must distinguish major vs minor and catch a missing third / wrong bass note.
- **Onset detection** for rhythm drills: spectral flux or energy-based onset detector to timestamp each strum. Required latency for onset timestamps: ≤ 20 ms.
- **Noise handling**: a simple noise gate keyed to the calibration step from FR-X2.

## 7. Data model (initial sketch)

- **Chord**: id, name, alt names, tier, fretboard shape (6-string fingering array), finger assignments, notes, reference audio id.
- **Progression**: id, name, chords (ordered), default BPM, key.
- **PracticeSession**: id, started_at, ended_at, drills played.
- **DrillResult**: id, session_id, drill_type, chords, target_bpm, successes, failures, timing histogram.

All persisted locally (IndexedDB) in the first version. Optional sync to an account later.

## 8. Out of scope (v1)

- Tablature rendering and song-by-song lessons.
- Video lessons or a human instructor marketplace.
- Licensed song playback.
- Social / leaderboard features.
- Native mobile apps.

## 9. Open questions

- How aggressively should the app correct finger placement when it can only "hear" the result? E.g., if a chord sounds muted, can we reliably say *which* string was muted, or only that something was off?
- What's the right amount of gamification? Streaks motivate, but badges can feel hollow.
- Latin / jazz chords and extended voicings — in-scope eventually, or stay firmly beginner-focused?
- Do we need a built-in metronome tone, or can we rely on the system's audio output alongside mic input without feedback issues?

## 10. Milestones (suggested)

1. **M1 — Tuner.** Ship a working chromatic tuner. This proves the audio pipeline end-to-end.
2. **M2 — Chord library (read-only).** Browsable chord diagrams with reference audio. No listening yet.
3. **M3 — Chord detection.** "Check my chord" feature. Introduces chroma analysis.
4. **M4 — Practice: chord change drill.** The first real practice loop.
5. **M5 — Progressions, strumming, progress tracking.** Rounds out the practice section.
