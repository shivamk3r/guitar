import { midiToHz } from "@/lib/math";
import { describe, expect, it } from "vitest";
import { ChromaExtractor, cosineSimilarity } from "./chroma";
import { FFT } from "./fft";

/** Build a magnitude spectrum from a sum-of-sines synthesized signal. */
function synthSpectrum(hzList: number[], sampleRate: number, fftSize: number): Float32Array {
  const buf = new Float32Array(fftSize);
  for (let i = 0; i < fftSize; i++) {
    let s = 0;
    for (const hz of hzList) s += Math.sin((2 * Math.PI * hz * i) / sampleRate);
    buf[i] = s / Math.max(1, hzList.length);
  }
  // Hann window for cleaner peaks
  for (let i = 0; i < fftSize; i++)
    buf[i] = (buf[i] ?? 0) * 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
  const fft = new FFT(fftSize);
  const mag = new Float32Array(fftSize / 2 + 1);
  fft.magnitudeSpectrum(buf, mag);
  return mag;
}

describe("ChromaExtractor", () => {
  const sampleRate = 48000;
  // Use an 8192-sample FFT so bin resolution (~5.86 Hz) can isolate adjacent
  // pitch classes for low-frequency synthetic inputs. The worklet uses a smaller
  // FFT in practice, but real strums carry rich harmonics that fire across many
  // bins — synthetic pure sines don't, hence the larger test FFT.
  const fftSize = 8192;
  const extractor = new ChromaExtractor({ sampleRate, fftSize });

  it("produces energy at pitch classes C/E/G for a C major chord", () => {
    // C major notes: C3, E3, G3, C4 (MIDI 48, 52, 55, 60); also add harmonics
    // (octaves + fifths) because those are real in a strummed guitar chord.
    const notes = [48, 52, 55, 60, 60, 64, 67, 72];
    const mag = synthSpectrum(notes.map(midiToHz), sampleRate, fftSize);
    const chroma = new Float32Array(12);
    extractor.compute(mag, chroma);
    const pairs: Array<[number, number]> = [...chroma].map((v, i) => [i, v]);
    pairs.sort((a, b) => b[1] - a[1]);
    const top3 = new Set(pairs.slice(0, 3).map((p) => p[0]));
    expect(top3).toEqual(new Set([0, 4, 7]));
  });

  it("single note energy peaks at its own pitch class", () => {
    // Include a few harmonics — any realistic pitched sound has harmonics at
    // the octave and the fifth above, which all reinforce the fundamental's pc.
    const mag = synthSpectrum(
      [midiToHz(60), midiToHz(72), midiToHz(79), midiToHz(84)],
      sampleRate,
      fftSize,
    );
    const chroma = new Float32Array(12);
    extractor.compute(mag, chroma);
    let max = 0;
    let maxIdx = -1;
    for (let i = 0; i < 12; i++) {
      if ((chroma[i] ?? 0) > max) {
        max = chroma[i] ?? 0;
        maxIdx = i;
      }
    }
    expect(maxIdx).toBe(0);
  });

  it("output is L2-normalized", () => {
    const mag = synthSpectrum([midiToHz(60), midiToHz(72)], sampleRate, fftSize);
    const chroma = new Float32Array(12);
    extractor.compute(mag, chroma);
    let norm = 0;
    for (const v of chroma) norm += v * v;
    expect(Math.sqrt(norm)).toBeCloseTo(1, 2);
  });

  it("empty spectrum produces zero chroma", () => {
    const mag = new Float32Array(fftSize / 2 + 1);
    const chroma = new Float32Array(12);
    extractor.compute(mag, chroma);
    for (const v of chroma) expect(v).toBe(0);
  });
});

describe("cosineSimilarity", () => {
  it("identical vectors have similarity 1", () => {
    const a = new Float32Array([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(cosineSimilarity(a, a)).toBeCloseTo(1, 5);
  });

  it("orthogonal vectors have similarity 0", () => {
    const a = new Float32Array([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const b = new Float32Array([0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5);
  });
});
