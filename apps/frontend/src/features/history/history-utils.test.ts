import type { RecordingAnalysisSummary, SessionHistoryItem } from "@/api/client";
import type { SessionSummary } from "@/storage/db";
import { describe, expect, it } from "vitest";
import {
  activityLabel,
  analysisResultText,
  backendScoreRows,
  formatDuration,
  getAttempts,
  getConfigRows,
  getScoreRows,
  localSessionToHistoryItem,
  mergeHistorySessions,
  timelineResult,
} from "./history-utils";

describe("history utilities", () => {
  it("labels activity subtypes from saved metadata", () => {
    expect(activityLabel("tuner", {})).toBe("Tuning");
    expect(activityLabel("chord_check", {})).toBe("Chord check");
    expect(activityLabel("lesson", {})).toBe("Lesson");
    expect(activityLabel("song_practice", {})).toBe("Song practice");
    expect(activityLabel("ear_training", {})).toBe("Ear training");
    expect(activityLabel("fretboard_trainer", {})).toBe("Fretboard trainer");
    expect(activityLabel("technique_drill", {})).toBe("Technique practice");
    expect(activityLabel("practice_drill", { practiceMode: "timed_chord_practice" })).toBe(
      "Timed chord practice",
    );
    expect(activityLabel("practice_drill", { practiceMode: "strumming_drill" })).toBe(
      "Strumming drill",
    );
  });

  it("formats timeline duration and result summaries", () => {
    expect(formatDuration(null)).toBe("In progress");
    expect(formatDuration(0)).toBe("<1s");
    expect(formatDuration(65)).toBe("1m 05s");

    expect(timelineResult(historyItem({ score: 8.25 }))).toBe("8.3/10");
    expect(
      timelineResult(
        historyItem({
          client_metadata: {
            tuningResult: { tunedStringCount: 5, totalStringCount: 6 },
          },
          result_summary: "5/6 strings in tune",
        }),
      ),
    ).toBe("5/6 tuned");
  });

  it("extracts detail rows and attempts from saved metadata", () => {
    const item = historyItem({
      client_metadata: {
        practiceMode: "timed_chord_practice",
        chordNames: ["A", "D"],
        bpm: 72,
        beatsPerChord: 4,
        sessionLength: 12,
        targetTitle: "A minor pentatonic box",
        targetArea: "Lead",
        lessonTitle: "Tuning basics",
        lessonArea: "Foundations",
        songTitle: "Open Road Study",
        sectionName: "Verse",
        bars: 8,
        trainerTitle: "Major/minor quality",
        promptId: "c-major",
        answer: "major",
        expected: "minor",
        focus: "Alternate picking",
        notes: "Even on string pairs.",
        scoreSummary: {
          averageScore: 7.5,
          bestScore: 9,
          attempts: 2,
          hitRate: 0.5,
        },
        attempts: [
          {
            id: "one",
            chordId: "A",
            detectedChordId: "A",
            timingDeltaMs: -24,
            status: "hit",
            score: { score: 9 },
          },
        ],
      },
    });

    expect(getConfigRows(item)).toEqual(
      expect.arrayContaining([
        { label: "Chords", value: "A, D" },
        { label: "BPM", value: "72" },
        { label: "Beats per chord", value: "4" },
        { label: "Target", value: "A minor pentatonic box" },
        { label: "Target area", value: "Lead" },
        { label: "Lesson", value: "Tuning basics" },
        { label: "Area", value: "Foundations" },
        { label: "Song", value: "Open Road Study" },
        { label: "Section", value: "Verse" },
        { label: "Bars", value: "8" },
        { label: "Trainer", value: "Major/minor quality" },
        { label: "Prompt", value: "c-major" },
        { label: "Answer", value: "major" },
        { label: "Expected", value: "minor" },
        { label: "Focus", value: "Alternate picking" },
        { label: "Notes", value: "Even on string pairs." },
      ]),
    );
    expect(getScoreRows(item)).toEqual(
      expect.arrayContaining([
        { label: "Average score", value: "7.5/10" },
        { label: "Hit rate", value: "50%" },
      ]),
    );
    expect(getAttempts(item)).toEqual([
      { id: "one", label: "A", score: "9/10", detail: "heard A · hit · -24 ms" },
    ]);
  });

  it("formats backend practice scores and falls back to count summaries", () => {
    const score = {
      value: 50,
      label: "Building",
      analysis_coverage: 1,
      clarity: 0.625,
      decisive_accuracy: 0.8,
      accepted_rate: 0.5,
      rejected_rate: 0.125,
      uncertain_rate: 0.375,
    };

    expect(
      analysisResultText(
        analysisSummary({
          score,
        }),
      ),
    ).toBe("Backend score 50/100 · 48 confirmed correct, 12 wrong, 36 inconclusive");
    expect(backendScoreRows(score)).toEqual([
      { label: "Backend score", value: "50/100 · Building" },
      { label: "Clarity", value: "63%" },
      { label: "Decisive accuracy", value: "80%" },
    ]);

    expect(analysisResultText(analysisSummary({ score: null }))).toBe(
      "Backend analyzed 96/96 attempts · 48 accepted, 12 rejected, 36 uncertain",
    );
  });

  it("formats backend tuner analysis summaries", () => {
    expect(
      analysisResultText(
        analysisSummary({
          result: "tuning_analyzed",
          attempt_count: null,
          analyzed_attempt_count: null,
          accepted_count: null,
          rejected_count: null,
          uncertain_count: null,
          tuner_note: "A2",
          tuner_in_tune_rate: 0.84,
          tuner_mean_abs_cents: 2.4,
        }),
      ),
    ).toBe("Backend tuning analysis · heard A2 · 84% centered · 2.4 cents avg");
  });

  it("maps local IndexedDB sessions into history rows and lets backend rows win by id", () => {
    const local = localSessionToHistoryItem(
      localSession({
        id: "session-1",
        drillType: "technique",
        averageScore: 8.5,
        targetBpm: 72,
      }),
      null,
    );
    const backend = historyItem({
      id: "session-1",
      activity_type: "technique_drill",
      client_metadata: { targetTitle: "A minor pentatonic box" },
      score: 9,
      result_summary: "Backend row",
    });

    expect(local).toMatchObject({
      learner_id: "local-learner",
      activity_type: "technique_drill",
      score: 8.5,
      recording_available: false,
    });
    expect(local.client_metadata).toMatchObject({
      localOnly: true,
      practiceMode: "technique_practice",
      bpm: 72,
    });

    expect(mergeHistorySessions([local], [backend])).toEqual([backend]);
  });

  it("maps stopped local sessions without inventing a score", () => {
    const local = localSessionToHistoryItem(
      localSession({
        drillType: "song-practice",
        averageScore: 0,
        completionStatus: "stopped",
        resultSummary: "Verse stopped at 68 BPM",
      }),
      "learner-1",
    );

    expect(local).toMatchObject({
      activity_type: "song_practice",
      completion_status: "stopped",
      score: null,
      result_summary: "Verse stopped at 68 BPM",
    });
    expect(local.client_metadata).toMatchObject({
      completionStatus: "stopped",
      resultSummary: "Verse stopped at 68 BPM",
    });
  });
});

function historyItem(patch: Partial<SessionHistoryItem>): SessionHistoryItem {
  return {
    id: "session-1",
    learner_id: "learner-1",
    activity_type: "practice_drill",
    started_at: "2026-05-28T12:00:00.000Z",
    ended_at: "2026-05-28T12:01:00.000Z",
    client_metadata: {},
    duration_seconds: 60,
    completion_status: "completed",
    score: null,
    result_summary: null,
    recording_available: false,
    recordings: [],
    ...patch,
  };
}

function localSession(patch: Partial<SessionSummary>): SessionSummary {
  return {
    id: "local-session",
    startedAtIso: "2026-05-28T12:00:00.000Z",
    endedAtIso: "2026-05-28T12:08:00.000Z",
    drillType: "timed-chord",
    chords: ["G", "C"],
    targetBpm: 70,
    averageScore: 7.5,
    events: 8,
    ...patch,
  };
}

function analysisSummary(patch: Partial<RecordingAnalysisSummary>): RecordingAnalysisSummary {
  return {
    status: "completed",
    result: "analyzed",
    guidance: null,
    score: null,
    tuner_note: null,
    tuner_in_tune_rate: null,
    tuner_mean_abs_cents: null,
    target_chord_id: null,
    predicted_chord_id: null,
    confidence: null,
    attempt_count: 96,
    analyzed_attempt_count: 96,
    accepted_count: 48,
    rejected_count: 12,
    uncertain_count: 36,
    completed_at: null,
    ...patch,
  };
}
