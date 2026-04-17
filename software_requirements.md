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
- **FR-C4** "Check my chord" mode: the student strums, the app analyzes the audio and returns a **1–10 score** (see §11) plus a **per-string indicator** (clean / dull / muted / wrong pitch) for the six strings. The app does *not* attempt to guess which finger is at fault — only what the audio actually shows.
- **FR-C5** Chords are grouped by difficulty tier and tagged (e.g., "first chords", "useful in key of G").

### 4.3 Practice

- **FR-P1** **Chord change drill**: user selects two or more chords and a target BPM. A metronome plays; the app indicates when to change; the app listens and returns a **1–10 score per change** (see §11) combining correctness, cleanliness, and timing. A rolling average score for the drill is shown live.
- **FR-P2** **Progression drill**: predefined common progressions (I–IV–V in common keys, vi–IV–I–V, 12-bar blues) at selectable tempo.
- **FR-P3** **Strumming pattern drill**: visual and audible reference pattern. App checks each strum's timing and direction against the pattern and returns a **1–10 score per bar**.
- **FR-P4** **Adaptive tempo**: after a rolling average score of ≥8 over 8 consecutive changes at a given BPM, the app offers to increase the tempo (+5 BPM). After a rolling average of ≤5, it suggests slowing down (−5 BPM).
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

## 9. Design decisions

These started as open questions and are now resolved. Each is re-openable if we learn something new, but the default position is documented here.

### 9.1 Granularity of feedback — per-string, not per-finger

The app will report feedback **at the string level** but not at the finger level.

- **What we report.** For each of the six strings after a strum: *clean* (rang at expected pitch with strong harmonics), *dull* (rang but with weak harmonics — likely partially fretted), *muted* (little or no signal), or *wrong pitch* (rang but at a different note — usually a fretting-hand error on the wrong fret).
- **What we don't report.** "Your ring finger is in the wrong place." We can't see the fretboard; claiming to know which finger caused a muted string would be a guess, and a wrong guess is worse than no guess — it sends the student debugging the wrong thing.
- **Why this is enough.** A beginner who sees "B string muted" on a G chord almost always figures out the fingering fix themselves, and if they don't, the per-string signal is specific enough to ask a teacher or look up.

### 9.2 Gamification — a 1–10 score, personal bests, soft streaks

Adopt the 1–10 score as the primary feedback signal (specified in §11). Supporting elements:

- **Personal bests** per chord (best "check my chord" score) and per transition (highest BPM at which rolling average ≥8). These are intrinsic and measurable.
- **Soft streaks.** Count *practice sessions this week* (e.g., 4 / 7), not consecutive-day streaks. Consecutive-day streaks punish a single missed day, which drives quitting, not practice.
- **No badges, no points, no leaderboards, no sharing** in v1. These externalise motivation and tend to attract users who play the meta-game rather than the guitar.
- **Progress is visible without being competitive.** A simple line chart of BPM ceiling over time per transition is more motivating to a serious learner than a trophy case.

### 9.3 Chord scope — beginner-focused now, grow with the user

Stay firmly beginner-focused through v1 and v2. Roadmap:

- **v1:** open majors, open minors, common 7ths (G7, D7, E7, A7), power chords (E5, A5, D5).
- **v2:** E-shape and A-shape barre chords, sus2 / sus4, slash chords (C/G, D/F♯).
- **v3+:** extended chords (9ths, 11ths, 13ths), altered dominants, drop-2 voicings — but only if users are reaching them. A jazz voicing catalog for a student who can't yet change G→C is scope creep.

### 9.4 Metronome — visual primary, audible optional, headphones recommended

The metronome will render as both a **visual pulse** (always on) and an **audible click** (optional, off by default during listening drills). Rationale and mitigations:

- System audio output *can* bleed into the mic and confuse onset/chord detection. This is a real failure mode for acoustic guitar on built-in laptop mics.
- **Primary mitigation:** enable browser `echoCancellation` and `noiseSuppression` constraints on the `getUserMedia` stream. This removes most of the click from the captured signal at the platform level.
- **Recommend headphones** on first-run setup. A single on-screen tip: "Use headphones for the most accurate feedback."
- **Fallback:** if the calibration step (FR-X2) detects that the metronome click is showing up in the captured signal at levels that will confuse detection, auto-switch to visual-only and tell the user why.
- **Electric guitar via audio interface** doesn't have this problem at all — the signal is captured before any speakers are involved.

## 10. Scoring system (1–10)

The 1–10 score is the student-facing feedback number used by "check my chord" (FR-C4), chord-change drills (FR-P1), and strumming drills (FR-P3). It's designed to stay honest while feeling motivating — a beginner playing their first G chord with two muted strings should see a 6, not a 3.

### 10.1 Design goals

1. **Never lie upward.** A 10 must mean the student actually played it cleanly. Inflation kills trust in the signal.
2. **Never lie downward.** A mostly-correct attempt should land in the 6–8 range, not 3–4. Demoralising scores lose users.
3. **Resolution where it matters.** The gap between 7 and 9 is where most practice happens. That band should reflect real improvement, not be bunched together.
4. **Explainable.** Every score must break down into components the student can look at and act on.

### 10.2 Components

For a single scored event (one strum, one chord change, one bar of strumming) the score is composed of three sub-scores, each on 0–10:

- **Correctness (C)** — was it the right chord / the right strum direction on the right beat? Binary on chord identity (right or wrong — if wrong, the whole score caps at 3). Partial credit for correct chord family but wrong quality (e.g., Cmaj7 instead of C = correctness 7 not 10).
- **Cleanliness (L)** — of the strings expected to ring, how many rang cleanly? Linear: (clean strings / expected strings) × 10. A "dull" string counts as 0.5 of a clean string.
- **Timing (T)** — how close to the target beat was the strum onset? Only applies to drills with a metronome; defaults to 10 for the "check my chord" free-strum mode.
  - Within ±25 ms of beat: 10
  - ±25–50 ms: 9
  - ±50–100 ms: 7
  - ±100–150 ms: 5
  - ±150–250 ms: 3
  - Beyond ±250 ms: 1
  - No strum detected in the expected window: 0

### 10.3 Aggregation

Final score = `round( 0.2·C + 0.5·L + 0.3·T )`, clamped to 1–10 (never show 0 — a student who produced *any* signal gets at least a 1).

- Weights reflect what a beginner should focus on first: **cleanliness (50%)** dominates because clean chord shapes are the foundational skill; **timing (30%)** matters once shapes are clean; **correctness (20%)** is effectively binary above the cap-at-3 threshold, so it contributes less variance.
- If the player got the **wrong chord entirely**, final score is `min( aggregated, 3 )`. This prevents a perfectly-timed, perfectly-clean F major from scoring 9 when the drill asked for G.
- For a drill, the **displayed drill score** is the rolling average of the last 8 events. Individual event scores are also visible so the student can see the trend.

### 10.4 What the student sees

- A large number (1–10) updated per event.
- A tiny breakdown: three bars or numbers showing C / L / T.
- One short text cue pulled from the weakest component, e.g. *"B string dull"* (cleanliness), *"late by 80 ms"* (timing), *"played D instead of G"* (correctness). One cue at a time — more is noise.

### 10.5 What a beginner should expect

- First attempts on a new chord: 5–7 is normal and good.
- After a week of practice: 7–9 consistently.
- 10 should feel earned — the chord rang fully clean and landed on the beat.

## 11. Milestones (suggested)

1. **M1 — Tuner.** Ship a working chromatic tuner. This proves the audio pipeline end-to-end.
2. **M2 — Chord library (read-only).** Browsable chord diagrams with reference audio. No listening yet.
3. **M3 — Chord detection + 1–10 scoring.** "Check my chord" with the scoring system from §10. Introduces chroma analysis and the per-string classifier.
4. **M4 — Practice: chord change drill.** The first real practice loop, using the same scoring.
5. **M5 — Progressions, strumming, progress tracking.** Rounds out the practice section, including personal bests and BPM-over-time charts.
