import type { ProgressItemType } from "@/storage/db";

export type EarAnswer =
  | "minor third"
  | "major third"
  | "perfect fifth"
  | "major"
  | "minor"
  | "major triad"
  | "minor triad"
  | "dominant seventh"
  | "I-IV-V"
  | "I-V-vi-IV";

export interface EarExercise {
  id: string;
  title: string;
  itemId: string;
  options: EarAnswer[];
  prompts: EarPrompt[];
}

export interface EarPrompt {
  id: string;
  itemId: string;
  answer: EarAnswer;
  midiGroups: number[][];
  detail: string;
}

export interface FretboardPrompt {
  id: string;
  itemId: string;
  note: string;
  string: string;
  fret: number;
  question: string;
}

export interface FretboardExercise {
  id: string;
  title: string;
  prompts: FretboardPrompt[];
}

export interface TrainerProgressPatch {
  itemType: ProgressItemType;
  itemId: string;
  status: "in-progress" | "review";
  mastery: number;
  attempts: number;
  minutes: number;
  bestScore: number;
  lastScore: number;
  metadata: Record<string, unknown>;
}

export const EAR_EXERCISES: EarExercise[] = [
  {
    id: "intervals",
    title: "Interval distance",
    itemId: "intervals",
    options: ["minor third", "major third", "perfect fifth"],
    prompts: [
      prompt("c-eb", "intervals", "minor third", [[60], [63]], "C to Eb"),
      prompt("c-e", "intervals", "major third", [[60], [64]], "C to E"),
      prompt("c-g", "intervals", "perfect fifth", [[60], [67]], "C to G"),
    ],
  },
  {
    id: "major-minor",
    title: "Major/minor quality",
    itemId: "major-minor",
    options: ["major", "minor"],
    prompts: [
      prompt("c-major", "major-minor", "major", [[60, 64, 67]], "C major"),
      prompt("c-minor", "major-minor", "minor", [[60, 63, 67]], "C minor"),
      prompt("g-major", "major-minor", "major", [[55, 59, 62]], "G major"),
      prompt("a-minor", "major-minor", "minor", [[57, 60, 64]], "A minor"),
    ],
  },
  {
    id: "chord-quality",
    title: "Chord quality",
    itemId: "chord-quality",
    options: ["major triad", "minor triad", "dominant seventh"],
    prompts: [
      prompt("f-major-triad", "chord-quality", "major triad", [[53, 57, 60]], "F major triad"),
      prompt("d-minor-triad", "chord-quality", "minor triad", [[50, 53, 57]], "D minor triad"),
      prompt("g-dominant-seventh", "chord-quality", "dominant seventh", [[55, 59, 62, 65]], "G7"),
    ],
  },
  {
    id: "progressions",
    title: "Simple progression",
    itemId: "I-IV-V",
    options: ["I-IV-V", "I-V-vi-IV"],
    prompts: [
      prompt(
        "c-i-iv-v",
        "I-IV-V",
        "I-IV-V",
        [
          [60, 64, 67],
          [65, 69, 72],
          [67, 71, 74],
        ],
        "C-F-G",
      ),
      prompt(
        "g-i-v-vi-iv",
        "I-IV-V",
        "I-V-vi-IV",
        [
          [55, 59, 62],
          [62, 66, 69],
          [64, 67, 71],
          [60, 64, 67],
        ],
        "G-D-Em-C",
      ),
    ],
  },
];

export const EAR_PROMPTS: EarPrompt[] = EAR_EXERCISES.flatMap((exercise) => exercise.prompts);

export const FRETBOARD_EXERCISES: FretboardExercise[] = [
  {
    id: "bass-strings",
    title: "Low E and A notes",
    prompts: [
      fretPrompt("low-e-g", "low-e-notes", "G", "low E", 3),
      fretPrompt("low-e-a", "low-e-notes", "A", "low E", 5),
      fretPrompt("low-e-c", "low-e-notes", "C", "low E", 8),
      fretPrompt("a-c", "a-string-notes", "C", "A", 3),
      fretPrompt("a-d", "a-string-notes", "D", "A", 5),
      fretPrompt("a-e", "a-string-notes", "E", "A", 7),
    ],
  },
  {
    id: "middle-strings",
    title: "D and G notes",
    prompts: [
      fretPrompt("d-f", "d-string-notes", "F", "D", 3),
      fretPrompt("d-g", "d-string-notes", "G", "D", 5),
      fretPrompt("d-a", "d-string-notes", "A", "D", 7),
      fretPrompt("g-a", "g-string-notes", "A", "G", 2),
      fretPrompt("g-b", "g-string-notes", "B", "G", 4),
      fretPrompt("g-c", "g-string-notes", "C", "G", 5),
    ],
  },
  {
    id: "treble-strings",
    title: "B and high E notes",
    prompts: [
      fretPrompt("b-d", "b-string-notes", "D", "B", 3),
      fretPrompt("b-e", "b-string-notes", "E", "B", 5),
      fretPrompt("b-g", "b-string-notes", "G", "B", 8),
      fretPrompt("high-e-g", "high-e-notes", "G", "high E", 3),
      fretPrompt("high-e-a", "high-e-notes", "A", "high E", 5),
      fretPrompt("high-e-c", "high-e-notes", "C", "high E", 8),
    ],
  },
  {
    id: "octaves",
    title: "Octave shapes",
    prompts: [
      fretPrompt(
        "octave-low-e-g",
        "octaves",
        "G octave",
        "D",
        5,
        "Find the octave of G on the D string.",
      ),
      fretPrompt(
        "octave-low-e-a",
        "octaves",
        "A octave",
        "D",
        7,
        "Find the octave of A on the D string.",
      ),
      fretPrompt(
        "octave-a-c",
        "octaves",
        "C octave",
        "G",
        5,
        "Find the octave of C on the G string.",
      ),
      fretPrompt(
        "octave-a-d",
        "octaves",
        "D octave",
        "G",
        7,
        "Find the octave of D on the G string.",
      ),
    ],
  },
];

export const FRETBOARD_PROMPTS: FretboardPrompt[] = FRETBOARD_EXERCISES.flatMap(
  (exercise) => exercise.prompts,
);

export function choosePrompt<T>(prompts: readonly T[], random = Math.random): T {
  if (prompts.length === 0) {
    throw new Error("trainer prompts are required");
  }
  const index = Math.min(prompts.length - 1, Math.floor(random() * prompts.length));
  return prompts[index]!;
}

export function isEarAnswerCorrect(prompt: EarPrompt, answer: string): boolean {
  return prompt.answer === answer;
}

export function isFretboardAnswerCorrect(prompt: FretboardPrompt, fret: number): boolean {
  return prompt.fret === fret;
}

export function trainerProgressPatch(input: {
  correct: boolean;
  itemType: ProgressItemType;
  itemId: string;
  promptId: string;
  answer: string | number;
  expected: string | number;
}): TrainerProgressPatch {
  return {
    itemType: input.itemType,
    itemId: input.itemId,
    status: input.correct ? "in-progress" : "review",
    mastery: input.correct ? 70 : 30,
    attempts: 1,
    minutes: 1,
    bestScore: input.correct ? 100 : 0,
    lastScore: input.correct ? 100 : 0,
    metadata: {
      promptId: input.promptId,
      answer: input.answer,
      expected: input.expected,
    },
  };
}

function prompt(
  id: string,
  itemId: string,
  answer: EarAnswer,
  midiGroups: number[][],
  detail: string,
): EarPrompt {
  return { id, itemId, answer, midiGroups, detail };
}

function fretPrompt(
  id: string,
  itemId: string,
  note: string,
  string: string,
  fret: number,
  question = `Find ${note} on the ${string} string.`,
): FretboardPrompt {
  return { id, itemId, note, string, fret, question };
}
