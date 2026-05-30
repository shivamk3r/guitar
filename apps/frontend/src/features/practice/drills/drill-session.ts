import type { ChordDef } from "@/data/chords";
import type { SessionSummary } from "@/storage/db";

interface AttemptScoreLike {
  score: { score: number };
}

export function buildPracticeDrillSessionSummary(input: {
  id: string;
  startedAtIso: string;
  endedAtIso: string;
  practiceMode: string;
  chords: readonly ChordDef[];
  bpm: number;
  attempts: readonly AttemptScoreLike[];
}): SessionSummary {
  const averageScore = averageAttemptScore(input.attempts);
  return {
    id: input.id,
    startedAtIso: input.startedAtIso,
    endedAtIso: input.endedAtIso,
    drillType: practiceModeToDrillType(input.practiceMode),
    chords: input.chords.map((chord) => chord.id),
    targetBpm: input.bpm,
    averageScore: averageScore ?? 0,
    events: input.attempts.length,
    completionStatus: input.attempts.length > 0 ? "completed" : "stopped",
    resultSummary:
      averageScore == null
        ? "No attempts scored"
        : `${averageScore.toFixed(1)}/10 average across ${input.attempts.length} attempts`,
  };
}

export function buildStrummingSessionSummary(input: {
  id: string;
  startedAtIso: string;
  endedAtIso: string;
  bpm: number;
  attempts: readonly AttemptScoreLike[];
}): SessionSummary {
  const averageScore = averageAttemptScore(input.attempts);
  return {
    id: input.id,
    startedAtIso: input.startedAtIso,
    endedAtIso: input.endedAtIso,
    drillType: "strumming",
    chords: [],
    targetBpm: input.bpm,
    averageScore: averageScore ?? 0,
    events: input.attempts.length,
    completionStatus: input.attempts.length > 0 ? "completed" : "stopped",
    resultSummary:
      averageScore == null
        ? "No strums scored"
        : `${averageScore.toFixed(1)}/10 average across ${input.attempts.length} strums`,
  };
}

export function averageAttemptScore(attempts: readonly AttemptScoreLike[]): number | null {
  if (attempts.length === 0) return null;
  return attempts.reduce((total, attempt) => total + attempt.score.score, 0) / attempts.length;
}

function practiceModeToDrillType(practiceMode: string): SessionSummary["drillType"] {
  if (practiceMode === "progression_drill") return "progression";
  return "chord-change";
}
