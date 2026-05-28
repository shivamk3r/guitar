import { describe, expect, it } from "vitest";
import type { ScoredEvent } from "../scoring";
import {
  type TimedPracticeAttempt,
  buildTimedPracticePlan,
  orderChordIds,
  summarizeTimedPractice,
} from "./timed-practice";

function scored(score: number): ScoredEvent {
  return {
    score,
    correctness: score,
    cleanliness: score,
    timing: score,
    weakComponent: "timing",
    cue: score >= 8 ? "nice" : "late",
  };
}

function attempt(input: {
  index: number;
  chordId: string;
  previousChordId: string | null;
  score: number;
  status?: "hit" | "miss";
  timingDeltaMs?: number | null;
}): TimedPracticeAttempt {
  return {
    id: `attempt-${input.index}`,
    expectedId: `expected-${input.index}`,
    expectedIndex: input.index,
    chordId: input.chordId,
    previousChordId: input.previousChordId,
    expectedBeat: input.index * 2,
    detectedChordId: input.status === "miss" ? null : input.chordId,
    detectedAtBeat: input.status === "miss" ? null : input.index * 2,
    timingDeltaMs: input.timingDeltaMs ?? (input.status === "miss" ? null : 0),
    status: input.status ?? "hit",
    score: scored(input.score),
    stringStates: ["clean", "clean", "clean", "clean", "clean", "clean"],
  };
}

describe("buildTimedPracticePlan", () => {
  it("places chord prompts on beats per chord in forward order", () => {
    const plan = buildTimedPracticePlan({
      chordIds: ["A", "D"],
      beatsPerChord: 2,
      order: "forward",
      sessionLength: 5,
    });
    expect(plan.map((item) => item.chordId)).toEqual(["A", "D", "A", "D", "A"]);
    expect(plan.map((item) => item.beat)).toEqual([0, 2, 4, 6, 8]);
    expect(plan.map((item) => item.previousChordId)).toEqual([null, "A", "D", "A", "D"]);
  });

  it("supports reverse rotation", () => {
    const plan = buildTimedPracticePlan({
      chordIds: ["A", "D", "G"],
      beatsPerChord: 4,
      order: "reverse",
      sessionLength: 4,
    });
    expect(plan.map((item) => item.chordId)).toEqual(["G", "D", "A", "G"]);
  });

  it("uses the supplied random source for shuffle order", () => {
    const values = [0.9, 0.1];
    const shuffled = orderChordIds(["A", "D", "G"], "shuffle", () => values.shift() ?? 0);
    expect(shuffled).toEqual(["D", "A", "G"]);
  });
});

describe("summarizeTimedPractice", () => {
  it("finds best chord, weakest transition, timing spread, and a transition repeat", () => {
    const summary = summarizeTimedPractice([
      attempt({ index: 0, chordId: "A", previousChordId: null, score: 9, timingDeltaMs: 10 }),
      attempt({ index: 1, chordId: "D", previousChordId: "A", score: 4, timingDeltaMs: 150 }),
      attempt({ index: 2, chordId: "A", previousChordId: "D", score: 8, timingDeltaMs: -20 }),
      attempt({
        index: 3,
        chordId: "D",
        previousChordId: "A",
        score: 3,
        status: "miss",
      }),
    ]);

    expect(summary.bestChordId).toBe("A");
    expect(summary.weakestTransition).toMatchObject({
      fromChordId: "A",
      toChordId: "D",
      attempts: 2,
    });
    expect(summary.timingConsistencyMs).toBeGreaterThan(60);
    expect(summary.recommendation).toBe("repeat A to D");
  });

  it("recommends increasing tempo when recent attempts are strong and consistent", () => {
    const summary = summarizeTimedPractice(
      Array.from({ length: 8 }, (_, index) =>
        attempt({
          index,
          chordId: index % 2 === 0 ? "A" : "D",
          previousChordId: index === 0 ? null : index % 2 === 0 ? "D" : "A",
          score: 9,
          timingDeltaMs: index % 2 === 0 ? 12 : -12,
        }),
      ),
    );
    expect(summary.recommendation).toBe("increase tempo");
    expect(summary.rollingScore).toBe(9);
  });

  it("recommends slowing down when misses dominate a one-chord session", () => {
    const summary = summarizeTimedPractice([
      attempt({ index: 0, chordId: "A", previousChordId: null, score: 1, status: "miss" }),
      attempt({ index: 1, chordId: "A", previousChordId: "A", score: 1, status: "miss" }),
      attempt({ index: 2, chordId: "A", previousChordId: "A", score: 1, status: "miss" }),
    ]);
    expect(summary.hitRate).toBe(0);
    expect(summary.recommendation).toBe("slow down");
  });
});
