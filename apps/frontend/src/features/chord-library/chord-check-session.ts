import type { SessionSummary } from "@/storage/db";

interface ChordReference {
  id: string;
}

interface ChordCheckAttemptScoreLike {
  score: { score: number };
}

export function buildChordCheckSessionSummary(input: {
  id: string;
  startedAtIso: string;
  endedAtIso: string;
  chord: ChordReference;
  attempts: readonly ChordCheckAttemptScoreLike[];
}): SessionSummary {
  const averageScore = averageChordCheckScore(input.attempts);
  return {
    id: input.id,
    startedAtIso: input.startedAtIso,
    endedAtIso: input.endedAtIso,
    drillType: "chord-check",
    chords: [input.chord.id],
    targetBpm: null,
    averageScore: averageScore ?? 0,
    events: input.attempts.length,
    completionStatus: input.attempts.length > 0 ? "completed" : "stopped",
    resultSummary:
      averageScore == null
        ? "No attempts scored"
        : `${averageScore.toFixed(1)}/10 average across ${input.attempts.length} attempts`,
  };
}

export function averageChordCheckScore(
  attempts: readonly ChordCheckAttemptScoreLike[],
): number | null {
  if (attempts.length === 0) return null;
  return attempts.reduce((total, attempt) => total + attempt.score.score, 0) / attempts.length;
}
