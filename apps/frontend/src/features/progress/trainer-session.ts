import type { ActivityType } from "@/api/client";
import type { SessionSummary } from "@/storage/db";
import type { TrainerProgressPatch } from "./trainers";

export type TrainerSessionKind = "ear-training" | "fretboard";

export function trainerActivityType(kind: TrainerSessionKind): ActivityType {
  return kind === "ear-training" ? "ear_training" : "fretboard_trainer";
}

export function buildTrainerSessionMetadata(input: {
  correct: boolean;
  details?: Record<string, unknown>;
  kind: TrainerSessionKind;
  patch: TrainerProgressPatch;
  title: string;
}): Record<string, unknown> {
  const score = input.correct ? 10 : 0;
  return {
    completionStatus: "completed",
    resultSummary: `${input.title}: ${input.correct ? "correct" : "review"}`,
    score,
    scoreSummary: {
      attempts: 1,
      averageScore: score,
      bestScore: score,
    },
    practiceMode: input.kind === "ear-training" ? "ear_training" : "fretboard_trainer",
    trainerKind: input.kind,
    trainerTitle: input.title,
    itemType: input.patch.itemType,
    itemId: input.patch.itemId,
    progressStatus: input.patch.status,
    mastery: input.patch.mastery,
    correct: input.correct,
    promptId: input.patch.metadata.promptId,
    answer: input.patch.metadata.answer,
    expected: input.patch.metadata.expected,
    ...input.details,
  };
}

export function buildTrainerSessionSummary(input: {
  correct: boolean;
  endedAtIso: string;
  id: string;
  kind: TrainerSessionKind;
  startedAtIso: string;
  title: string;
}): SessionSummary {
  return {
    id: input.id,
    startedAtIso: input.startedAtIso,
    endedAtIso: input.endedAtIso,
    drillType: input.kind,
    chords: [],
    targetBpm: null,
    averageScore: input.correct ? 10 : 0,
    events: 1,
    completionStatus: "completed",
    resultSummary: `${input.title}: ${input.correct ? "correct" : "review"}`,
  };
}

export function fallbackTrainerStartIso(): string {
  return new Date(Date.now() - 60_000).toISOString();
}
