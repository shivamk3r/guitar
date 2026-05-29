# Guitar Coach - Software Requirements

## 1. Vision

Guitar Coach is an end-to-end guitar learning platform. A learner should be able to improve with only the app, a guitar, themselves, and normal physical accessories such as picks, capos, tuners, strings, headphones, or an audio interface.

The product closes the loop between "I played something" and "what should I do next?" by combining immediate browser-based feedback with consented session recordings, long-term progress history, and asynchronous analysis. Real-time tuner/practice feedback stays in the browser for latency. Backend services persist sessions and recordings so the platform can understand the learner over time and improve its guidance.

## 2. Guiding Principles

1. **Fast feedback first.** Tuner and drill feedback must stay fast enough to guide a learner while they are playing.
2. **Learn from sound.** Audio is the primary evidence for pitch, timing, cleanliness, consistency, and practice progress.
3. **Complete learning loop.** The app should guide what to practice next, not just report what happened.
4. **Explicit consent.** Recording and upload are core capabilities, but they require clear learner consent and future delete/export controls.
5. **Local-to-cloud parity.** The full stack must run locally with persistent data and map cleanly to AWS services later.

## 3. User Personas

- **Absolute beginner.** Needs tuning help, chord shapes, patient scoring, and clear next steps.
- **Returning player.** Needs fast feedback, structured drills, and progress recovery.
- **Self-directed learner.** Needs precise practice history, measurable skill growth, and harder drills.
- **Platform builder.** Needs high-quality consented data and reliable analysis workflows to improve guidance models.

## 4. Functional Requirements

### 4.1 Tuner

- **FR-T1** Detect the fundamental pitch of a plucked string from microphone input with +/-1 cent accuracy under quiet conditions.
- **FR-T2** Display detected note, target note, and deviation in cents.
- **FR-T3** Indicate "in tune" only when pitch is within +/-5 cents of target for at least 500 ms.
- **FR-T4** Show a 5-second pitch stability trace in cents from the active string target, with a 0-cent target line, +/-5-cent acceptable band, and faded or broken unreliable samples.
- **FR-T5** Support standard tuning by default and alternate tunings including Drop D, Half-step down, DADGAD, and Open G.
- **FR-T6** Work with acoustic guitar via built-in mic and electric guitar via audio interface input.
- **FR-T7** If recording consent is enabled, record tuning sessions and upload them after capture for progress analysis.
- **FR-T8** Show the current browser microphone input when available, let learners choose a preferred mic before starting audio feedback, and show an input level meter while listening.

### 4.2 Chord Library

- **FR-C1** Catalog major/minor open chords, common 7ths, power chords, and common barre shapes.
- **FR-C2** Show fretboard diagrams with frets, fingers, open/muted strings, and chord notes.
- **FR-C3** Provide reference audio for each chord.
- **FR-C4** "Check my chord" analyzes a learner strum and returns a 1-10 score plus per-string feedback.
- **FR-C5** Chords are grouped by difficulty tier and tagged for learning context.
- **FR-C6** If recording consent is enabled, persist chord-check audio and metadata for asynchronous analysis.

### 4.3 Practice

- **FR-P1** Chord-change drills score correctness, cleanliness, and timing for each change.
- **FR-P2** Progression drills cover common progressions and configurable tempo.
- **FR-P3** Strumming drills check timing and direction against a pattern.
- **FR-P4** Adaptive tempo recommends slowing down or speeding up based on rolling scores.
- **FR-P5** Session summaries show practiced material, score trends, BPM ceilings, and next-step guidance.
- **FR-P6** If recording consent is enabled, practice sessions are recorded and uploaded for deeper progress analysis.
- **FR-P7** Timed chord practice lets learners choose one or more chords, tempo, beats per chord, rotation order, session length, and a local count-in preference of off, 2 beats, 4 beats, or 8 beats. The default count-in is 4 beats. Count-in time starts the audio engine, optional metronome clicks, and visual timeline pre-roll, but is excluded from scoring, scored progress, summaries, and recommendations.

### 4.4 Learn Glossary

- **FR-L1** Provide a Learn tab with beginner-friendly definitions for essential guitar and music terms including pitch, fret, cent, beat, semitone, sharp, flat, note, chord, tempo, rhythm, tuning, and string.
- **FR-L2** Support glossary search and category filters so learners can find terms from tuner, chord, practice, notation, and timing contexts.
- **FR-L3** Each glossary term has a dedicated concept page with plain-language explanation, an interactive visual animation, browser-generated audio examples, and where the term appears inside Guitar Coach.
- **FR-L4** Tuner, chord, and practice screens link learner-facing terminology directly to the matching glossary concept page.
- **FR-L5** Initial Learn lessons run entirely in the browser with Web Audio and UI animation; they do not require microphone input, recording upload, backend services, or learner consent.
- **FR-L6** Later Learn milestones may add optional microphone exercises and progress-aware recommendations after consent and progress controls are available.

### 4.5 Activity History

- **FR-H1** Provide a History page that lists tuning, chord-check, and practice sessions in chronological order.
- **FR-H2** Show each activity's type, start time, duration, completion status, score or tuning result, and whether a recording is available.
- **FR-H3** Let learners open activity details with saved configuration including tuning preset, chord targets, BPM, beats per chord, practice length, score breakdown, and attempts when available.
- **FR-H4** Show backend recording-analysis status, detailed chord feedback, and per-attempt backend feedback for supported practice recordings when an analysis result is available.
- **FR-H5** Save meaningful session metadata even when recording consent is disabled.
- **FR-H6** Only save and replay raw audio when explicit recording consent is enabled.
- **FR-H7** Use history as the durable foundation for later streaks, weak chord-transition detection, tuning consistency, practice frequency, and recommended drills.

### 4.6 Learning Intelligence and Data

- **FR-D1** Create an anonymous learner profile before storing backend sessions; account auth is deferred.
- **FR-D2** Store recording consent history before uploading tuning, chord-check, or practice audio.
- **FR-D3** Persist session metadata for meaningful tuning, chord-check, and practice activity, audio object references when consented recordings exist, analysis jobs, and analysis results in backend storage.
- **FR-D4** Store raw audio in S3-compatible object storage locally through MinIO.
- **FR-D5** Enqueue recording analysis through an SQS-compatible queue locally through LocalStack.
- **FR-D6** A worker consumes analysis jobs and writes extracted metrics/results. It runs Solitito chord analysis for supported WAV `chord_check` recordings and supported `practice_drill` chord attempts, and may write placeholder metrics for activity types whose deeper analysis is not implemented yet.
- **FR-D7** Expose learner progress through a backend read endpoint that can later power personalized guidance.

## 5. Non-Functional Requirements

- **NFR-1 Latency.** Browser feedback latency must remain <=100 ms for tuner and <=250 ms for chord/rhythm detection.
- **NFR-2 Accuracy.** Tuner should reach +/-1 cent under quiet conditions and +/-3 cents in typical room noise. Chord detection should trend toward >=95% correct identification on clean library-chord strums.
- **NFR-3 Privacy and consent.** No recording upload occurs without explicit consent. The UI must explain recording use clearly. Future milestones must add export/delete/retention controls before production release with real users.
- **NFR-4 Local runtime.** `docker compose up --build` should run frontend, API, worker, Postgres, MinIO, and LocalStack SQS with persistent local volumes.
- **NFR-5 Cloud portability.** The local stack should map to AWS: Postgres to RDS, MinIO to S3, LocalStack SQS to Amazon SQS, API/worker to container services.
- **NFR-6 Performance.** Audio analysis must not drop UI frames; high-rate audio events must not be stored in React state.

### 5.1 Current Chord Detection Eval Baseline

The current chord detector is measured with the manual offline eval harness in `apps/frontend/evals/chord-detection`. The browser detector remains the real-time production path. The Python eval can run the classical DSP baseline or the pinned Solitito ONNX backend detector against the same prepared datasets and report schema.

Latest full target-aware + WCSR evals were generated 2026-05-29 10:11-10:15 IST:

| Implementation | Timestamp | Fingerprint | Evaluated | Duration | Top-1 accuracy | Exact WCSR | Root WCSR | Maj-Min WCSR | Verifier recall | Verifier weighted recall | False accept trials | Wrong-accept samples | Uncertain |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Frontend | `2026-05-29T04:41:41.782Z` | `42dbecafd82639db` | 955 | 2502.5s | 14.3% | 13.3% | 37.3% | 30.5% | 10.1% | 9.5% | 0.7% | 11.8% | 69.2% |
| Python DSP | `2026-05-29T04:42:13.909381Z` | `24601413f5c157c8` | 955 | 2502.5s | 14.2% | 13.2% | 37.7% | 30.7% | 9.7% | 9.3% | 0.7% | 11.0% | 69.4% |
| Python Solitito | `2026-05-29T04:45:19.911341Z` | `397a440dd8aa9433` | 955 | 2502.5s | 72.4% | 74.7% | 82.8% | 78.5% | 53.2% | 57.4% | 0.2% | 4.0% | 44.1% |

The browser and classical DSP baselines remain below the long-term **NFR-2** accuracy target. The Solitito backend detector is a significant async-analysis improvement and is now eligible for consented `chord_check` recordings and supported `practice_drill` chord attempts, but it is not the browser real-time path. The verifier intentionally trades recall for fewer confident wrong accepts: `accepted` is scored as correct for the target chord, `rejected` is scored as wrong using the best alternative, and `uncertain` avoids awarding or confidently penalizing a chord identity when evidence is ambiguous. WCSR is duration-weighted and helps compare against MIR literature, while verifier recall remains the learner-facing trust metric.

## 6. Audio and Analysis Requirements

- **AR-1** Immediate DSP uses Web Audio and AudioWorklet in the frontend.
- **AR-2** Tuner pitch detection uses an autocorrelation/YIN-style algorithm.
- **AR-3** Immediate chord detection uses browser-side harmonic chroma/template analysis, target-aware verification, and per-string classification.
- **AR-4** Rhythm drills use onset detection with timestamps aligned to the audio clock.
- **AR-5** Recording uses the already-granted microphone stream and does not replace the real-time feedback path.
- **AR-6** Backend analysis is asynchronous. For consented WAV `chord_check` recordings and supported `practice_drill` chord attempts, the worker runs the pinned Solitito ONNX detector and stores target-aware metrics; other activity types may still write placeholder metrics until deeper analysis is implemented.
- **AR-7** Browser audio input selection uses the selected `audioinput` device for realtime DSP and consented recording, falls back to browser default if the preferred device is unavailable, and disables switching during active scored or recorded sessions.
- **AR-8** Microphone labels and device identifiers remain local browser UI/preference state and are not included in recording session metadata by default.
- **AR-9** Browser microphone capture requests speech processing disabled (`echoCancellation`, `noiseSuppression`, and `autoGainControl`) so guitar recordings keep harmonics, sustain, and room detail. Consented recordings are saved as raw PCM WAV before app analysis filters; compressed browser recording is only a fallback when raw capture is unavailable.
- **AR-10** Python chord detection includes the classical DSP eval bench and the Solitito backend detector. Solitito is wired only to async recording analysis, not to immediate browser feedback.

## 7. Data Model

- **Learner**: anonymous learner id, creation time.
- **RecordingConsent**: learner id, granted flag, policy version, source, timestamp.
- **LearningSession**: learner id, activity type, start/end timestamps, client metadata.
- **AudioRecording**: session id, learner id, object key, bucket, content type, size, capture time.
- **AnalysisJob**: recording id, queued/running/completed/failed status, timestamps, error.
- **AnalysisResult**: job id, recording id, raw metrics, guidance. API responses map raw metrics into stable summary/detail fields for frontend display.
- **Progress read model**: learner-level summaries and recommendations derived from sessions and analyses.

## 8. Out of Scope for the Current Migration

- Full account authentication.
- Production retention/deletion UX.
- Licensed song libraries.
- Human teacher marketplace.
- Native mobile apps.
- Full ML progress model training and inference.

## 9. Scoring System

The learner-facing 1-10 score remains the primary immediate signal for chord checks and drills.

- Correctness: whether the expected chord or action was played.
- Cleanliness: how many expected strings rang clearly.
- Timing: how close the onset was to the expected beat.

Final score remains a weighted aggregate: 20% correctness, 50% cleanliness, 30% timing, with wrong-chord attempts capped low enough to stay honest.

## 10. Milestones

1. **M1 - Monorepo and local stack.** Frontend, FastAPI, Postgres, MinIO, LocalStack SQS, worker, and docs.
2. **M2 - Reliable recording flow and first lessons.** Consent UX, session recording, upload retry, object lifecycle basics, and browser-only glossary lessons.
3. **M3 - Analysis extraction.** Worker extracts pitch stability, timing consistency, chord cleanliness, and practice summaries.
4. **M4 - Guidance engine.** Progress endpoint recommends lessons, drills, tempo changes, and weak-skill focus.
5. **M5 - Accounts and controls.** Auth, sync, retention, export, deletion, and production deployment hardening.
