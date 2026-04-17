import { describe, expect, it } from "vitest";
import { detectPitch } from "./yin";

function sineBuffer(hz: number, sampleRate: number, n: number, amplitude = 0.8): Float32Array {
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) buf[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / sampleRate);
  return buf;
}

function noisyBuffer(hz: number, sampleRate: number, n: number, snrDb: number): Float32Array {
  const signal = sineBuffer(hz, sampleRate, n);
  const noiseAmp = 1 / 10 ** (snrDb / 20);
  const noise = new Float32Array(n);
  for (let i = 0; i < n; i++) noise[i] = (Math.random() * 2 - 1) * noiseAmp;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = signal[i]! + noise[i]!;
  return out;
}

describe("YIN", () => {
  it("detects A4 at exactly 440 Hz", () => {
    const buf = sineBuffer(440, 48000, 4096);
    const r = detectPitch(buf, { sampleRate: 48000 });
    expect(r).not.toBeNull();
    expect(Math.abs(r!.hz - 440)).toBeLessThan(0.5);
  });

  it("detects low E2 (82.41 Hz) within 1 cent", () => {
    const buf = sineBuffer(82.41, 48000, 4096);
    const r = detectPitch(buf, { sampleRate: 48000 });
    expect(r).not.toBeNull();
    const cents = 1200 * Math.log2(r!.hz / 82.41);
    expect(Math.abs(cents)).toBeLessThan(1);
  });

  it("returns high-probability result for clean sine", () => {
    const buf = sineBuffer(196, 48000, 4096); // G3
    const r = detectPitch(buf, { sampleRate: 48000 });
    expect(r).not.toBeNull();
    expect(r!.probability).toBeGreaterThan(0.9);
  });

  it("handles moderate noise", () => {
    const buf = noisyBuffer(440, 48000, 4096, 20);
    const r = detectPitch(buf, { sampleRate: 48000 });
    expect(r).not.toBeNull();
    expect(Math.abs(r!.hz - 440)).toBeLessThan(2);
  });

  it("returns null for pure noise", () => {
    const buf = new Float32Array(4096);
    for (let i = 0; i < buf.length; i++) buf[i] = Math.random() * 2 - 1;
    const r = detectPitch(buf, { sampleRate: 48000, threshold: 0.1 });
    // Either returns null or a low-confidence bogus hz; whatever it does, probability
    // should not be convincingly high.
    if (r) expect(r.probability).toBeLessThan(0.7);
  });

  it("detects across the full guitar range", () => {
    const cases = [82.41, 110, 146.83, 196, 246.94, 329.63];
    for (const target of cases) {
      const buf = sineBuffer(target, 48000, 4096);
      const r = detectPitch(buf, { sampleRate: 48000 });
      expect(r).not.toBeNull();
      const cents = 1200 * Math.log2(r!.hz / target);
      expect(Math.abs(cents)).toBeLessThan(3);
    }
  });
});
