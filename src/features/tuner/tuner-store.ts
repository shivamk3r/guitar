import { type NoteInfo, hzToNote } from "@/lib/math";
import { create } from "zustand";

export type TunerStatus = "idle" | "listening" | "signal-weak" | "detecting";

interface TunerState {
  status: TunerStatus;
  /** Last detected pitch info (note, cents, etc). */
  note: NoteInfo | null;
  hz: number;
  confidence: number;
  /** True if within ±5 cents for ≥500ms. */
  inTune: boolean;
  /** Time (ms from AudioContext start) the pitch last entered the ±5¢ band. */
  lockStart: number | null;

  setStatus: (s: TunerStatus) => void;
  ingestPitch: (hz: number, confidence: number, tSeconds: number) => void;
  ingestSilence: () => void;
  reset: () => void;
}

const LOCK_WINDOW_CENTS = 5;
const LOCK_DURATION_MS = 500;

export const useTuner = create<TunerState>()((set, get) => ({
  status: "idle",
  note: null,
  hz: 0,
  confidence: 0,
  inTune: false,
  lockStart: null,

  setStatus(s) {
    set({ status: s });
  },

  ingestPitch(hz, confidence, tSeconds) {
    const note = hzToNote(hz);
    const prev = get();
    const tMs = tSeconds * 1000;
    let lockStart = prev.lockStart;
    let inTune = false;
    if (Math.abs(note.cents) <= LOCK_WINDOW_CENTS && confidence > 0.85) {
      // Re-lock if same note, else restart
      if (prev.note?.midi === note.midi && lockStart != null) {
        if (tMs - lockStart >= LOCK_DURATION_MS) inTune = true;
      } else {
        lockStart = tMs;
      }
    } else {
      lockStart = null;
    }
    set({
      status: "detecting",
      note,
      hz,
      confidence,
      inTune,
      lockStart,
    });
  },

  ingestSilence() {
    set({ status: "signal-weak", inTune: false, lockStart: null });
  },

  reset() {
    set({
      status: "idle",
      note: null,
      hz: 0,
      confidence: 0,
      inTune: false,
      lockStart: null,
    });
  },
}));
