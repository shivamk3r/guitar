import { describe, expect, it } from "vitest";
import { FFT, applyHann } from "./fft";

describe("FFT", () => {
  it("throws on non-power-of-two size", () => {
    expect(() => new FFT(500)).toThrow();
  });

  it("transforms a sine wave to a peak at the expected bin", () => {
    const N = 1024;
    const sampleRate = 48000;
    const targetHz = 440;
    const buf = new Float32Array(N);
    for (let i = 0; i < N; i++) buf[i] = Math.sin((2 * Math.PI * targetHz * i) / sampleRate);
    const fft = new FFT(N);
    const mag = new Float32Array(N / 2 + 1);
    fft.magnitudeSpectrum(buf, mag);
    // Locate peak
    let peakBin = 0;
    let peakVal = 0;
    for (let i = 1; i < mag.length; i++) {
      if ((mag[i] ?? 0) > peakVal) {
        peakVal = mag[i] ?? 0;
        peakBin = i;
      }
    }
    const peakHz = (peakBin * sampleRate) / N;
    expect(Math.abs(peakHz - targetHz)).toBeLessThan(sampleRate / N);
  });

  it("DC input has energy at bin 0 only", () => {
    const N = 256;
    const buf = new Float32Array(N).fill(0.5);
    const fft = new FFT(N);
    const mag = new Float32Array(N / 2 + 1);
    fft.magnitudeSpectrum(buf, mag);
    expect(mag[0]).toBeGreaterThan(0);
    for (let i = 1; i < mag.length; i++) expect(mag[i]).toBeLessThan(0.01);
  });
});

describe("applyHann", () => {
  it("zeros the endpoints and peaks in the middle", () => {
    const buf = new Float32Array(32).fill(1);
    applyHann(buf);
    expect(buf[0]).toBeCloseTo(0, 5);
    expect(buf[31]).toBeCloseTo(0, 5);
    expect(buf[16]).toBeCloseTo(1, 1);
  });
});
