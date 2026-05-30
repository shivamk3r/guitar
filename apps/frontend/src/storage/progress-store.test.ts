import { describe, expect, it } from "vitest";
import {
  backendProgressItemToProgressItem,
  backendSessionToSessionSummary,
  progressItemId,
} from "./progress-store";

describe("backend progress import mappers", () => {
  it("maps backend progress items into local progress rows", () => {
    const item = backendProgressItemToProgressItem({
      item_type: "chord",
      item_id: "G",
      status: "in_progress",
      mastery: 72,
      attempts: 3,
      minutes: 8,
      best_score: 90,
      last_score: 70,
      bpm_ceiling: null,
      due_at: null,
      last_practiced_at: "2026-05-30T10:00:00Z",
      metadata: { source: "session_close" },
      updated_at: "2026-05-30T10:01:00Z",
    });

    expect(item).toMatchObject({
      id: progressItemId("chord", "G"),
      itemType: "chord",
      itemId: "G",
      status: "in-progress",
      mastery: 72,
      bestScore: 90,
      metadata: { source: "session_close" },
    });
  });

  it("maps backend history sessions into local progress dashboard sessions", () => {
    const summary = backendSessionToSessionSummary({
      id: "session-1",
      activity_type: "practice_drill",
      started_at: "2026-05-30T10:00:00Z",
      ended_at: "2026-05-30T10:10:00Z",
      client_metadata: {
        practiceMode: "timed_chord_practice",
        chords: ["G", "C"],
        bpm: 72,
        attempts: [{}, {}],
      },
      completion_status: "completed",
      score: 8.5,
      result_summary: "8.5/10 average across 2 attempts",
    });

    expect(summary).toEqual({
      id: "session-1",
      startedAtIso: "2026-05-30T10:00:00Z",
      endedAtIso: "2026-05-30T10:10:00Z",
      drillType: "timed-chord",
      chords: ["G", "C"],
      targetBpm: 72,
      averageScore: 8.5,
      events: 2,
      completionStatus: "completed",
      resultSummary: "8.5/10 average across 2 attempts",
    });
  });

  it("preserves stopped backend history results for local restore", () => {
    const summary = backendSessionToSessionSummary({
      id: "song-stop",
      activity_type: "song_practice",
      started_at: "2026-05-30T10:00:00Z",
      ended_at: "2026-05-30T10:03:00Z",
      client_metadata: {
        practiceMode: "song_section_loop",
        songId: "open-road-study",
        sectionName: "Verse",
        bpm: 68,
        chords: ["G", "C", "G", "D"],
        bars: 8,
      },
      completion_status: "stopped",
      score: null,
      result_summary: "Verse stopped at 68 BPM",
    });

    expect(summary).toMatchObject({
      id: "song-stop",
      drillType: "song-practice",
      averageScore: 0,
      events: 0,
      completionStatus: "stopped",
      resultSummary: "Verse stopped at 68 BPM",
    });
  });
});
