import { create } from "zustand";
import { type ChordBest, type SessionSummary, type TransitionBest, getDb } from "./db";

interface ProgressState {
  chordBests: Record<string, ChordBest>;
  transitionBests: Record<string, TransitionBest>;
  sessions: SessionSummary[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  recordChordCheck: (chordId: string, score: number) => Promise<void>;
  recordTransition: (fromId: string, toId: string, bpm: number, score: number) => Promise<void>;
  saveSession: (summary: SessionSummary) => Promise<void>;
  clear: () => Promise<void>;
}

export const useProgress = create<ProgressState>()((set, get) => ({
  chordBests: {},
  transitionBests: {},
  sessions: [],
  hydrated: false,

  async hydrate() {
    const db = await getDb();
    const [bests, transitions, sessions] = await Promise.all([
      db.getAll("chordBests"),
      db.getAll("transitionBests"),
      db.getAll("sessions"),
    ]);
    const chordBests: Record<string, ChordBest> = {};
    for (const b of bests) chordBests[b.chordId] = b;
    const transitionBests: Record<string, TransitionBest> = {};
    for (const t of transitions) transitionBests[t.id] = t;
    set({
      chordBests,
      transitionBests,
      sessions: sessions.sort((a, b) => b.startedAtIso.localeCompare(a.startedAtIso)),
      hydrated: true,
    });
  },

  async recordChordCheck(chordId, score) {
    const db = await getDb();
    const existing = get().chordBests[chordId];
    const next: ChordBest = {
      chordId,
      bestScore: Math.max(existing?.bestScore ?? 0, score),
      lastScore: score,
      attempts: (existing?.attempts ?? 0) + 1,
      lastPlayedIso: new Date().toISOString(),
    };
    await db.put("chordBests", next);
    set((s) => ({ chordBests: { ...s.chordBests, [chordId]: next } }));
  },

  async recordTransition(fromId, toId, bpm, score) {
    const id = `${fromId}->${toId}`;
    const db = await getDb();
    const existing = get().transitionBests[id];
    const attempts = (existing?.attempts ?? 0) + 1;
    // Running average score
    const averageScore =
      existing == null ? score : (existing.averageScore * existing.attempts + score) / attempts;
    const bpmCeiling =
      score >= 8 ? Math.max(existing?.bpmCeiling ?? 0, bpm) : (existing?.bpmCeiling ?? 0);
    const next: TransitionBest = {
      id,
      fromChordId: fromId,
      toChordId: toId,
      bpmCeiling,
      averageScore,
      attempts,
      lastPlayedIso: new Date().toISOString(),
    };
    await db.put("transitionBests", next);
    set((s) => ({ transitionBests: { ...s.transitionBests, [id]: next } }));
  },

  async saveSession(summary) {
    const db = await getDb();
    await db.put("sessions", summary);
    set((s) => ({ sessions: [summary, ...s.sessions] }));
  },

  async clear() {
    const db = await getDb();
    await Promise.all([db.clear("chordBests"), db.clear("transitionBests"), db.clear("sessions")]);
    set({ chordBests: {}, transitionBests: {}, sessions: [] });
  },
}));
