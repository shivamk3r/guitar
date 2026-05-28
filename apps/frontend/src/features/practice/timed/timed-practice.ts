import type { ScoredEvent, StringClass } from "../scoring";

export type TimedPracticeOrder = "forward" | "reverse" | "shuffle";
export type TimedPracticeAttemptStatus = "hit" | "miss";

export interface TimedPracticePlanItem {
  id: string;
  index: number;
  chordId: string;
  beat: number;
  previousChordId: string | null;
}

export interface TimedPracticeAttempt {
  id: string;
  expectedId: string;
  expectedIndex: number;
  chordId: string;
  previousChordId: string | null;
  expectedBeat: number;
  detectedChordId: string | null;
  detectedAtBeat: number | null;
  timingDeltaMs: number | null;
  status: TimedPracticeAttemptStatus;
  score: ScoredEvent;
  stringStates: StringClass[];
}

export interface TimedPracticeStrumMarker {
  id: string;
  beat: number;
  status: "hit" | "extra";
  expectedIndex: number | null;
  timingDeltaMs: number | null;
}

export interface TimedPracticeWeakTransition {
  fromChordId: string;
  toChordId: string;
  averageScore: number;
  attempts: number;
}

export interface TimedPracticeSummary {
  attempts: number;
  misses: number;
  hitRate: number;
  averageScore: number;
  rollingScore: number;
  bestChordId: string | null;
  bestChordScore: number | null;
  weakestTransition: TimedPracticeWeakTransition | null;
  timingConsistencyMs: number | null;
  recommendation: string;
}

export function buildTimedPracticePlan(input: {
  chordIds: readonly string[];
  beatsPerChord: number;
  order: TimedPracticeOrder;
  sessionLength: number;
  random?: () => number;
}): TimedPracticePlanItem[] {
  const chordIds = orderChordIds(input.chordIds, input.order, input.random);
  if (chordIds.length === 0) return [];
  const beatsPerChord = Math.max(1, Math.floor(input.beatsPerChord));
  const sessionLength = Math.max(1, Math.floor(input.sessionLength));
  const plan: TimedPracticePlanItem[] = [];
  for (let index = 0; index < sessionLength; index++) {
    const chordId = chordIds[index % chordIds.length]!;
    const previousChordId = index > 0 ? (plan[index - 1]?.chordId ?? null) : null;
    plan.push({
      id: `expected-${index}-${chordId}`,
      index,
      chordId,
      beat: index * beatsPerChord,
      previousChordId,
    });
  }
  return plan;
}

export function orderChordIds(
  chordIds: readonly string[],
  order: TimedPracticeOrder,
  random: () => number = Math.random,
): string[] {
  if (order === "reverse") return [...chordIds].reverse();
  if (order !== "shuffle") return [...chordIds];
  const shuffled = [...chordIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const tmp = shuffled[i]!;
    shuffled[i] = shuffled[j]!;
    shuffled[j] = tmp;
  }
  return shuffled;
}

export function summarizeTimedPractice(
  attempts: readonly TimedPracticeAttempt[],
): TimedPracticeSummary {
  if (attempts.length === 0) {
    return {
      attempts: 0,
      misses: 0,
      hitRate: 0,
      averageScore: 0,
      rollingScore: 0,
      bestChordId: null,
      bestChordScore: null,
      weakestTransition: null,
      timingConsistencyMs: null,
      recommendation: "slow down",
    };
  }

  const misses = attempts.filter((attempt) => attempt.status === "miss").length;
  const averageScore = average(attempts.map((attempt) => attempt.score.score));
  const rollingScore = average(attempts.slice(-8).map((attempt) => attempt.score.score));
  const bestChord = bestChordByScore(attempts);
  const weakestTransition = weakestTransitionByScore(attempts);
  const timingConsistencyMs = timingStdDevMs(attempts);
  const hitRate = (attempts.length - misses) / attempts.length;

  return {
    attempts: attempts.length,
    misses,
    hitRate,
    averageScore,
    rollingScore,
    bestChordId: bestChord?.chordId ?? null,
    bestChordScore: bestChord?.averageScore ?? null,
    weakestTransition,
    timingConsistencyMs,
    recommendation: recommendNextStep({
      averageScore,
      rollingScore,
      hitRate,
      timingConsistencyMs,
      weakestTransition,
    }),
  };
}

function bestChordByScore(attempts: readonly TimedPracticeAttempt[]) {
  const byChord = new Map<string, { total: number; attempts: number }>();
  for (const attempt of attempts) {
    const bucket = byChord.get(attempt.chordId) ?? { total: 0, attempts: 0 };
    bucket.total += attempt.score.score;
    bucket.attempts++;
    byChord.set(attempt.chordId, bucket);
  }
  let best: { chordId: string; averageScore: number } | null = null;
  for (const [chordId, bucket] of byChord) {
    const averageScore = bucket.total / bucket.attempts;
    if (!best || averageScore > best.averageScore) best = { chordId, averageScore };
  }
  return best;
}

function weakestTransitionByScore(
  attempts: readonly TimedPracticeAttempt[],
): TimedPracticeWeakTransition | null {
  const byTransition = new Map<string, TimedPracticeWeakTransition & { total: number }>();
  for (const attempt of attempts) {
    if (!attempt.previousChordId || attempt.previousChordId === attempt.chordId) continue;
    const key = `${attempt.previousChordId}->${attempt.chordId}`;
    const bucket =
      byTransition.get(key) ??
      ({
        fromChordId: attempt.previousChordId,
        toChordId: attempt.chordId,
        averageScore: 0,
        attempts: 0,
        total: 0,
      } satisfies TimedPracticeWeakTransition & { total: number });
    bucket.total += attempt.score.score;
    bucket.attempts++;
    bucket.averageScore = bucket.total / bucket.attempts;
    byTransition.set(key, bucket);
  }
  let weakest: TimedPracticeWeakTransition | null = null;
  for (const bucket of byTransition.values()) {
    if (!weakest || bucket.averageScore < weakest.averageScore) {
      weakest = {
        fromChordId: bucket.fromChordId,
        toChordId: bucket.toChordId,
        averageScore: bucket.averageScore,
        attempts: bucket.attempts,
      };
    }
  }
  return weakest;
}

function timingStdDevMs(attempts: readonly TimedPracticeAttempt[]): number | null {
  const deltas = attempts
    .map((attempt) => attempt.timingDeltaMs)
    .filter((delta): delta is number => delta != null);
  if (deltas.length < 2) return null;
  const mean = average(deltas);
  const variance = average(deltas.map((delta) => (delta - mean) ** 2));
  return Math.sqrt(variance);
}

function recommendNextStep(input: {
  averageScore: number;
  rollingScore: number;
  hitRate: number;
  timingConsistencyMs: number | null;
  weakestTransition: TimedPracticeWeakTransition | null;
}): string {
  if (input.rollingScore >= 8 && input.hitRate >= 0.9 && (input.timingConsistencyMs ?? 0) <= 80) {
    return "increase tempo";
  }
  if (input.weakestTransition && input.weakestTransition.averageScore < 7) {
    return `repeat ${input.weakestTransition.fromChordId} to ${input.weakestTransition.toChordId}`;
  }
  if (input.hitRate < 0.75 || input.averageScore < 6 || (input.timingConsistencyMs ?? 0) > 120) {
    return "slow down";
  }
  return input.weakestTransition
    ? `repeat ${input.weakestTransition.fromChordId} to ${input.weakestTransition.toChordId}`
    : "increase tempo";
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
