import { getTuning } from "@/data/tunings";
import { describe, expect, it } from "vitest";
import {
  type PitchTraceSample,
  appendRollingTraceSample,
  buildPitchTraceLineSegments,
  centsFromTargetHz,
  getClosestStringTarget,
  getStringTargetHz,
  isReliableTraceSample,
  makePitchTraceSample,
  resolveTraceTarget,
  summarizePitchStability,
} from "./pitch-trace";

const standard = getTuning("standard");
const lowE = standard.strings[0]!;
const aString = standard.strings[1]!;

function sample(t: number, cents: number, reliable = true): PitchTraceSample {
  return {
    t,
    cents,
    confidence: reliable ? 0.95 : 0.84,
    rms: reliable ? 0.01 : 0.002,
    reliable,
  };
}

describe("pitch trace helpers", () => {
  it("computes cents from the active string target", () => {
    const targetHz = getStringTargetHz(aString);
    const sharpHz = targetHz * 2 ** (12 / 1200);
    const flatHz = targetHz * 2 ** (-7 / 1200);

    expect(centsFromTargetHz(sharpHz, targetHz)).toBeCloseTo(12, 4);
    expect(centsFromTargetHz(flatHz, targetHz)).toBeCloseTo(-7, 4);
  });

  it("auto-detects the nearest target but keeps a nearby active string locked", () => {
    const lowESlightlySharp = getStringTargetHz(lowE) * 2 ** (60 / 1200);

    expect(getClosestStringTarget(standard, getStringTargetHz(aString)).midi).toBe(aString.midi);
    expect(resolveTraceTarget(lowE, standard, lowESlightlySharp).midi).toBe(lowE.midi);
    expect(resolveTraceTarget(lowE, standard, getStringTargetHz(aString)).midi).toBe(aString.midi);
  });

  it("marks weak or low-confidence pitch samples as unreliable", () => {
    const reliable = makePitchTraceSample({
      hz: getStringTargetHz(aString) * 2 ** (-8 / 1200),
      t: 1,
      confidence: 0.95,
      rms: 0.01,
      target: aString,
    });

    expect(reliable.cents).toBeCloseTo(-8, 4);
    expect(reliable.reliable).toBe(true);
    expect(isReliableTraceSample(0.85, 0.01)).toBe(false);
    expect(isReliableTraceSample(0.95, 0.002)).toBe(false);
  });

  it("keeps exactly the last five seconds of trace history", () => {
    const samples = [sample(1.99, -3), sample(2, -2), sample(4, 1)];
    const next = appendRollingTraceSample(samples, sample(7, 3), 7);

    expect(next.map((s) => s.t)).toEqual([2, 4, 7]);
  });

  it("breaks line segments over gaps and fades unreliable connections", () => {
    const segments = buildPitchTraceLineSegments(
      [sample(1, 0), sample(1.1, 2, false), sample(1.2, 3), sample(1.7, 4)],
      1.7,
    );

    expect(segments).toHaveLength(2);
    expect(segments.every((segment) => !segment.reliable)).toBe(true);
    expect(segments.map((segment) => [segment.from.t, segment.to.t])).toEqual([
      [1, 1.1],
      [1.1, 1.2],
    ]);
  });

  it("summarizes stable and directional pitch behavior", () => {
    expect(summarizePitchStability([sample(9.2, 3), sample(9.5, 2), sample(9.8, -1)], 10)).toBe(
      "Stable for 0.8s",
    );

    expect(summarizePitchStability([sample(8.7, 10), sample(9.1, 8), sample(9.7, 12)], 9.8)).toBe(
      "Mostly sharp",
    );
  });
});
