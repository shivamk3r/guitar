import { getTechniqueTarget } from "@/data/technique-practice";
import {
  buildTechniquePracticeMetadata,
  buildTechniqueProgressPatch,
  buildTechniqueSessionSummary,
} from "./technique-session";

describe("technique practice sessions", () => {
  const target = getTechniqueTarget("pentatonic-box");

  it("builds backend metadata and progress patches for self-rated technique work", () => {
    expect(
      buildTechniquePracticeMetadata({
        bpm: 72,
        minutes: 8,
        notes: "Even on string pairs.",
        rating: 8.5,
        target,
      }),
    ).toMatchObject({
      completionStatus: "completed",
      resultSummary: "A minor pentatonic box: 8.5/10",
      score: 8.5,
      practiceMode: "technique_practice",
      targetId: "pentatonic-box",
      itemType: "scale",
      itemId: "A-minor-pentatonic",
      skillId: "pentatonic-scale",
      lessonId: "pentatonic-scale",
      bpm: 72,
      minutes: 8,
      rating: 8.5,
      mastery: 85,
      progressStatus: "mastered",
      notes: "Even on string pairs.",
    });

    expect(
      buildTechniqueProgressPatch({
        bpm: 72,
        minutes: 8,
        notes: "Even on string pairs.",
        rating: 8.5,
        target,
      }),
    ).toMatchObject({
      itemType: "scale",
      itemId: "A-minor-pentatonic",
      status: "mastered",
      mastery: 85,
      attempts: 1,
      minutes: 8,
      bestScore: 85,
      lastScore: 85,
      bpmCeiling: 72,
    });
  });

  it("builds local session summaries for technique history", () => {
    expect(
      buildTechniqueSessionSummary({
        bpm: null,
        endedAtIso: "2026-05-30T10:08:00.000Z",
        id: "session-1",
        rating: 7,
        startedAtIso: "2026-05-30T10:00:00.000Z",
        target,
      }),
    ).toEqual({
      id: "session-1",
      startedAtIso: "2026-05-30T10:00:00.000Z",
      endedAtIso: "2026-05-30T10:08:00.000Z",
      drillType: "technique",
      chords: [],
      targetBpm: null,
      averageScore: 7,
      events: 1,
      completionStatus: "completed",
      resultSummary: "A minor pentatonic box: 7/10",
    });
  });
});
