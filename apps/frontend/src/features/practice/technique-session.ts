import type { TechniquePracticeTarget } from "@/data/technique-practice";
import type { ProgressItem, SessionSummary } from "@/storage/db";

export interface TechniqueProgressPatch {
  itemType: TechniquePracticeTarget["itemType"];
  itemId: string;
  status: ProgressItem["status"];
  mastery: number;
  attempts: number;
  minutes: number;
  bestScore: number;
  lastScore: number;
  bpmCeiling: number | null;
  metadata: Record<string, unknown>;
}

export function buildTechniquePracticeMetadata(input: {
  bpm: number | null;
  minutes: number;
  notes: string;
  rating: number;
  target: TechniquePracticeTarget;
}): Record<string, unknown> {
  const mastery = ratingToMastery(input.rating);
  return {
    completionStatus: "completed",
    resultSummary: `${input.target.title}: ${input.rating}/10`,
    score: input.rating,
    scoreSummary: {
      attempts: 1,
      averageScore: input.rating,
      bestScore: input.rating,
    },
    practiceMode: "technique_practice",
    targetId: input.target.id,
    targetTitle: input.target.title,
    targetArea: input.target.area,
    itemType: input.target.itemType,
    itemId: input.target.itemId,
    skillId: input.target.skillId,
    lessonId: input.target.lessonId,
    focus: input.target.focus,
    checkpoints: input.target.checkpoints,
    bpm: input.bpm,
    minutes: input.minutes,
    rating: input.rating,
    mastery,
    progressStatus: techniqueStatus(input.rating),
    notes: input.notes.trim() || null,
  };
}

export function buildTechniqueProgressPatch(input: {
  bpm: number | null;
  minutes: number;
  notes: string;
  rating: number;
  target: TechniquePracticeTarget;
}): TechniqueProgressPatch {
  const mastery = ratingToMastery(input.rating);
  return {
    itemType: input.target.itemType,
    itemId: input.target.itemId,
    status: techniqueStatus(input.rating),
    mastery,
    attempts: 1,
    minutes: input.minutes,
    bestScore: mastery,
    lastScore: mastery,
    bpmCeiling: input.bpm != null && input.rating >= 8 ? input.bpm : null,
    metadata: {
      targetId: input.target.id,
      targetTitle: input.target.title,
      targetArea: input.target.area,
      skillId: input.target.skillId,
      lessonId: input.target.lessonId,
      rating: input.rating,
      notes: input.notes.trim() || null,
    },
  };
}

export function buildTechniqueSessionSummary(input: {
  bpm: number | null;
  endedAtIso: string;
  id: string;
  rating: number;
  startedAtIso: string;
  target: TechniquePracticeTarget;
}): SessionSummary {
  return {
    id: input.id,
    startedAtIso: input.startedAtIso,
    endedAtIso: input.endedAtIso,
    drillType: "technique",
    chords: [],
    targetBpm: input.bpm,
    averageScore: input.rating,
    events: 1,
    completionStatus: "completed",
    resultSummary: `${input.target.title}: ${input.rating}/10`,
  };
}

export function fallbackTechniqueStartIso(minutes: number): string {
  return new Date(Date.now() - Math.max(1, minutes) * 60_000).toISOString();
}

export function ratingToMastery(rating: number): number {
  return Math.max(0, Math.min(100, rating * 10));
}

function techniqueStatus(rating: number): ProgressItem["status"] {
  if (rating >= 8.5) return "mastered";
  if (rating >= 6) return "in-progress";
  return "review";
}
