import { describe, expect, it } from "vitest";
import { clamp, hzToNote, midiToHz, noteToMidi, rms } from "./math";

describe("math", () => {
  it("A4 is 440 Hz exactly", () => {
    const info = hzToNote(440);
    expect(info.name).toBe("A");
    expect(info.octave).toBe(4);
    expect(info.midi).toBe(69);
    expect(info.cents).toBeCloseTo(0, 5);
  });

  it("hzToNote handles a sharp guitar low E", () => {
    // 82.41 Hz = E2 perfectly
    const info = hzToNote(82.41);
    expect(info.name).toBe("E");
    expect(info.octave).toBe(2);
    expect(Math.abs(info.cents)).toBeLessThan(0.5);
  });

  it("hzToNote computes +cents for sharp, -cents for flat", () => {
    const e2 = midiToHz(40); // 82.4 Hz
    const sharp = hzToNote(e2 * 2 ** (15 / 1200)); // +15 cents
    expect(sharp.cents).toBeCloseTo(15, 0);
    const flat = hzToNote(e2 * 2 ** (-15 / 1200));
    expect(flat.cents).toBeCloseTo(-15, 0);
  });

  it("noteToMidi round trips", () => {
    expect(noteToMidi("A", 4)).toBe(69);
    expect(noteToMidi("C", 4)).toBe(60);
    expect(noteToMidi("E", 2)).toBe(40);
  });

  it("rms of silence is 0, of full-scale sine is ~0.707", () => {
    const silence = new Float32Array(512);
    expect(rms(silence)).toBe(0);
    const sine = new Float32Array(4096);
    for (let i = 0; i < sine.length; i++) sine[i] = Math.sin((2 * Math.PI * i) / 32);
    expect(rms(sine)).toBeCloseTo(1 / Math.sqrt(2), 2);
  });

  it("clamp bounds values", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});
