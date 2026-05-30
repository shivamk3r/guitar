import { create } from "zustand";
import {
  type ChordBest,
  type ProgressItem,
  type ProgressItemType,
  type SessionSummary,
  type TransitionBest,
  getDb,
} from "./db";

type ProgressPatch = {
  itemType: ProgressItemType;
  itemId: string;
  status?: ProgressItem["status"];
  mastery?: number;
  attempts?: number;
  minutes?: number;
  bestScore?: number | null;
  lastScore?: number | null;
  bpmCeiling?: number | null;
  dueAtIso?: string | null;
  lastPracticedIso?: string | null;
  metadata?: Record<string, unknown>;
};

export interface BackendProgressItemSnapshot {
  item_type: string;
  item_id: string;
  status: string;
  mastery: number;
  attempts: number;
  minutes: number;
  best_score: number | null;
  last_score: number | null;
  bpm_ceiling: number | null;
  due_at: string | null;
  last_practiced_at: string | null;
  metadata: Record<string, unknown>;
  updated_at: string;
}

export interface BackendSessionSnapshot {
  id: string;
  activity_type: string;
  started_at: string;
  ended_at: string | null;
  client_metadata: Record<string, unknown>;
  completion_status: string;
  score: number | null;
  result_summary: string | null;
}

interface BackendProgressSnapshot {
  progressItems: BackendProgressItemSnapshot[];
  sessions: BackendSessionSnapshot[];
}

interface ProgressState {
  chordBests: Record<string, ChordBest>;
  transitionBests: Record<string, TransitionBest>;
  progressItems: Record<string, ProgressItem>;
  sessions: SessionSummary[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  recordChordCheck: (chordId: string, score: number) => Promise<void>;
  recordTransition: (fromId: string, toId: string, bpm: number, score: number) => Promise<void>;
  upsertProgressItem: (patch: ProgressPatch) => Promise<ProgressItem>;
  completeLesson: (lessonId: string, minutes?: number) => Promise<ProgressItem>;
  recordSongProgress: (
    songId: string,
    patch: Omit<ProgressPatch, "itemType" | "itemId">,
  ) => Promise<ProgressItem>;
  restoreBackendSnapshot: (snapshot: BackendProgressSnapshot) => Promise<void>;
  saveSession: (summary: SessionSummary) => Promise<void>;
  clear: () => Promise<void>;
}

export const useProgress = create<ProgressState>()((set, get) => ({
  chordBests: {},
  transitionBests: {},
  progressItems: {},
  sessions: [],
  hydrated: false,

  async hydrate() {
    const db = await getDb();
    const [bests, transitions, progressItemsList, sessions] = await Promise.all([
      db.getAll("chordBests"),
      db.getAll("transitionBests"),
      db.getAll("progressItems"),
      db.getAll("sessions"),
    ]);
    const chordBests: Record<string, ChordBest> = {};
    for (const b of bests) chordBests[b.chordId] = b;
    const transitionBests: Record<string, TransitionBest> = {};
    for (const t of transitions) transitionBests[t.id] = t;
    const progressItems: Record<string, ProgressItem> = {};
    for (const item of progressItemsList) progressItems[item.id] = item;
    set({
      chordBests,
      transitionBests,
      progressItems,
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
    const progressItem = mergeProgressItem(get().progressItems[progressItemId("chord", chordId)], {
      itemType: "chord",
      itemId: chordId,
      status: score >= 8.5 ? "mastered" : score >= 6 ? "in-progress" : "review",
      mastery: score * 10,
      attempts: 1,
      bestScore: score * 10,
      lastScore: score * 10,
      lastPracticedIso: next.lastPlayedIso,
    });
    await db.put("progressItems", progressItem);
    set((s) => ({ chordBests: { ...s.chordBests, [chordId]: next } }));
    set((s) => ({ progressItems: { ...s.progressItems, [progressItem.id]: progressItem } }));
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
    const progressItem = mergeProgressItem(get().progressItems[progressItemId("transition", id)], {
      itemType: "transition",
      itemId: id,
      status: averageScore >= 8 ? "mastered" : averageScore >= 6 ? "in-progress" : "review",
      mastery: averageScore * 10,
      attempts: 1,
      bestScore: Math.max(existing?.averageScore ?? 0, score) * 10,
      lastScore: score * 10,
      bpmCeiling,
      lastPracticedIso: next.lastPlayedIso,
    });
    await db.put("progressItems", progressItem);
    set((s) => ({ transitionBests: { ...s.transitionBests, [id]: next } }));
    set((s) => ({ progressItems: { ...s.progressItems, [progressItem.id]: progressItem } }));
  },

  async upsertProgressItem(patch) {
    const db = await getDb();
    const id = progressItemId(patch.itemType, patch.itemId);
    const next = mergeProgressItem(get().progressItems[id], patch);
    await db.put("progressItems", next);
    set((s) => ({ progressItems: { ...s.progressItems, [id]: next } }));
    return next;
  },

  async completeLesson(lessonId, minutes = 5) {
    return get().upsertProgressItem({
      itemType: "lesson",
      itemId: lessonId,
      status: "mastered",
      mastery: 100,
      attempts: 1,
      minutes,
      bestScore: 100,
      lastScore: 100,
      lastPracticedIso: new Date().toISOString(),
    });
  },

  async recordSongProgress(songId, patch) {
    return get().upsertProgressItem({
      itemType: "song",
      itemId: songId,
      ...patch,
      lastPracticedIso: patch.lastPracticedIso ?? new Date().toISOString(),
    });
  },

  async restoreBackendSnapshot(snapshot) {
    const db = await getDb();
    const progressItems = { ...get().progressItems };
    for (const backendItem of snapshot.progressItems) {
      const imported = backendProgressItemToProgressItem(backendItem);
      if (!imported) continue;
      const existing = progressItems[imported.id];
      progressItems[imported.id] = newerProgressItem(existing, imported);
    }

    const sessionsById = new Map(get().sessions.map((session) => [session.id, session]));
    for (const backendSession of snapshot.sessions) {
      const imported = backendSessionToSessionSummary(backendSession);
      if (imported) sessionsById.set(imported.id, imported);
    }
    const sessions = Array.from(sessionsById.values()).sort((a, b) =>
      b.startedAtIso.localeCompare(a.startedAtIso),
    );
    const chordBests = { ...get().chordBests };
    const transitionBests = { ...get().transitionBests };
    for (const item of Object.values(progressItems)) {
      const chordBest = chordBestFromProgressItem(item);
      if (chordBest) chordBests[chordBest.chordId] = chordBest;
      const transitionBest = transitionBestFromProgressItem(item);
      if (transitionBest) transitionBests[transitionBest.id] = transitionBest;
    }

    await Promise.all([
      ...Object.values(progressItems).map((item) => db.put("progressItems", item)),
      ...Object.values(chordBests).map((item) => db.put("chordBests", item)),
      ...Object.values(transitionBests).map((item) => db.put("transitionBests", item)),
      ...sessions.map((session) => db.put("sessions", session)),
    ]);
    set({ progressItems, chordBests, transitionBests, sessions });
  },

  async saveSession(summary) {
    const db = await getDb();
    await db.put("sessions", summary);
    set((s) => ({
      sessions: [summary, ...s.sessions.filter((session) => session.id !== summary.id)],
    }));
  },

  async clear() {
    const db = await getDb();
    await Promise.all([
      db.clear("chordBests"),
      db.clear("transitionBests"),
      db.clear("progressItems"),
      db.clear("sessions"),
      db.clear("journalEntries"),
      db.clear("pendingBackendSync"),
    ]);
    set({ chordBests: {}, transitionBests: {}, progressItems: {}, sessions: [] });
  },
}));

export function progressItemId(itemType: ProgressItemType, itemId: string): string {
  return `${itemType}:${itemId}`;
}

export function backendProgressItemToProgressItem(
  item: BackendProgressItemSnapshot,
): ProgressItem | null {
  if (!isProgressItemType(item.item_type)) return null;
  return {
    id: progressItemId(item.item_type, item.item_id),
    itemType: item.item_type,
    itemId: item.item_id,
    status: normalizeMasteryStatus(item.status),
    mastery: clampPercent(item.mastery),
    attempts: item.attempts,
    minutes: item.minutes,
    bestScore: item.best_score,
    lastScore: item.last_score,
    bpmCeiling: item.bpm_ceiling,
    dueAtIso: item.due_at,
    lastPracticedIso: item.last_practiced_at,
    updatedAtIso: item.updated_at,
    metadata: item.metadata ?? {},
  };
}

export function backendSessionToSessionSummary(
  session: BackendSessionSnapshot,
): SessionSummary | null {
  if (!session.ended_at) return null;
  const metadata = session.client_metadata ?? {};
  const attempts = Array.isArray(metadata.attempts) ? metadata.attempts.length : 0;
  const completionStatus =
    stringValue(session.completion_status) ?? stringValue(metadata.completionStatus);
  const resultSummary = stringValue(session.result_summary) ?? stringValue(metadata.resultSummary);
  return {
    id: session.id,
    startedAtIso: session.started_at,
    endedAtIso: session.ended_at,
    drillType: backendActivityToDrillType(session.activity_type, metadata),
    chords: stringArray(metadata.chords).length
      ? stringArray(metadata.chords)
      : stringValue(metadata.chordId)
        ? [stringValue(metadata.chordId)!]
        : [],
    targetBpm: numberValue(metadata.bpm),
    averageScore:
      numberValue(session.score) ?? nestedNumber(metadata, "scoreSummary", "averageScore") ?? 0,
    events: attempts || nestedNumber(metadata, "scoreSummary", "attempts") || 0,
    completionStatus: completionStatus ?? undefined,
    resultSummary,
  };
}

function newerProgressItem(
  existing: ProgressItem | undefined,
  imported: ProgressItem,
): ProgressItem {
  if (!existing) return imported;
  return existing.updatedAtIso > imported.updatedAtIso ? existing : imported;
}

function chordBestFromProgressItem(item: ProgressItem): ChordBest | null {
  if (item.itemType !== "chord") return null;
  return {
    chordId: item.itemId,
    bestScore: percentToScore(item.bestScore ?? item.mastery),
    lastScore: percentToScore(item.lastScore ?? item.mastery),
    attempts: item.attempts,
    lastPlayedIso: item.lastPracticedIso ?? item.updatedAtIso,
  };
}

function transitionBestFromProgressItem(item: ProgressItem): TransitionBest | null {
  if (item.itemType !== "transition" || !item.itemId.includes("->")) return null;
  const [fromChordId, toChordId] = item.itemId.split("->");
  if (!fromChordId || !toChordId) return null;
  return {
    id: item.itemId,
    fromChordId,
    toChordId,
    bpmCeiling: item.bpmCeiling ?? 0,
    averageScore: percentToScore(item.lastScore ?? item.mastery),
    attempts: item.attempts,
    lastPlayedIso: item.lastPracticedIso ?? item.updatedAtIso,
  };
}

function backendActivityToDrillType(
  activityType: string,
  metadata: Record<string, unknown>,
): SessionSummary["drillType"] {
  if (activityType === "tuner") return "tuner";
  if (activityType === "chord_check") return "chord-check";
  if (activityType === "lesson") return "lesson";
  if (activityType === "song_practice") return "song-practice";
  if (activityType === "ear_training") return "ear-training";
  if (activityType === "fretboard_trainer") return "fretboard";
  if (activityType === "technique_drill") return "technique";
  if (activityType === "practice_drill") {
    const mode = stringValue(metadata.practiceMode);
    if (mode === "timed_chord_practice") return "timed-chord";
    if (mode === "progression_drill") return "progression";
    if (mode === "strumming_drill") return "strumming";
  }
  return "chord-change";
}

function normalizeMasteryStatus(status: string): ProgressItem["status"] {
  const normalized = status.replaceAll("_", "-");
  if (
    normalized === "ready" ||
    normalized === "in-progress" ||
    normalized === "review" ||
    normalized === "mastered"
  ) {
    return normalized;
  }
  return "in-progress";
}

function isProgressItemType(value: string): value is ProgressItemType {
  return [
    "skill",
    "lesson",
    "chord",
    "transition",
    "rhythm",
    "technique",
    "scale",
    "theory",
    "song",
    "song-section",
    "ear-training",
    "fretboard",
    "challenge",
  ].includes(value);
}

function mergeProgressItem(existing: ProgressItem | undefined, patch: ProgressPatch): ProgressItem {
  const now = new Date().toISOString();
  const mastery = Math.max(existing?.mastery ?? 0, clampPercent(patch.mastery ?? 0));
  const status = patch.status ?? (mastery >= 85 ? "mastered" : (existing?.status ?? "in-progress"));
  return {
    id: progressItemId(patch.itemType, patch.itemId),
    itemType: patch.itemType,
    itemId: patch.itemId,
    status,
    mastery,
    attempts: (existing?.attempts ?? 0) + (patch.attempts ?? 0),
    minutes: (existing?.minutes ?? 0) + (patch.minutes ?? 0),
    bestScore: maxNullable(existing?.bestScore ?? null, patch.bestScore ?? null),
    lastScore: patch.lastScore ?? existing?.lastScore ?? null,
    bpmCeiling: maxNullable(existing?.bpmCeiling ?? null, patch.bpmCeiling ?? null),
    dueAtIso: patch.dueAtIso ?? existing?.dueAtIso ?? null,
    lastPracticedIso: patch.lastPracticedIso ?? existing?.lastPracticedIso ?? now,
    updatedAtIso: now,
    metadata: { ...(existing?.metadata ?? {}), ...(patch.metadata ?? {}) },
  };
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function percentToScore(value: number | null): number {
  return clampPercent(value ?? 0) / 10;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nestedNumber(
  metadata: Record<string, unknown>,
  parent: string,
  child: string,
): number | null {
  const value = metadata[parent];
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return numberValue((value as Record<string, unknown>)[child]);
}

function maxNullable<T extends number>(left: T | null, right: T | null): T | null {
  if (left == null) return right;
  if (right == null) return left;
  return Math.max(left, right) as T;
}
