import { getLesson } from "@/data/curriculum";
import { buildLessonSessionMetadata, buildLessonSessionSummary } from "./lesson-session";

describe("lesson sessions", () => {
  const lesson = getLesson("tuning-basics")!;

  it("builds backend metadata for completed lessons", () => {
    expect(buildLessonSessionMetadata({ lesson, minutes: lesson.estimatedMinutes })).toMatchObject({
      completionStatus: "completed",
      resultSummary: "Tuning basics completed",
      score: 10,
      practiceMode: "lesson_completion",
      lessonId: "tuning-basics",
      lessonTitle: "Tuning basics",
      lessonArea: "Foundations",
      lessonKind: "concept",
      estimatedMinutes: lesson.estimatedMinutes,
      minutes: lesson.estimatedMinutes,
      scoreSummary: {
        attempts: 1,
        averageScore: 10,
        bestScore: 10,
      },
    });
  });

  it("builds local history summaries for completed lessons", () => {
    expect(
      buildLessonSessionSummary({
        id: "session-1",
        lesson,
        startedAtIso: "2026-05-30T10:00:00.000Z",
        endedAtIso: "2026-05-30T10:05:00.000Z",
      }),
    ).toEqual({
      id: "session-1",
      startedAtIso: "2026-05-30T10:00:00.000Z",
      endedAtIso: "2026-05-30T10:05:00.000Z",
      drillType: "lesson",
      chords: [],
      targetBpm: null,
      averageScore: 10,
      events: 1,
      completionStatus: "completed",
      resultSummary: "Tuning basics completed",
    });
  });
});
