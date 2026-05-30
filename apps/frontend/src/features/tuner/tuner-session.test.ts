import { describe, expect, it } from "vitest";
import {
  type TunerSessionResult,
  buildTunerProgressPatch,
  buildTunerSessionSummary,
  tuningMasteryPercent,
  tuningProgressStatus,
} from "./tuner-session";

const tuningResult: TunerSessionResult = {
  tuningId: "standard",
  tuningName: "Standard",
  tunedStringCount: 5,
  totalStringCount: 6,
  tunedStrings: ["E2", "A2", "D3", "G3", "B3"],
  lastDetectedHz: 246.94,
  lastDetectedNote: "B3",
};

describe("tuner sessions", () => {
  it("summarizes tuned strings for local history", () => {
    const summary = buildTunerSessionSummary({
      id: "tuner-session-1",
      startedAtIso: "2026-05-30T10:00:00.000Z",
      endedAtIso: "2026-05-30T10:03:00.000Z",
      tuningResult,
    });

    expect(summary).toMatchObject({
      id: "tuner-session-1",
      startedAtIso: "2026-05-30T10:00:00.000Z",
      endedAtIso: "2026-05-30T10:03:00.000Z",
      drillType: "tuner",
      chords: [],
      targetBpm: null,
      events: 5,
    });
    expect(summary.averageScore).toBeCloseTo(8.3333, 4);
  });

  it("builds the local setup-tuning progress patch", () => {
    const patch = buildTunerProgressPatch({
      sessionId: "tuner-session-1",
      startedAtIso: "2026-05-30T10:00:00.000Z",
      endedAtIso: "2026-05-30T10:05:00.000Z",
      tuningResult,
    });

    expect(patch).toMatchObject({
      itemType: "skill",
      itemId: "setup-tuning",
      status: "in-progress",
      attempts: 1,
      minutes: 5,
      lastPracticedIso: "2026-05-30T10:05:00.000Z",
      metadata: {
        source: "local_tuner_session",
        sourceSessionId: "tuner-session-1",
        tuningId: "standard",
        tunedStringCount: 5,
        totalStringCount: 6,
      },
    });
    expect(patch.mastery).toBeCloseTo(83.3333, 4);
    expect(patch.bestScore).toBeCloseTo(83.3333, 4);
    expect(patch.lastScore).toBeCloseTo(83.3333, 4);
  });

  it("uses backend-equivalent mastery thresholds", () => {
    expect(tuningMasteryPercent({ ...tuningResult, tunedStringCount: 6 })).toBe(100);
    expect(tuningProgressStatus(100)).toBe("mastered");
    expect(tuningProgressStatus(60)).toBe("in-progress");
    expect(tuningProgressStatus(59)).toBe("review");
  });
});
