import type { ProgressItem } from "./db";
import { progressItemToApiItem } from "./local-account-export";

describe("local account export mapping", () => {
  it("maps IndexedDB progress items into the backend-style export shape", () => {
    const item: ProgressItem = {
      id: "lesson:tuning-basics",
      itemType: "lesson",
      itemId: "tuning-basics",
      status: "in-progress",
      mastery: 65,
      attempts: 2,
      minutes: 12,
      bestScore: 80,
      lastScore: 65,
      bpmCeiling: null,
      dueAtIso: "2026-05-31T00:00:00.000Z",
      lastPracticedIso: "2026-05-30T10:00:00.000Z",
      updatedAtIso: "2026-05-30T10:05:00.000Z",
      metadata: { source: "local" },
    };

    expect(progressItemToApiItem(item, "learner-1")).toEqual({
      id: "lesson:tuning-basics",
      learner_id: "learner-1",
      item_type: "lesson",
      item_id: "tuning-basics",
      status: "in_progress",
      mastery: 65,
      attempts: 2,
      minutes: 12,
      best_score: 80,
      last_score: 65,
      bpm_ceiling: null,
      due_at: "2026-05-31T00:00:00.000Z",
      last_practiced_at: "2026-05-30T10:00:00.000Z",
      metadata: { source: "local" },
      created_at: "2026-05-30T10:05:00.000Z",
      updated_at: "2026-05-30T10:05:00.000Z",
    });
  });
});
