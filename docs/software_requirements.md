# Guitar Coach - Software Requirements

## 1. Vision

Guitar Coach is an end-to-end guitar learning platform. A learner should be able to improve with only the app, a guitar, themselves, and normal physical accessories such as picks, capos, tuners, strings, headphones, or an audio interface.

The product closes the loop between "I played something" and "what should I do next?" by combining immediate browser-based feedback with consented session recordings, long-term progress history, and asynchronous analysis. Real-time tuner/practice feedback stays in the browser for latency. Backend services persist sessions, profile data, curriculum progress, song progress, journal notes, and recordings so the platform can understand the learner over time and improve its guidance. The current product target is a complete local-first, single-user learner account running through Docker Compose.

## 2. Guiding Principles

1. **Fast feedback first.** Tuner and drill feedback must stay fast enough to guide a learner while they are playing.
2. **Learn from sound.** Audio is the primary evidence for pitch, timing, cleanliness, consistency, and practice progress.
3. **Complete learning loop.** The app should guide what to practice next, not just report what happened.
4. **Explicit consent.** Recording and upload are core capabilities, but they require clear learner consent and future delete/export controls.
5. **Local-to-cloud parity.** The full stack must run locally with persistent data and map cleanly to AWS services later.
6. **Single local learner first.** One durable local learner/profile is supported. Multi-user auth, cloud sync, paid/licensed content, and teacher marketplace workflows are out of scope.

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
- **FR-T7** Tuning sessions save local session summaries and `setup-tuning` progress before relying on backend availability. If recording consent is enabled, record tuning sessions and upload them after capture for backend pitch-stability analysis. If backend sync fails, the completed tuning session is queued in IndexedDB and retried later.
- **FR-T8** Show the current browser microphone input when available, let learners choose a preferred mic before starting audio feedback, and show an input level meter while listening.
- **FR-T9** Tools provides a local audio calibration check that starts the browser audio engine, classifies signal as silent, quiet, good, or clipping, shows a coarse browser latency estimate, gives learner-facing input guidance, and stores the last calibration quality in IndexedDB without uploading audio.

### 4.2 Chord Library

- **FR-C1** Catalog major/minor open chords, common 7ths, power chords, and common barre shapes.
- **FR-C2** Show fretboard diagrams with frets, fingers, open/muted strings, and chord notes.
- **FR-C3** Provide reference audio for each chord.
- **FR-C4** "Check my chord" analyzes a learner strum and returns a 1-10 score plus per-string feedback.
- **FR-C5** Chords are grouped by difficulty tier and tagged for learning context.
- **FR-C6** Chord checks save local session summaries and chord progress before relying on backend availability. If recording consent is enabled, persist chord-check audio and metadata for asynchronous analysis. If backend sync fails, the completed chord-check session is queued in IndexedDB and retried later.

### 4.3 Practice

- **FR-P1** Chord-change drills score correctness, cleanliness, and timing for each change.
- **FR-P2** Progression drills cover common progressions and configurable tempo.
- **FR-P3** Strumming drills check timing and direction against a pattern.
- **FR-P4** Adaptive tempo recommends slowing down or speeding up based on rolling scores.
- **FR-P5** Session summaries show practiced material, score trends, BPM ceilings, and next-step guidance. Browser tuner, chord-check, chord-change, progression, timed chord, and strumming drills save local session summaries before relying on backend availability.
- **FR-P6** If recording consent is enabled, practice sessions are recorded and uploaded for deeper progress analysis.
- **FR-P7** Timed chord practice lets learners choose one or more chords, tempo, beats per chord, rotation order, session length, and a local count-in preference of off, 2 beats, 4 beats, or 8 beats. The default count-in is 4 beats. Count-in time starts the audio engine, optional metronome clicks, and visual timeline pre-roll, but is excluded from scoring, scored progress, summaries, and recommendations.
- **FR-P8** Technique practice lets learners track focused self-rated work for barre preparation, muting, pentatonic scales, lead techniques, fingerstyle, and theory targets as local-first sessions with optional BPM, minutes, notes, and backend-derived progress when available.

### 4.4 Learn, Lessons, and Curriculum

- **FR-L1** Provide a Learn tab with beginner-friendly definitions for essential guitar and music terms including pitch, fret, cent, beat, semitone, sharp, flat, note, chord, tempo, rhythm, tuning, and string.
- **FR-L2** Support glossary search and category filters so learners can find terms from tuner, chord, practice, notation, and timing contexts.
- **FR-L3** Each glossary term has a dedicated concept page with plain-language explanation, an interactive visual animation, browser-generated audio examples, and where the term appears inside Guitar Coach.
- **FR-L4** Tuner, chord, and practice screens link learner-facing terminology directly to the matching glossary concept page.
- **FR-L5** Initial Learn lessons run entirely in the browser with Web Audio and UI animation; they do not require microphone input, recording upload, backend services, or learner consent.
- **FR-L6** Structured local lessons cover beginner fundamentals, tuning, chord diagrams, rhythm/tempo, strumming, open chords, chord transitions, barre chord preparation, power chords, pentatonic scale, lead techniques, fingerstyle basics, theory, ear training, and fretboard notes.
- **FR-L7** Lessons link to the skill tree, practice drills, tools, and song targets.
- **FR-L8** Lesson completion updates local progress, creates a durable local-first `lesson` session, and updates the backend progress read model for the single learner when the API is available. If backend sync fails, the completion is queued in IndexedDB and retried later.

### 4.5 Activity History

- **FR-H1** Provide a History page that lists tuning, chord-check, lesson, practice, song-practice, ear-training, fretboard, and technique sessions in chronological order.
- **FR-H2** Show each activity's type, start time, duration, completion status, score or tuning result, and whether a recording is available.
- **FR-H3** Let learners open activity details with saved configuration including tuning preset, chord targets, BPM, beats per chord, practice length, score breakdown, and attempts when available.
- **FR-H4** Show backend recording-analysis status, detailed chord feedback, learner-facing verified practice score, and per-attempt backend feedback for supported practice recordings when an analysis result is available.
- **FR-H5** Save meaningful session metadata and local practice notes even when recording consent is disabled, and show local IndexedDB session history when the backend is unavailable. Local drill history includes completed and stopped tuner, chord-check, chord-change, progression, timed chord, strumming, lesson, song, trainer, and technique work with learner-facing result text; stopped local sessions do not invent a score.
- **FR-H6** Only save and replay raw audio when explicit recording consent is enabled.
- **FR-H7** Use history as the durable foundation for streaks, weak chord-transition detection, tuning consistency, practice frequency, lesson completion, ear/fretboard trainer evidence, technique/scale/theory evidence, and recommended drills. Closing a session derives backend progress items from tuning, lesson, chord, transition, rhythm, ear-training, fretboard, technique, scale, and theory metadata even when recording consent is disabled.

### 4.6 Learning Intelligence and Data

- **FR-D1** Create or reuse one durable local learner profile before storing backend sessions; if a new browser anonymous id appears, the backend returns the existing local learner instead of creating a second account, and frontend startup drains pending local profile/session syncs, including tuner and chord-check sessions, before restoring backend profile/progress/session summaries with completion status and result text plus synced journal notes into IndexedDB. Multi-user account auth is deferred.
- **FR-D2** Store recording consent history before uploading tuning, chord-check, or practice audio.
- **FR-D3** Persist session metadata for meaningful tuning, chord-check, practice, song-practice, lesson, ear-training, and fretboard activity, audio object references when consented recordings exist, analysis jobs, and analysis results in backend storage.
- **FR-D4** Store raw audio in S3-compatible object storage locally through MinIO.
- **FR-D5** Enqueue recording analysis through an SQS-compatible queue locally through LocalStack.
- **FR-D6** A worker consumes analysis jobs and writes extracted metrics/results. It runs local autocorrelation tuner analysis for consented WAV `tuner` recordings, Solitito chord analysis for supported WAV `chord_check` recordings and supported `practice_drill` chord attempts, and may write placeholder metrics for activity types whose deeper analysis is not implemented yet.
- **FR-D7** Expose learner progress through a backend read endpoint that powers deterministic local guidance from profile data, progress items, closed sessions, and analysis results.
- **FR-D8** Persist editable profile fields locally first and in the backend when available: display name, skill level, goals, handedness, guitar preference, daily practice target, preferred genres, onboarding status, and recording consent setting. Today onboarding and Settings edits must remain usable when the API is temporarily unavailable, with backend profile/consent sync retried later.
- **FR-D9** Expose deterministic v1 endpoints for profile, learning path, practice plan, progress dashboard, songs, lesson completion, progress items, journal notes, learner metadata export, and recording export/delete metadata.

### 4.7 Today, Learning Path, and Recommendations

- **FR-G1** The first screen is Today, not a marketing page. It shows onboarding for a fresh local learner and a daily plan after setup; completing onboarding saves locally before requiring backend availability.
- **FR-G2** The learning path covers tuning, open chords, chord transitions, strumming, rhythm, songs, barre chords, scales, lead techniques, fingerstyle basics, theory, ear training, and fretboard knowledge.
- **FR-G3** Practice plans offer 10, 20, and 45 minute options using profile, local progress, weak chords/transitions, unfinished lessons, and song progress.
- **FR-G4** Skill states are locked, ready, in progress, review, or mastered. Rules are deterministic and explainable, and they use lesson completion plus target evidence from chords, transitions, rhythm, songs, ear training, and fretboard trainers.
- **FR-G5** Ear training includes browser-synthesized interval, major/minor, chord-quality, and simple-progression prompts. Checked answers save local `ear-training` progress and local-first sessions, then sync to the backend singleton learner when available.
- **FR-G6** Fretboard training includes checked note-location prompts for all six strings plus octave-shape prompts. Answers save local `fretboard` progress and local-first sessions, then sync to the backend singleton learner when available.

### 4.8 Songs, Progress, and Retention

- **FR-S1** Song learning uses local seed songs only: app-authored originals or public-domain/traditional forms.
- **FR-S2** Songs include chord charts, sections, difficulty, required skills, tempo, strumming pattern, section looping, slow tempo practice, local-first song-practice stop/completion session history, and completion/mastery tracking.
- **FR-S3** Progress tracks mastery by skill, lesson, chord, transition, song, song section, rhythm, technique, scale, theory, ear exercise, fretboard exercise, and challenge. Song section stops record durable local `song_practice` history without awarding score or mastery. Song section completion records both aggregate `song` progress and a durable `song-section` progress item, plus a durable `song_practice` session with an idempotent client session id for backend restore; failed backend sync is queued in IndexedDB with the matching song-progress patch and retried later without double-counting already-completed sections.
- **FR-S4** Progress dashboard shows practice minutes, grace-day-aware streaks, weekly/monthly recaps, best recent improvement evidence, mastered/review/ready counts, blockers, recommendations, challenges, and checked ear/fretboard trainer exercises whose local-first session results sync to the durable local learner when the API is available.
- **FR-S5** History supports consented recording playback, export/download metadata, deletion controls, backend analysis status, and local-first review notes that sync to backend journal entries when available. Unsynced local notes are retried after pending local sessions are restored and when History refreshes. Synced backend journal entries are imported into IndexedDB during account restore so practice notes remain part of the durable local account after browser storage reset.
- **FR-S6** Settings supports exporting local account metadata as JSON so the single learner can inspect or back up profile, progress, session, journal, and recording-retention state. The downloaded export always includes the IndexedDB account snapshot and includes the backend export when reachable. The backend export is used by startup recovery after browser storage reset.

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

The browser and classical DSP baselines remain below the long-term **NFR-2** accuracy target. The Solitito backend detector is a significant async-analysis improvement and is now eligible for consented `chord_check` recordings and supported `practice_drill` chord attempts, but it is not the browser real-time path. The verifier intentionally trades recall for fewer confident wrong accepts: `accepted` is scored as correct for the target chord, `rejected` is scored as wrong using the best alternative, and `uncertain` avoids awarding or confidently penalizing a chord identity when evidence is ambiguous. Supported practice recordings expose a conservative verified score of `accepted / analyzed * 100`, with clarity and decisive accuracy shown separately so model uncertainty does not masquerade as mastery. WCSR is duration-weighted and helps compare against MIR literature, while verifier recall remains the learner-facing trust metric.

## 6. Audio and Analysis Requirements

- **AR-1** Immediate DSP uses Web Audio and AudioWorklet in the frontend.
- **AR-2** Tuner pitch detection uses an autocorrelation/YIN-style algorithm.
- **AR-3** Immediate chord detection uses browser-side harmonic chroma/template analysis, target-aware verification, and per-string classification.
- **AR-4** Rhythm drills use onset detection with timestamps aligned to the audio clock.
- **AR-5** Recording uses the already-granted microphone stream and does not replace the real-time feedback path.
- **AR-6** Backend analysis is asynchronous. For consented WAV `tuner` recordings, the worker stores local pitch-stability metrics including voiced frames, centered-frame rate, median note, cents drift, and tuning guidance. For consented WAV `chord_check` recordings and supported `practice_drill` chord attempts, the worker runs the pinned Solitito ONNX detector and stores target-aware metrics; other activity types may still write placeholder metrics until deeper analysis is implemented.
- **AR-7** Browser audio input selection uses the selected `audioinput` device for realtime DSP and consented recording, falls back to browser default if the preferred device is unavailable, and disables switching during active scored or recorded sessions.
- **AR-8** Microphone labels and device identifiers remain local browser UI/preference state and are not included in recording session metadata by default.
- **AR-9** Browser microphone capture requests speech processing disabled (`echoCancellation`, `noiseSuppression`, and `autoGainControl`) so guitar recordings keep harmonics, sustain, and room detail. Consented recordings are saved as raw PCM WAV before app analysis filters; compressed browser recording is only a fallback when raw capture is unavailable.
- **AR-10** Python chord detection includes the classical DSP eval bench and the Solitito backend detector. Solitito is wired only to async recording analysis, not to immediate browser feedback.
- **AR-11** Audio calibration is browser-only, uses level events from the same AudioWorklet path as practice, estimates browser latency from the active AudioContext, and persists only the quality category locally.

## 7. Data Model

- **Learner**: singleton local account row with anonymous learner id and creation time.
- **LearnerProfile**: one local learner's display name, skill level, goals, handedness, instrument preference, daily practice target, preferred genres, onboarding status, and consent mirror.
- **RecordingConsent**: learner id, granted flag, policy version, source, timestamp.
- **LearningSession**: learner id, activity type, start/end timestamps, client metadata.
- **LearnerProgressItem**: learner id, item type/id, status, mastery, attempts, minutes, score/tempo evidence, due date, last practiced timestamp, and metadata.
- **AudioRecording**: session id, learner id, object key, bucket, content type, size, capture time.
- **RecordingRetention**: recording id, delete/export timestamps, export count, delete reason.
- **AnalysisJob**: recording id, queued/running/completed/failed status, timestamps, error.
- **AnalysisResult**: job id, recording id, raw metrics, guidance. API responses map raw metrics into stable summary/detail fields for frontend display.
- **JournalEntry**: optional learner/session practice note, mood, focus, timestamps, and local sync metadata when stored in IndexedDB before backend sync.
- **PendingBackendSync**: local IndexedDB retry record for profile/consent snapshots or completed learning sessions that saved locally but could not yet sync to the backend singleton learner.
- **Progress read model**: learner-level summaries and recommendations derived from sessions and analyses.

## 8. Out of Scope for the Current Migration

- Full account authentication.
- Production-grade retention policies beyond local export/delete controls.
- Licensed song libraries.
- Human teacher marketplace.
- Native mobile apps.
- Full ML progress model training and inference.
- Cloud deployment and multi-user production authorization for this local-first stage.

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
