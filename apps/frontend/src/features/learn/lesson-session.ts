import type { Lesson } from "@/data/curriculum";
import type { SessionSummary } from "@/storage/db";

export function buildLessonSessionMetadata(input: {
  lesson: Lesson;
  minutes: number;
}): Record<string, unknown> {
  return {
    completionStatus: "completed",
    resultSummary: `${input.lesson.title} completed`,
    score: 10,
    scoreSummary: {
      attempts: 1,
      averageScore: 10,
      bestScore: 10,
    },
    practiceMode: "lesson_completion",
    lessonId: input.lesson.id,
    lessonTitle: input.lesson.title,
    lessonArea: input.lesson.area,
    lessonKind: input.lesson.kind,
    lessonLevel: input.lesson.level,
    estimatedMinutes: input.lesson.estimatedMinutes,
    minutes: input.minutes,
    outcomes: input.lesson.outcomes,
  };
}

export function buildLessonSessionSummary(input: {
  id: string;
  lesson: Lesson;
  startedAtIso: string;
  endedAtIso: string;
}): SessionSummary {
  return {
    id: input.id,
    startedAtIso: input.startedAtIso,
    endedAtIso: input.endedAtIso,
    drillType: "lesson",
    chords: [],
    targetBpm: null,
    averageScore: 10,
    events: 1,
    completionStatus: "completed",
    resultSummary: `${input.lesson.title} completed`,
  };
}

export function fallbackLessonStartIso(minutes: number): string {
  return new Date(Date.now() - Math.max(1, minutes) * 60_000).toISOString();
}
