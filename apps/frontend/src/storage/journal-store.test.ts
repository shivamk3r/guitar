import type { JournalEntry } from "@/api/client";
import { vi } from "vitest";
import type { LocalJournalEntry } from "./db";
import {
  backendJournalToLocalEntry,
  canSyncLocalJournalEntry,
  mergeJournalEntries,
  syncUnsyncedLocalJournalEntries,
} from "./journal-store";

describe("local journal merge", () => {
  it("keeps unsynced local notes and deduplicates notes already returned by the backend", () => {
    const localUnsynced = localEntry({
      id: "local-unsynced",
      backendId: null,
      body: "Needs slower changes.",
      createdAtIso: "2026-05-30T10:02:00.000Z",
    });
    const localSynced = localEntry({
      id: "local-synced",
      backendId: "backend-1",
      body: "Backend already has this.",
      createdAtIso: "2026-05-30T10:00:00.000Z",
    });
    const backend = backendEntry({
      id: "backend-1",
      body: "Backend already has this.",
      created_at: "2026-05-30T10:00:00.000Z",
    });

    expect(mergeJournalEntries([localSynced, localUnsynced], [backend])).toEqual([
      expect.objectContaining({
        id: "local-unsynced",
        body: "Needs slower changes.",
        source: "local",
        synced: false,
      }),
      expect.objectContaining({
        id: "backend:backend-1",
        backendId: "backend-1",
        source: "backend",
        synced: true,
      }),
    ]);
  });

  it("syncs eligible local notes and skips notes without a backend session target", async () => {
    const synced = localEntry({ id: "already-synced", backendSyncedAtIso: "2026-05-30T10:01:00Z" });
    const missingSession = localEntry({ id: "missing-session", sessionId: null });
    const unsynced = localEntry({
      id: "local-unsynced",
      body: "Review D to G tomorrow.",
      focus: "D-G change",
    });
    const createBackendEntry = vi.fn(async () =>
      backendEntry({
        id: "backend-2",
        body: unsynced.body,
        focus: unsynced.focus,
      }),
    );
    const markSynced = vi.fn(async () => null);

    const result = await syncUnsyncedLocalJournalEntries(
      { learnerId: "learner-1" },
      {
        loadLocalEntries: async () => [synced, missingSession, unsynced],
        createBackendEntry,
        markSynced,
      },
    );

    expect(result).toEqual({ synced: 1, failed: 0, skipped: 2 });
    expect(createBackendEntry).toHaveBeenCalledWith({
      sessionId: "session-1",
      learnerId: "learner-1",
      body: "Review D to G tomorrow.",
      mood: null,
      focus: "D-G change",
    });
    expect(markSynced).toHaveBeenCalledWith(
      "local-unsynced",
      expect.objectContaining({ id: "backend-2" }),
    );
    expect(canSyncLocalJournalEntry(unsynced, "learner-1")).toBe(true);
    expect(canSyncLocalJournalEntry(missingSession, "learner-1")).toBe(false);
  });

  it("maps backend journal entries into synced local restore rows", () => {
    const backend = backendEntry({
      id: "backend-restored",
      body: "Slow down the last two bars.",
      mood: "focused",
      focus: "Verse",
      created_at: "2026-05-30T10:00:00.000Z",
      updated_at: "2026-05-30T10:05:00.000Z",
    });

    expect(backendJournalToLocalEntry(backend)).toEqual({
      id: "backend:backend-restored",
      backendId: "backend-restored",
      learnerId: "learner-1",
      sessionId: "session-1",
      body: "Slow down the last two bars.",
      mood: "focused",
      focus: "Verse",
      createdAtIso: "2026-05-30T10:00:00.000Z",
      updatedAtIso: "2026-05-30T10:05:00.000Z",
      backendSyncedAtIso: "2026-05-30T10:05:00.000Z",
    });
  });

  it("keeps an existing local id when refreshing a synced backend note", () => {
    const existing = localEntry({
      id: "local-existing",
      backendId: "backend-1",
      body: "Old local copy.",
      backendSyncedAtIso: "2026-05-30T10:01:00.000Z",
    });

    expect(
      backendJournalToLocalEntry(
        backendEntry({
          id: "backend-1",
          body: "Updated backend copy.",
          updated_at: "2026-05-30T10:06:00.000Z",
        }),
        existing,
      ),
    ).toMatchObject({
      id: "local-existing",
      backendId: "backend-1",
      body: "Updated backend copy.",
      backendSyncedAtIso: "2026-05-30T10:06:00.000Z",
    });
  });
});

function localEntry(patch: Partial<LocalJournalEntry>): LocalJournalEntry {
  return {
    id: "local-entry",
    backendId: null,
    learnerId: "learner-1",
    sessionId: "session-1",
    body: "Practice note",
    mood: null,
    focus: null,
    createdAtIso: "2026-05-30T10:00:00.000Z",
    updatedAtIso: "2026-05-30T10:00:00.000Z",
    backendSyncedAtIso: null,
    ...patch,
  };
}

function backendEntry(patch: Partial<JournalEntry>): JournalEntry {
  return {
    id: "backend-entry",
    learner_id: "learner-1",
    session_id: "session-1",
    body: "Practice note",
    mood: null,
    focus: null,
    created_at: "2026-05-30T10:00:00.000Z",
    updated_at: "2026-05-30T10:00:00.000Z",
    ...patch,
  };
}
