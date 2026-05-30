import { describe, expect, it } from "vitest";
import { averageChordCheckScore, buildChordCheckSessionSummary } from "./chord-check-session";

describe("chord check sessions", () => {
  it("summarizes checked chord attempts for local history", () => {
    const summary = buildChordCheckSessionSummary({
      id: "session-1",
      startedAtIso: "2026-05-30T10:00:00.000Z",
      endedAtIso: "2026-05-30T10:02:00.000Z",
      chord: { id: "G" },
      attempts: [{ score: { score: 7 } }, { score: { score: 9 } }],
    });

    expect(summary).toEqual({
      id: "session-1",
      startedAtIso: "2026-05-30T10:00:00.000Z",
      endedAtIso: "2026-05-30T10:02:00.000Z",
      drillType: "chord-check",
      chords: ["G"],
      targetBpm: null,
      averageScore: 8,
      events: 2,
      completionStatus: "completed",
      resultSummary: "8.0/10 average across 2 attempts",
    });
  });

  it("uses zero score for stopped checks with no attempts", () => {
    expect(averageChordCheckScore([])).toBeNull();
    expect(
      buildChordCheckSessionSummary({
        id: "session-empty",
        startedAtIso: "2026-05-30T10:00:00.000Z",
        endedAtIso: "2026-05-30T10:00:30.000Z",
        chord: { id: "C" },
        attempts: [],
      }),
    ).toMatchObject({
      averageScore: 0,
      completionStatus: "stopped",
      resultSummary: "No attempts scored",
    });
  });
});
