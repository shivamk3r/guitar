import type { ProgressItem, SessionSummary } from "@/storage/db";

export interface TunerSessionResult {
  tuningId: string;
  tuningName: string;
  tunedStringCount: number;
  totalStringCount: number;
  tunedStrings: string[];
  lastDetectedHz: number | null;
  lastDetectedNote: string | null;
}

export interface TunerSessionMetadata extends Record<string, unknown> {
  completionStatus: "completed" | "partial" | "stopped";
  resultSummary: string;
  tuningResult: TunerSessionResult;
}

export interface TunerProgressPatch {
  itemType: "skill";
  itemId: "setup-tuning";
  status: ProgressItem["status"];
  mastery: number;
  attempts: number;
  minutes: number;
  bestScore: number;
  lastScore: number;
  lastPracticedIso: string;
  metadata: Record<string, unknown>;
}

export function buildTunerSessionSummary(input: {
  id: string;
  startedAtIso: string;
  endedAtIso: string;
  tuningResult: TunerSessionResult;
}): SessionSummary {
  return {
    id: input.id,
    startedAtIso: input.startedAtIso,
    endedAtIso: input.endedAtIso,
    drillType: "tuner",
    chords: [],
    targetBpm: null,
    averageScore: tuningMasteryPercent(input.tuningResult) / 10,
    events: input.tuningResult.tunedStringCount,
  };
}

export function buildTunerProgressPatch(input: {
  sessionId: string;
  startedAtIso: string;
  endedAtIso: string;
  tuningResult: TunerSessionResult;
}): TunerProgressPatch {
  const mastery = tuningMasteryPercent(input.tuningResult);
  return {
    itemType: "skill",
    itemId: "setup-tuning",
    status: tuningProgressStatus(mastery),
    mastery,
    attempts: 1,
    minutes: sessionMinutes(input.startedAtIso, input.endedAtIso),
    bestScore: mastery,
    lastScore: mastery,
    lastPracticedIso: input.endedAtIso,
    metadata: {
      source: "local_tuner_session",
      sourceSessionId: input.sessionId,
      tuningId: input.tuningResult.tuningId,
      tuningName: input.tuningResult.tuningName,
      tunedStringCount: input.tuningResult.tunedStringCount,
      totalStringCount: input.tuningResult.totalStringCount,
      tunedStrings: input.tuningResult.tunedStrings,
      lastDetectedHz: input.tuningResult.lastDetectedHz,
      lastDetectedNote: input.tuningResult.lastDetectedNote,
    },
  };
}

export function tuningMasteryPercent(result: TunerSessionResult): number {
  if (result.totalStringCount <= 0) return 0;
  return clampPercent((result.tunedStringCount / result.totalStringCount) * 100);
}

export function tuningProgressStatus(mastery: number): ProgressItem["status"] {
  if (mastery >= 85) return "mastered";
  if (mastery >= 60) return "in-progress";
  return "review";
}

function sessionMinutes(startedAtIso: string, endedAtIso: string): number {
  const durationMs = Date.parse(endedAtIso) - Date.parse(startedAtIso);
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 0;
  return Math.max(0, Math.round(durationMs / 60_000));
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}
