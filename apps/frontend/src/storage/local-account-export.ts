import type { ApiProgressItem } from "@/api/client";
import {
  DEFAULT_SETTINGS,
  type ProgressItem,
  type SessionSummary,
  type SettingsRow,
  getDb,
} from "./db";
import { getAllLocalJournalEntries } from "./journal-store";

export interface IndexedDbAccountExport {
  source: "indexeddb";
  generated_at: string;
  learner_id: string;
  settings: SettingsRow;
  progress_items: ApiProgressItem[];
  sessions: SessionSummary[];
  pending_backend_syncs: {
    id: string;
    kind: string;
    attempts: number;
    last_error: string | null;
    created_at: string;
    updated_at: string;
    payload: unknown;
  }[];
  journal_entries: {
    id: string;
    backend_id: string | null;
    learner_id: string | null;
    session_id: string | null;
    body: string;
    mood: string | null;
    focus: string | null;
    created_at: string;
    updated_at: string;
    backend_synced_at: string | null;
  }[];
}

export async function buildIndexedDbAccountExport(
  settingsSnapshot?: SettingsRow,
): Promise<IndexedDbAccountExport> {
  const db = await getDb();
  const settings = settingsSnapshot ?? (await db.get("settings", "singleton")) ?? DEFAULT_SETTINGS;
  const learnerId = settings.learnerId ?? "local-learner";
  const [progressItems, sessions, journalEntries] = await Promise.all([
    db.getAll("progressItems"),
    db.getAll("sessions"),
    getAllLocalJournalEntries(),
  ]);
  const pendingSyncs = await db.getAll("pendingBackendSync");

  return {
    source: "indexeddb",
    generated_at: new Date().toISOString(),
    learner_id: learnerId,
    settings,
    progress_items: progressItems.map((item) => progressItemToApiItem(item, learnerId)),
    sessions: sessions.sort((a, b) => b.startedAtIso.localeCompare(a.startedAtIso)),
    pending_backend_syncs: pendingSyncs
      .sort((a, b) => a.createdAtIso.localeCompare(b.createdAtIso))
      .map((record) => ({
        id: record.id,
        kind: record.kind,
        attempts: record.attempts,
        last_error: record.lastError,
        created_at: record.createdAtIso,
        updated_at: record.updatedAtIso,
        payload: record.payload,
      })),
    journal_entries: journalEntries.map((entry) => ({
      id: entry.id,
      backend_id: entry.backendId,
      learner_id: entry.learnerId,
      session_id: entry.sessionId,
      body: entry.body,
      mood: entry.mood,
      focus: entry.focus,
      created_at: entry.createdAtIso,
      updated_at: entry.updatedAtIso,
      backend_synced_at: entry.backendSyncedAtIso,
    })),
  };
}

export function progressItemToApiItem(item: ProgressItem, learnerId: string): ApiProgressItem {
  return {
    id: item.id,
    learner_id: learnerId,
    item_type: item.itemType,
    item_id: item.itemId,
    status: item.status.replaceAll("-", "_"),
    mastery: item.mastery,
    attempts: item.attempts,
    minutes: item.minutes,
    best_score: item.bestScore,
    last_score: item.lastScore,
    bpm_ceiling: item.bpmCeiling,
    due_at: item.dueAtIso,
    last_practiced_at: item.lastPracticedIso,
    metadata: item.metadata,
    created_at: item.updatedAtIso,
    updated_at: item.updatedAtIso,
  };
}
