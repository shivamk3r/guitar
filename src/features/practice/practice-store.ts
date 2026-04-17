import { create } from "zustand";
import type { ScoredEvent } from "./scoring";

export interface DrillEvent {
  id: string;
  atIso: string;
  expectedChordId: string;
  detectedChordId: string | null;
  score: ScoredEvent;
  bpm: number | null;
}

export interface BpmSuggestion {
  direction: "up" | "down";
  from: number;
  to: number;
}

interface PracticeState {
  events: DrillEvent[];
  rollingAverage: number;
  suggestion: BpmSuggestion | null;
  reset: () => void;
  recordEvent: (ev: DrillEvent) => void;
  setSuggestion: (s: BpmSuggestion | null) => void;
}

export const usePractice = create<PracticeState>()((set, get) => ({
  events: [],
  rollingAverage: 0,
  suggestion: null,
  reset() {
    set({ events: [], rollingAverage: 0, suggestion: null });
  },
  recordEvent(ev) {
    const events = [...get().events, ev];
    const window = events.slice(-8);
    const avg = window.reduce((a, b) => a + b.score.score, 0) / window.length;
    set({ events, rollingAverage: avg });
  },
  setSuggestion(s) {
    set({ suggestion: s });
  },
}));

export function suggestBpmChange(currentBpm: number, scores: number[]): BpmSuggestion | null {
  if (scores.length < 8) return null;
  const last8 = scores.slice(-8);
  const avg = last8.reduce((a, b) => a + b, 0) / last8.length;
  if (avg >= 8) return { direction: "up", from: currentBpm, to: currentBpm + 5 };
  if (avg <= 5) return { direction: "down", from: currentBpm, to: Math.max(40, currentBpm - 5) };
  return null;
}
