import {
  buildTrainerSessionMetadata,
  buildTrainerSessionSummary,
  trainerActivityType,
} from "./trainer-session";
import { trainerProgressPatch } from "./trainers";

describe("trainer sessions", () => {
  it("builds session metadata for checked ear trainer answers", () => {
    const patch = trainerProgressPatch({
      correct: true,
      itemType: "ear-training",
      itemId: "major-minor",
      promptId: "c-major",
      answer: "major",
      expected: "major",
    });

    expect(trainerActivityType("ear-training")).toBe("ear_training");
    expect(
      buildTrainerSessionMetadata({
        correct: true,
        kind: "ear-training",
        patch,
        title: "Major/minor quality",
      }),
    ).toMatchObject({
      completionStatus: "completed",
      resultSummary: "Major/minor quality: correct",
      score: 10,
      practiceMode: "ear_training",
      trainerKind: "ear-training",
      trainerTitle: "Major/minor quality",
      itemType: "ear-training",
      itemId: "major-minor",
      progressStatus: "in-progress",
      mastery: 70,
      correct: true,
      promptId: "c-major",
      answer: "major",
      expected: "major",
    });
  });

  it("builds local history summaries for fretboard trainer answers", () => {
    expect(trainerActivityType("fretboard")).toBe("fretboard_trainer");
    expect(
      buildTrainerSessionSummary({
        correct: false,
        endedAtIso: "2026-05-30T10:01:00.000Z",
        id: "session-1",
        kind: "fretboard",
        startedAtIso: "2026-05-30T10:00:00.000Z",
        title: "Fretboard notes",
      }),
    ).toEqual({
      id: "session-1",
      startedAtIso: "2026-05-30T10:00:00.000Z",
      endedAtIso: "2026-05-30T10:01:00.000Z",
      drillType: "fretboard",
      chords: [],
      targetBpm: null,
      averageScore: 0,
      events: 1,
      completionStatus: "completed",
      resultSummary: "Fretboard notes: review",
    });
  });
});
