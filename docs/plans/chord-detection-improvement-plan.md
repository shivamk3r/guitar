# Chord Detection Improvement Plan

> Status: Completed for the classical DSP baseline. Superseded for backend async chord analysis by the Solitito ONNX worker integration; see `docs/software_requirements.md`, `docs/stack.md`, and `apps/frontend/evals/chord-detection/README.md` for the current detector split and eval numbers.

## Summary
Build a classical DSP v1 improvement with two implementations: the browser remains the real-time production detector, and Python becomes an eval-only research bench. The shared referee will report target-aware verifier metrics for both implementations, prioritizing lower wrong accepts over raw recall.

## Key Changes
- Add a target-aware verifier to the frontend chord detector:
  - New result status: `accepted | rejected | uncertain`.
  - Score the expected chord directly, compare it against best confusers, and only pass `expectedChordId` into scoring when accepted.
  - Keep open-ended `matchChord` for debug/reporting, but chord check and practice flows use target-aware verification.
- Improve frontend DSP without changing privacy boundaries:
  - Keep analysis browser-side and within the existing AudioWorklet path.
  - Replace naive averaged chroma with a stronger harmonic pitch-class profile, spectral whitening, RMS-weighted/trimmed frame aggregation, and transient skipping inside the existing capture windows.
  - Store per-chord verifier thresholds tuned from eval data, with the tuning objective: maximize recall subject to low false/wrong accepts.
- Add an eval-only Python research bench:
  - Add backend optional eval dependencies: `numpy` and `scipy`.
  - Add a Python CLI that reads the same prepared `.eval-cache/chord-detection` datasets and writes the same report schema.
  - Do not wire Python analysis into the backend worker in this pass.
- Update eval reporting:
  - Frontend and Python reports use target-aware trials: every sample is tested against the true chord as a positive and against other supported chords as negatives.
  - Write separate latest reports for frontend and Python, plus a compact comparison report.
  - Root scripts should expose `eval:chords:frontend`, `eval:chords:python`, and a combined comparison command while preserving `eval:chords` for the frontend path.
- Update docs:
  - Update software requirements with the new eval baseline and the target-aware verifier framing.
  - Update stack/architecture docs to describe “Python research bench, browser real-time instrument.”
  - Update eval README and repo command docs for the new scripts and report locations.

## Public Interfaces
- Frontend detector returns a verifier-oriented result containing:
  - `status`
  - `expectedChordId`
  - `acceptedChordId`
  - `bestAlternativeChordId`
  - `expectedSimilarity`
  - `alternativeSimilarity`
  - `margin`
  - `confidence`
- Existing UI/practice score behavior changes intentionally:
  - `accepted` means score as correct.
  - `rejected` means score as wrong, using the best alternative when available.
  - `uncertain` means no detected chord, avoiding confident wrong accepts.
- Python CLI output matches the frontend eval JSON/Markdown structure so reports can be compared directly.

## Test Plan
- Frontend:
  - Unit tests for verifier acceptance, rejection, uncertainty, per-chord thresholds, and confuser handling.
  - Unit tests for frame aggregation and enhanced chroma on synthetic chord signals.
  - Existing chord check/practice tests updated for `uncertain` and rejected outcomes.
  - Run `pnpm lint`, `pnpm typecheck`, `pnpm test`.
- Backend/Python:
  - Pytest coverage for WAV loading, feature extraction, chord catalog parity, verifier output, and CLI report generation on a small fixture.
  - Run `cd apps/backend && python3 -m pytest`.
- Evals:
  - Run dataset prep if needed.
  - Run full frontend eval with force.
  - Run full Python eval with force.
  - Generate comparison report and update docs with the exact resulting metrics.

## Assumptions
- First pass is classical DSP only: no trained ML classifier.
- The original classical Python bench was eval-only; backend async chord analysis is now handled by the later Solitito worker integration documented in `docs/software_requirements.md` and `docs/architecture.md`.
- The primary success metric is reducing wrong accepts, even if some true chords become `uncertain`.
- Full eval reports are generated locally under `.eval-cache/` and are not committed unless the repo already tracks a specific report artifact.
