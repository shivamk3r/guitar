import type { ChordDef } from "@/data/chords";
import type { StringClass } from "@/features/practice/scoring";
import type { ScoredEvent } from "@/features/practice/scoring";
import { create } from "zustand";

export type CheckState = "idle" | "listening" | "capturing" | "analyzed";

export interface CheckResult {
  detectedId: string | null;
  detectedName: string | null;
  similarity: number;
  runnerUpId: string | null;
  stringStates: StringClass[];
  scored: ScoredEvent;
}

interface ChordCheckState {
  state: CheckState;
  expected: ChordDef | null;
  lastResult: CheckResult | null;

  setExpected: (chord: ChordDef | null) => void;
  setState: (s: CheckState) => void;
  setResult: (r: CheckResult | null) => void;
  reset: () => void;
}

export const useChordCheck = create<ChordCheckState>()((set) => ({
  state: "idle",
  expected: null,
  lastResult: null,
  setExpected(chord) {
    set({ expected: chord });
  },
  setState(s) {
    set({ state: s });
  },
  setResult(r) {
    set({ lastResult: r, state: "analyzed" });
  },
  reset() {
    set({ state: "idle", lastResult: null });
  },
}));
