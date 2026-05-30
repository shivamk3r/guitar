import { type JournalEntry, createSessionJournal } from "@/api/client";
import { type LocalJournalEntry, getDb } from "./db";

export interface JournalViewEntry {
  id: string;
  backendId: string | null;
  learnerId: string | null;
  sessionId: string | null;
  body: string;
  mood: string | null;
  focus: string | null;
  createdAtIso: string;
  updatedAtIso: string;
  source: "local" | "backend";
  synced: boolean;
}

export interface JournalSyncResult {
  synced: number;
  failed: number;
  skipped: number;
}

interface JournalSyncDeps {
  loadLocalEntries(): Promise<LocalJournalEntry[]>;
  createBackendEntry(input: {
    sessionId: string;
    learnerId: string;
    body: string;
    mood: string | null;
    focus: string | null;
  }): Promise<JournalEntry>;
  markSynced(localId: string, backendEntry: JournalEntry): Promise<LocalJournalEntry | null>;
}

export async function getLocalJournalEntriesForSession(
  sessionId: string,
): Promise<LocalJournalEntry[]> {
  const db = await getDb();
  const entries = await db.getAllFromIndex("journalEntries", "by-session", sessionId);
  return sortJournalEntries(entries);
}

export async function getAllLocalJournalEntries(): Promise<LocalJournalEntry[]> {
  const db = await getDb();
  const entries = await db.getAll("journalEntries");
  return sortJournalEntries(entries);
}

export async function restoreBackendJournalEntries(
  backendEntries: readonly JournalEntry[],
): Promise<void> {
  if (backendEntries.length === 0) return;
  const db = await getDb();
  const localEntries = await db.getAll("journalEntries");
  const localByBackendId = new Map(
    localEntries
      .filter(
        (entry): entry is LocalJournalEntry & { backendId: string } => entry.backendId !== null,
      )
      .map((entry) => [entry.backendId, entry]),
  );
  await Promise.all(
    backendEntries.map((entry) =>
      db.put("journalEntries", backendJournalToLocalEntry(entry, localByBackendId.get(entry.id))),
    ),
  );
}

export async function createLocalJournalEntry(input: {
  learnerId: string | null;
  sessionId: string | null;
  body: string;
  focus?: string | null;
  mood?: string | null;
  createdAtIso?: string;
}): Promise<LocalJournalEntry> {
  const now = input.createdAtIso ?? new Date().toISOString();
  const entry: LocalJournalEntry = {
    id: crypto.randomUUID(),
    backendId: null,
    learnerId: input.learnerId,
    sessionId: input.sessionId,
    body: input.body,
    mood: input.mood ?? null,
    focus: input.focus ?? null,
    createdAtIso: now,
    updatedAtIso: now,
    backendSyncedAtIso: null,
  };
  const db = await getDb();
  await db.put("journalEntries", entry);
  return entry;
}

export async function markLocalJournalEntrySynced(
  localId: string,
  backendEntry: JournalEntry,
): Promise<LocalJournalEntry | null> {
  const db = await getDb();
  const existing = await db.get("journalEntries", localId);
  if (!existing) return null;
  const now = new Date().toISOString();
  const next: LocalJournalEntry = {
    ...existing,
    backendId: backendEntry.id,
    learnerId: backendEntry.learner_id,
    updatedAtIso: now,
    backendSyncedAtIso: now,
  };
  await db.put("journalEntries", next);
  return next;
}

export async function clearLocalJournalEntries(): Promise<void> {
  const db = await getDb();
  await db.clear("journalEntries");
}

export async function syncUnsyncedLocalJournalEntries(
  settings: { learnerId: string | null },
  deps: JournalSyncDeps = {
    loadLocalEntries: getAllLocalJournalEntries,
    createBackendEntry: createSessionJournal,
    markSynced: markLocalJournalEntrySynced,
  },
): Promise<JournalSyncResult> {
  const entries = await deps.loadLocalEntries();
  const learnerId = settings.learnerId;
  let synced = 0;
  let failed = 0;
  let skipped = 0;

  for (const entry of entries) {
    if (learnerId === null || !canSyncLocalJournalEntry(entry, learnerId)) {
      skipped += 1;
      continue;
    }
    try {
      const backendEntry = await deps.createBackendEntry({
        sessionId: entry.sessionId,
        learnerId,
        body: entry.body,
        mood: entry.mood,
        focus: entry.focus,
      });
      await deps.markSynced(entry.id, backendEntry);
      synced += 1;
    } catch (err) {
      failed += 1;
      console.error("local journal backend sync failed", err);
    }
  }

  return { synced, failed, skipped };
}

export function canSyncLocalJournalEntry(
  entry: LocalJournalEntry,
  learnerId: string | null,
): entry is LocalJournalEntry & { sessionId: string } {
  return entry.backendSyncedAtIso === null && learnerId !== null && entry.sessionId !== null;
}

export function mergeJournalEntries(
  localEntries: readonly LocalJournalEntry[],
  backendEntries: readonly JournalEntry[],
): JournalViewEntry[] {
  const backendIds = new Set(backendEntries.map((entry) => entry.id));
  const views = backendEntries.map(backendJournalToView);
  for (const entry of localEntries) {
    if (entry.backendId && backendIds.has(entry.backendId)) continue;
    views.push(localJournalToView(entry));
  }
  return views.sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
}

export function localJournalToView(entry: LocalJournalEntry): JournalViewEntry {
  return {
    id: entry.id,
    backendId: entry.backendId,
    learnerId: entry.learnerId,
    sessionId: entry.sessionId,
    body: entry.body,
    mood: entry.mood,
    focus: entry.focus,
    createdAtIso: entry.createdAtIso,
    updatedAtIso: entry.updatedAtIso,
    source: "local",
    synced: entry.backendSyncedAtIso !== null,
  };
}

export function backendJournalToView(entry: JournalEntry): JournalViewEntry {
  return {
    id: `backend:${entry.id}`,
    backendId: entry.id,
    learnerId: entry.learner_id,
    sessionId: entry.session_id,
    body: entry.body,
    mood: entry.mood,
    focus: entry.focus,
    createdAtIso: entry.created_at,
    updatedAtIso: entry.updated_at,
    source: "backend",
    synced: true,
  };
}

export function backendJournalToLocalEntry(
  entry: JournalEntry,
  existing?: LocalJournalEntry,
): LocalJournalEntry {
  return {
    id: existing?.id ?? `backend:${entry.id}`,
    backendId: entry.id,
    learnerId: entry.learner_id,
    sessionId: entry.session_id,
    body: entry.body,
    mood: entry.mood,
    focus: entry.focus,
    createdAtIso: entry.created_at,
    updatedAtIso: entry.updated_at,
    backendSyncedAtIso: entry.updated_at,
  };
}

function sortJournalEntries(entries: LocalJournalEntry[]): LocalJournalEntry[] {
  return entries.sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
}
