import type { StringTuning, Tuning } from "@/data/tunings";
import { hzToMidiFloat, midiToHz } from "@/lib/math";

export const TRACE_HISTORY_SECONDS = 5;
export const TRACE_CENTS_LIMIT = 50;
export const TRACE_ACCEPTABLE_CENTS = 5;
export const TRACE_MAX_CONNECTED_GAP_SECONDS = 0.3;

const TRACE_GAP_EPSILON = 1e-6;
const TRACE_TARGET_LOCK_CENTS = 75;
const RELIABLE_CONFIDENCE = 0.9;
const RELIABLE_RMS = 0.004;
const STABILITY_RECENT_SECONDS = 1.5;

export interface PitchTraceSample {
  t: number;
  cents: number;
  confidence: number;
  rms: number;
  reliable: boolean;
}

export interface PitchTraceLineSegment {
  from: PitchTraceSample;
  to: PitchTraceSample;
  reliable: boolean;
}

interface MakePitchTraceSampleInput {
  hz: number;
  t: number;
  confidence: number;
  rms: number;
  target: StringTuning;
}

function firstString(tuning: Tuning): StringTuning {
  const first = tuning.strings[0];
  if (!first) throw new Error(`tuning ${tuning.id} has no strings`);
  return first;
}

export function getStringTargetHz(target: Pick<StringTuning, "midi">): number {
  return midiToHz(target.midi);
}

export function centsFromTargetHz(hz: number, targetHz: number): number {
  return 1200 * Math.log2(hz / targetHz);
}

export function getClosestStringTarget(tuning: Tuning, hz: number): StringTuning {
  const midi = hzToMidiFloat(hz);
  let closest = firstString(tuning);
  let closestDistance = Math.abs(closest.midi - midi);

  for (const stringTarget of tuning.strings) {
    const distance = Math.abs(stringTarget.midi - midi);
    if (distance < closestDistance) {
      closest = stringTarget;
      closestDistance = distance;
    }
  }

  return closest;
}

export function resolveTraceTarget(
  current: StringTuning | null,
  tuning: Tuning,
  hz: number,
): StringTuning {
  const closest = getClosestStringTarget(tuning, hz);
  if (!current) return closest;

  const currentStillExists = tuning.strings.some(
    (stringTarget) => stringTarget.midi === current.midi,
  );
  if (!currentStillExists) return closest;

  const currentDeviation = Math.abs(centsFromTargetHz(hz, getStringTargetHz(current)));
  return currentDeviation <= TRACE_TARGET_LOCK_CENTS ? current : closest;
}

export function isReliableTraceSample(confidence: number, rms: number): boolean {
  return confidence >= RELIABLE_CONFIDENCE && rms >= RELIABLE_RMS;
}

export function makePitchTraceSample({
  hz,
  t,
  confidence,
  rms,
  target,
}: MakePitchTraceSampleInput): PitchTraceSample {
  return {
    t,
    cents: centsFromTargetHz(hz, getStringTargetHz(target)),
    confidence,
    rms,
    reliable: isReliableTraceSample(confidence, rms),
  };
}

export function prunePitchTraceSamples(
  samples: PitchTraceSample[],
  nowSeconds: number,
): PitchTraceSample[] {
  const oldestVisibleTime = nowSeconds - TRACE_HISTORY_SECONDS;
  return samples.filter((sample) => sample.t >= oldestVisibleTime && sample.t <= nowSeconds);
}

export function appendRollingTraceSample(
  samples: PitchTraceSample[],
  sample: PitchTraceSample,
  nowSeconds = sample.t,
): PitchTraceSample[] {
  return prunePitchTraceSamples([...samples, sample], nowSeconds);
}

export function buildPitchTraceLineSegments(
  samples: PitchTraceSample[],
  nowSeconds: number,
): PitchTraceLineSegment[] {
  const visibleSamples = prunePitchTraceSamples(samples, nowSeconds);
  const segments: PitchTraceLineSegment[] = [];

  for (let i = 1; i < visibleSamples.length; i += 1) {
    const from = visibleSamples[i - 1]!;
    const to = visibleSamples[i]!;
    if (to.t - from.t > TRACE_MAX_CONNECTED_GAP_SECONDS + TRACE_GAP_EPSILON) continue;

    segments.push({
      from,
      to,
      reliable: from.reliable && to.reliable,
    });
  }

  return segments;
}

export function summarizePitchStability(samples: PitchTraceSample[], nowSeconds: number): string {
  const reliableSamples = prunePitchTraceSamples(samples, nowSeconds).filter(
    (sample) => sample.reliable,
  );
  const latest = reliableSamples.at(-1);

  if (!latest || nowSeconds - latest.t > TRACE_MAX_CONNECTED_GAP_SECONDS) {
    return "Waiting for pitch";
  }

  if (Math.abs(latest.cents) <= TRACE_ACCEPTABLE_CENTS) {
    let stableStart = latest.t;
    for (let i = reliableSamples.length - 2; i >= 0; i -= 1) {
      const sample = reliableSamples[i]!;
      const nextSample = reliableSamples[i + 1]!;
      if (nextSample.t - sample.t > TRACE_MAX_CONNECTED_GAP_SECONDS + TRACE_GAP_EPSILON) break;
      if (Math.abs(sample.cents) > TRACE_ACCEPTABLE_CENTS) break;
      stableStart = sample.t;
    }

    const stableForSeconds = nowSeconds - stableStart;
    if (stableForSeconds >= 0.5) {
      return `Stable for ${stableForSeconds.toFixed(1)}s`;
    }
  }

  const recentSamples = reliableSamples.filter(
    (sample) => sample.t >= nowSeconds - STABILITY_RECENT_SECONDS,
  );
  if (recentSamples.length < 2) return "Finding pitch";

  const averageCents =
    recentSamples.reduce((sum, sample) => sum + sample.cents, 0) / recentSamples.length;
  const minCents = Math.min(...recentSamples.map((sample) => sample.cents));
  const maxCents = Math.max(...recentSamples.map((sample) => sample.cents));

  if (maxCents - minCents >= 18) return "Drifting";
  if (averageCents > TRACE_ACCEPTABLE_CENTS) return "Mostly sharp";
  if (averageCents < -TRACE_ACCEPTABLE_CENTS) return "Mostly flat";
  return "Settling near target";
}
