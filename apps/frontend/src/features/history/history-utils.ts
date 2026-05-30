import type {
  ActivityType,
  PracticeScore,
  RecordingAnalysisSummary,
  SessionHistoryItem,
} from "@/api/client";
import type { SessionSummary } from "@/storage/db";

export interface HistoryRow {
  label: string;
  value: string;
}

export interface HistoryAttempt {
  id: string;
  label: string;
  score: string;
  detail: string;
}

export function localSessionToHistoryItem(
  session: SessionSummary,
  learnerId: string | null,
): SessionHistoryItem {
  const activityType = drillTypeToActivityType(session.drillType);
  const metadata = localSessionMetadata(session);
  return {
    id: session.id,
    learner_id: learnerId ?? "local-learner",
    activity_type: activityType,
    started_at: session.startedAtIso,
    ended_at: session.endedAtIso,
    client_metadata: metadata,
    duration_seconds: durationSeconds(session.startedAtIso, session.endedAtIso),
    completion_status: session.completionStatus ?? "completed",
    score: localSessionScore(session),
    result_summary: session.resultSummary ?? localSessionResultSummary(session),
    recording_available: false,
    recordings: [],
  };
}

export function mergeHistorySessions(
  localSessions: SessionHistoryItem[],
  backendSessions: SessionHistoryItem[],
): SessionHistoryItem[] {
  const byId = new Map<string, SessionHistoryItem>();
  for (const session of localSessions) byId.set(session.id, session);
  for (const session of backendSessions) byId.set(session.id, session);
  return Array.from(byId.values()).sort((a, b) => b.started_at.localeCompare(a.started_at));
}

export function isLocalOnlyHistorySession(session: SessionHistoryItem): boolean {
  return session.client_metadata.localOnly === true;
}

export function activityLabel(type: ActivityType, metadata: Record<string, unknown>): string {
  if (type === "tuner") return "Tuning";
  if (type === "chord_check") return "Chord check";
  if (type === "lesson") return "Lesson";
  if (type === "song_practice") return "Song practice";
  if (type === "ear_training") return "Ear training";
  if (type === "fretboard_trainer") return "Fretboard trainer";
  if (type === "technique_drill") return "Technique practice";
  const mode = stringValue(metadata.practiceMode);
  if (mode === "timed_chord_practice") return "Timed chord practice";
  if (mode === "chord_change_drill") return "Chord change drill";
  if (mode === "progression_drill") return "Progression drill";
  if (mode === "strumming_drill") return "Strumming drill";
  return "Practice";
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatDuration(seconds: number | null): string {
  if (seconds == null) return "In progress";
  if (seconds < 1) return "<1s";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes === 0) return `${remainingSeconds}s`;
  return `${minutes}m ${remainingSeconds.toString().padStart(2, "0")}s`;
}

export function completionLabel(status: string): string {
  if (status === "in_progress") return "In progress";
  return status
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function timelineResult(session: SessionHistoryItem): string {
  if (session.score != null) return `${session.score.toFixed(1)}/10`;
  const tuning = recordValue(session.client_metadata.tuningResult);
  const tuned = numberValue(tuning?.tunedStringCount);
  const total = numberValue(tuning?.totalStringCount);
  if (tuned != null && total != null) return `${tuned}/${total} tuned`;
  return session.result_summary ?? "No score yet";
}

export function analysisResultText(summary: RecordingAnalysisSummary): string {
  if (summary.status === "queued" || summary.status === "running")
    return "Backend analysis pending";
  if (summary.status === "failed") return "Backend analysis failed";
  if (summary.result === "tuning_analyzed") {
    const parts = [
      summary.tuner_note ? `heard ${summary.tuner_note}` : null,
      summary.tuner_in_tune_rate == null
        ? null
        : `${Math.round(summary.tuner_in_tune_rate * 100)}% centered`,
      summary.tuner_mean_abs_cents == null
        ? null
        : `${summary.tuner_mean_abs_cents.toFixed(1)} cents avg`,
    ].filter((part): part is string => Boolean(part));
    return parts.length > 0
      ? `Backend tuning analysis · ${parts.join(" · ")}`
      : "Backend tuning analysis complete";
  }
  if (summary.result === "analyzed") {
    if (summary.attempt_count == null) return "Backend practice analysis complete";
    const analyzed = summary.analyzed_attempt_count ?? summary.attempt_count;
    const accepted = summary.accepted_count ?? 0;
    const rejected = summary.rejected_count ?? 0;
    const uncertain = summary.uncertain_count ?? 0;
    if (summary.score) {
      return `Backend score ${Math.round(summary.score.value)}/100 · ${accepted} confirmed correct, ${rejected} wrong, ${uncertain} inconclusive`;
    }
    return `Backend analyzed ${analyzed}/${summary.attempt_count} attempts · ${accepted} accepted, ${rejected} rejected, ${uncertain} uncertain`;
  }
  if (summary.result === "accepted") {
    const chord = summary.target_chord_id ?? summary.predicted_chord_id;
    return chord ? `Accepted ${chord}` : "Accepted";
  }
  if (summary.result === "rejected") {
    const target = summary.target_chord_id ?? "target";
    const predicted = summary.predicted_chord_id ?? "another chord";
    return `Expected ${target}, heard ${predicted}`;
  }
  if (summary.result === "uncertain") return "Backend result inconclusive";
  if (summary.result === "skipped") return summary.guidance ?? "Backend analysis skipped";
  if (summary.result === "unavailable") return summary.guidance ?? "Backend analysis unavailable";
  return summary.guidance ?? "Backend analysis not available";
}

export function backendScoreRows(score: PracticeScore | null | undefined): HistoryRow[] {
  const rows: HistoryRow[] = [];
  addRow(rows, "Backend score", backendScoreLabel(score));
  addRow(rows, "Clarity", percentLabel(score?.clarity));
  addRow(rows, "Decisive accuracy", percentLabel(score?.decisive_accuracy));
  return rows;
}

export function backendScoreLabel(score: PracticeScore | null | undefined): string | undefined {
  if (!score) return undefined;
  return `${Math.round(score.value)}/100 · ${score.label}`;
}

export function getConfigRows(session: SessionHistoryItem): HistoryRow[] {
  const metadata = session.client_metadata;
  const tuning = recordValue(metadata.tuningResult);
  const rows: HistoryRow[] = [];

  addRow(rows, "Tuning", stringValue(tuning?.tuningName) ?? stringValue(metadata.tuningName));
  addRow(rows, "Chord", stringValue(metadata.chordName) ?? stringValue(metadata.chordId));
  addRow(rows, "Chords", joinedStrings(metadata.chordNames) ?? joinedStrings(metadata.chords));
  addRow(rows, "BPM", numberLabel(metadata.bpm));
  addRow(rows, "Beats per chord", numberLabel(metadata.beatsPerChord));
  addRow(rows, "Beats per change", numberLabel(metadata.beatsPerChange));
  addRow(rows, "Practice length", numberLabel(metadata.sessionLength));
  addRow(rows, "Count-in", countInLabel(metadata.countInBeats));
  addRow(rows, "Order", stringValue(metadata.order));
  addRow(rows, "Pattern", stringValue(metadata.patternName) ?? stringValue(metadata.patternId));
  addRow(rows, "Target", stringValue(metadata.targetTitle) ?? stringValue(metadata.targetId));
  addRow(rows, "Target area", stringValue(metadata.targetArea));
  addRow(rows, "Lesson", stringValue(metadata.lessonTitle) ?? stringValue(metadata.lessonId));
  addRow(rows, "Area", stringValue(metadata.lessonArea));
  addRow(rows, "Level", stringValue(metadata.lessonLevel));
  addRow(rows, "Estimated minutes", numberLabel(metadata.estimatedMinutes));
  addRow(rows, "Song", stringValue(metadata.songTitle) ?? stringValue(metadata.songId));
  addRow(rows, "Section", stringValue(metadata.sectionName) ?? stringValue(metadata.sectionId));
  addRow(rows, "Original BPM", numberLabel(metadata.originalBpm));
  addRow(rows, "Bars", numberLabel(metadata.bars));
  addRow(rows, "Trainer", stringValue(metadata.trainerTitle) ?? stringValue(metadata.trainerKind));
  addRow(rows, "Prompt", stringValue(metadata.promptId));
  addRow(rows, "Answer", answerLabel(metadata.answer));
  addRow(rows, "Expected", answerLabel(metadata.expected));
  addRow(rows, "Focus", stringValue(metadata.focus));
  addRow(rows, "Notes", stringValue(metadata.notes));
  addRow(rows, "Recording consent", consentLabel(metadata.recordingConsentGranted));

  return rows;
}

export function getScoreRows(session: SessionHistoryItem): HistoryRow[] {
  const metadata = session.client_metadata;
  const scoreSummary = recordValue(metadata.scoreSummary);
  const tuning = recordValue(metadata.tuningResult);
  const rows: HistoryRow[] = [];

  addRow(rows, "Result", session.result_summary ?? undefined);
  addRow(
    rows,
    "Average score",
    scoreLabel(numberValue(scoreSummary?.averageScore) ?? session.score),
  );
  addRow(rows, "Best score", scoreLabel(numberValue(scoreSummary?.bestScore)));
  addRow(rows, "Last score", scoreLabel(numberValue(scoreSummary?.lastScore)));
  addRow(rows, "Attempts", numberLabel(scoreSummary?.attempts));
  addRow(rows, "Misses", numberLabel(scoreSummary?.misses));
  addRow(rows, "Hit rate", percentLabel(scoreSummary?.hitRate));
  addRow(rows, "Timing consistency", millisecondsLabel(scoreSummary?.timingConsistencyMs));
  addRow(rows, "Recommendation", stringValue(scoreSummary?.recommendation));
  addRow(rows, "Tuned strings", tunedStringsLabel(tuning));
  addRow(rows, "Last detected", lastDetectedLabel(tuning));

  return rows;
}

export function getAttempts(session: SessionHistoryItem): HistoryAttempt[] {
  const attempts = arrayValue(session.client_metadata.attempts);
  return attempts.map((attempt, index) => {
    const record = recordValue(attempt) ?? {};
    const scoreRecord = recordValue(record.score);
    const score = numberValue(scoreRecord?.score) ?? numberValue(record.score);
    const expected =
      stringValue(record.expectedChordId) ??
      stringValue(record.chordId) ??
      stringValue(record.expectedStroke) ??
      "attempt";
    const detected = stringValue(record.detectedChordId);
    const status = stringValue(record.status);
    const timingDeltaMs = numberValue(record.timingDeltaMs);
    const parts = [
      detected ? `heard ${detected}` : null,
      status,
      timingDeltaMs == null ? null : `${Math.round(timingDeltaMs)} ms`,
    ].filter((part): part is string => !!part);
    return {
      id: stringValue(record.id) ?? `${session.id}-${index}`,
      label: expected,
      score: score == null ? "—" : `${score}/10`,
      detail: parts.join(" · "),
    };
  });
}

function addRow(rows: HistoryRow[], label: string, value: string | undefined): void {
  if (value == null || value === "") return;
  rows.push({ label, value });
}

function drillTypeToActivityType(drillType: SessionSummary["drillType"]): ActivityType {
  if (drillType === "tuner") return "tuner";
  if (drillType === "chord-check") return "chord_check";
  if (drillType === "lesson") return "lesson";
  if (drillType === "song-practice") return "song_practice";
  if (drillType === "ear-training") return "ear_training";
  if (drillType === "fretboard") return "fretboard_trainer";
  if (drillType === "technique") return "technique_drill";
  return "practice_drill";
}

function localSessionMetadata(session: SessionSummary): Record<string, unknown> {
  return {
    localOnly: true,
    practiceMode: localPracticeMode(session.drillType),
    ...(session.completionStatus ? { completionStatus: session.completionStatus } : {}),
    ...(session.resultSummary ? { resultSummary: session.resultSummary } : {}),
    chords: session.chords,
    bpm: session.targetBpm,
    scoreSummary: {
      attempts: session.events,
      averageScore: session.averageScore,
      bestScore: session.averageScore,
    },
  };
}

function localPracticeMode(drillType: SessionSummary["drillType"]): string | undefined {
  if (drillType === "timed-chord") return "timed_chord_practice";
  if (drillType === "chord-change") return "chord_change_drill";
  if (drillType === "progression") return "progression_drill";
  if (drillType === "strumming") return "strumming_drill";
  if (drillType === "song-practice") return "song_section_loop";
  if (drillType === "lesson") return "lesson_completion";
  if (drillType === "ear-training") return "ear_training";
  if (drillType === "fretboard") return "fretboard_trainer";
  if (drillType === "technique") return "technique_practice";
  return undefined;
}

function localSessionScore(session: SessionSummary): number | null {
  if (session.completionStatus === "stopped") return null;
  return session.drillType === "tuner" ? null : session.averageScore;
}

function localSessionResultSummary(session: SessionSummary): string {
  if (session.resultSummary) return session.resultSummary;
  if (session.drillType === "tuner") return "Local tuning session";
  return `${activityLabel(drillTypeToActivityType(session.drillType), localSessionMetadata(session))}: ${session.averageScore.toFixed(1)}/10`;
}

function durationSeconds(startedAtIso: string, endedAtIso: string): number {
  const duration = Math.round((Date.parse(endedAtIso) - Date.parse(startedAtIso)) / 1000);
  return Number.isFinite(duration) ? Math.max(0, duration) : 0;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function numberLabel(value: unknown): string | undefined {
  const number = numberValue(value);
  return number == null ? undefined : String(number);
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function joinedStrings(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter(
    (item): item is string => typeof item === "string" && item.length > 0,
  );
  return strings.length > 0 ? strings.join(", ") : undefined;
}

function countInLabel(value: unknown): string | undefined {
  const count = numberValue(value);
  if (count == null) return undefined;
  return count === 0 ? "Off" : `${count} beats`;
}

function consentLabel(value: unknown): string | undefined {
  if (typeof value !== "boolean") return undefined;
  return value ? "On" : "Off";
}

function answerLabel(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function scoreLabel(value: number | undefined | null): string | undefined {
  return value == null ? undefined : `${value.toFixed(1)}/10`;
}

function percentLabel(value: unknown): string | undefined {
  const number = numberValue(value);
  return number == null ? undefined : `${Math.round(number * 100)}%`;
}

function millisecondsLabel(value: unknown): string | undefined {
  const number = numberValue(value);
  return number == null ? undefined : `${Math.round(number)} ms`;
}

function tunedStringsLabel(tuning: Record<string, unknown> | undefined): string | undefined {
  const tuned = numberValue(tuning?.tunedStringCount);
  const total = numberValue(tuning?.totalStringCount);
  if (tuned == null || total == null) return undefined;
  return `${tuned}/${total}`;
}

function lastDetectedLabel(tuning: Record<string, unknown> | undefined): string | undefined {
  const note = stringValue(tuning?.lastDetectedNote);
  const hz = numberValue(tuning?.lastDetectedHz);
  if (!note && hz == null) return undefined;
  if (!note) return `${hz?.toFixed(2)} Hz`;
  if (hz == null) return note;
  return `${note} · ${hz.toFixed(2)} Hz`;
}
