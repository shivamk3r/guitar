import {
  EAR_EXERCISES,
  EAR_PROMPTS,
  FRETBOARD_EXERCISES,
  FRETBOARD_PROMPTS,
  choosePrompt,
  isEarAnswerCorrect,
  isFretboardAnswerCorrect,
  trainerProgressPatch,
} from "./trainers";

describe("progress trainers", () => {
  it("chooses deterministic prompts from a seeded random value", () => {
    expect(choosePrompt(EAR_PROMPTS, () => 0).id).toBe(EAR_PROMPTS[0]?.id);
    expect(choosePrompt(EAR_PROMPTS, () => 0.99).id).toBe(EAR_PROMPTS.at(-1)?.id);
  });

  it("checks ear and fretboard answers against hidden prompts", () => {
    const ear = EAR_PROMPTS.find((prompt) => prompt.answer === "minor")!;
    expect(isEarAnswerCorrect(ear, "minor")).toBe(true);
    expect(isEarAnswerCorrect(ear, "major")).toBe(false);

    const fretboard = FRETBOARD_PROMPTS[0]!;
    expect(isFretboardAnswerCorrect(fretboard, fretboard.fret)).toBe(true);
    expect(isFretboardAnswerCorrect(fretboard, fretboard.fret + 1)).toBe(false);
  });

  it("covers all-string fretboard notes and octave-shape prompts", () => {
    expect(FRETBOARD_EXERCISES.map((exercise) => exercise.id)).toEqual([
      "bass-strings",
      "middle-strings",
      "treble-strings",
      "octaves",
    ]);
    expect(FRETBOARD_PROMPTS.map((prompt) => prompt.itemId)).toEqual(
      expect.arrayContaining([
        "low-e-notes",
        "a-string-notes",
        "d-string-notes",
        "g-string-notes",
        "b-string-notes",
        "high-e-notes",
        "octaves",
      ]),
    );
    expect(FRETBOARD_PROMPTS.find((prompt) => prompt.itemId === "octaves")?.question).toContain(
      "octave",
    );
  });

  it("covers interval, quality, and progression ear-training prompts", () => {
    expect(EAR_EXERCISES.map((exercise) => exercise.itemId)).toEqual([
      "intervals",
      "major-minor",
      "chord-quality",
      "I-IV-V",
    ]);
    expect(EAR_PROMPTS.some((prompt) => prompt.answer === "perfect fifth")).toBe(true);
    expect(EAR_PROMPTS.some((prompt) => prompt.answer === "dominant seventh")).toBe(true);
    expect(EAR_PROMPTS.some((prompt) => prompt.answer === "I-V-vi-IV")).toBe(true);
    expect(EAR_PROMPTS.every((prompt) => prompt.midiGroups.length > 0)).toBe(true);
  });

  it("builds progress patches with review state for missed answers", () => {
    expect(
      trainerProgressPatch({
        correct: false,
        itemType: "fretboard",
        itemId: "low-e-notes",
        promptId: "low-e-g",
        answer: 4,
        expected: 3,
      }),
    ).toMatchObject({
      itemType: "fretboard",
      itemId: "low-e-notes",
      status: "review",
      attempts: 1,
      lastScore: 0,
      metadata: { answer: 4, expected: 3 },
    });
  });
});
