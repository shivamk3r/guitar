import { getChord } from "@/data/chords";
import { buildPracticeDrillSessionSummary, buildStrummingSessionSummary } from "./drill-session";

describe("drill session summaries", () => {
  it("maps chord-change and progression drills into local history summaries", () => {
    const g = getChord("G")!;
    const c = getChord("C")!;

    expect(
      buildPracticeDrillSessionSummary({
        id: "session-1",
        startedAtIso: "2026-05-30T10:00:00.000Z",
        endedAtIso: "2026-05-30T10:05:00.000Z",
        practiceMode: "progression_drill",
        chords: [g, c],
        bpm: 72,
        attempts: [{ score: { score: 7 } }, { score: { score: 9 } }],
      }),
    ).toMatchObject({
      drillType: "progression",
      chords: ["G", "C"],
      targetBpm: 72,
      averageScore: 8,
      events: 2,
      completionStatus: "completed",
      resultSummary: "8.0/10 average across 2 attempts",
    });
  });

  it("maps strumming attempts into local history summaries", () => {
    expect(
      buildStrummingSessionSummary({
        id: "strum-1",
        startedAtIso: "2026-05-30T10:00:00.000Z",
        endedAtIso: "2026-05-30T10:02:00.000Z",
        bpm: 80,
        attempts: [{ score: { score: 6 } }, { score: { score: 8 } }],
      }),
    ).toMatchObject({
      drillType: "strumming",
      chords: [],
      targetBpm: 80,
      averageScore: 7,
      events: 2,
      completionStatus: "completed",
      resultSummary: "7.0/10 average across 2 strums",
    });
  });

  it("marks stopped drills without inventing scored completion", () => {
    const g = getChord("G")!;
    const c = getChord("C")!;

    expect(
      buildPracticeDrillSessionSummary({
        id: "stopped-drill",
        startedAtIso: "2026-05-30T10:00:00.000Z",
        endedAtIso: "2026-05-30T10:00:30.000Z",
        practiceMode: "chord_change_drill",
        chords: [g, c],
        bpm: 72,
        attempts: [],
      }),
    ).toMatchObject({
      averageScore: 0,
      events: 0,
      completionStatus: "stopped",
      resultSummary: "No attempts scored",
    });
  });
});
