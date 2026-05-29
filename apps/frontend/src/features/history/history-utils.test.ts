import type { RecordingAnalysisSummary, SessionHistoryItem } from "@/api/client";
import { describe, expect, it } from "vitest";
import {
  activityLabel,
  analysisResultText,
  backendScoreRows,
  formatDuration,
  getAttempts,
  getConfigRows,
  getScoreRows,
  timelineResult,
} from "./history-utils";

describe("history utilities", () => {
  it("labels activity subtypes from saved metadata", () => {
    expect(activityLabel("tuner", {})).toBe("Tuning");
    expect(activityLabel("chord_check", {})).toBe("Chord check");
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

function analysisSummary(patch: Partial<RecordingAnalysisSummary>): RecordingAnalysisSummary {
  return {
    status: "completed",
    result: "analyzed",
    guidance: null,
    score: null,
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
