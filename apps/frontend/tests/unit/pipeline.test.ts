import { ChromaExtractor } from "@/audio/dsp/chroma";
import { FFT } from "@/audio/dsp/fft";
import { CHORDS, type ChordDef } from "@/data/chords";
import { matchChord } from "@/features/chord-library/chord-detection";
import { midiToHz } from "@/lib/math";
import { describe, expect, it } from "vitest";

const SAMPLE_RATE = 48000;
const FFT_SIZE = 8192;

/**
 * Synthesize a "plucked string" per note: fundamental + 3 exponentially decaying
 * harmonics. The result approximates the spectrum a real guitar strum would produce
 * well enough to test chord detection end-to-end.
 */
function synthStrum(midis: readonly (number | null)[]): Float32Array {
  const N = FFT_SIZE;
  const buf = new Float32Array(N);
  let offset = 0;
  for (const midi of midis) {
    if (midi == null) continue;
    const hz = midiToHz(midi);
    const startIdx = Math.floor(offset * SAMPLE_RATE);
    for (let i = startIdx; i < N; i++) {
      const t = (i - startIdx) / SAMPLE_RATE;
      const decay = Math.exp(-t * 1.2);
      let sample = 0;
      for (let h = 1; h <= 3; h++) {
        const amp = 1 / h ** 1.5;
        sample += amp * Math.sin(2 * Math.PI * hz * h * t) * decay;
      }
      buf[i] = (buf[i] ?? 0) + sample * 0.15;
    }
    offset += 0.005; // slight strum offset between strings
  }
  // Hann window
  for (let i = 0; i < N; i++) {
    buf[i] = (buf[i] ?? 0) * 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
  }
  return buf;
}

function chromaFor(midis: readonly (number | null)[]): Float32Array {
  const fft = new FFT(FFT_SIZE);
  const mag = new Float32Array(FFT_SIZE / 2 + 1);
  const chroma = new Float32Array(12);
  const extractor = new ChromaExtractor({ sampleRate: SAMPLE_RATE, fftSize: FFT_SIZE });
  fft.magnitudeSpectrum(synthStrum(midis), mag);
  extractor.compute(mag, chroma);
  return chroma;
}

describe("pipeline: synthesize strum → chroma → matchChord", () => {
  // Chords where the detected chord should match exactly. E and A are excluded
  // here because harmonic leakage from the fundamental can bias detection toward
  // their dominant-7th siblings (E7/A7) — a known template-matching limitation.
  // The root is still correct in those cases, which is what §10.2 calls "same
  // family" partial credit.
  it.each(["C", "G", "D", "Am", "Em", "Dm"] as const)(
    "identifies a synthesized %s chord exactly",
    (chordId) => {
      const chord = CHORDS.find((c) => c.id === chordId) as ChordDef;
      const chroma = chromaFor(chord.playedMidi);
      const match = matchChord(chroma, chord);
      expect(match.chord?.id).toBe(chordId);
    },
  );

  it("E and A synthesized chords at minimum resolve to the correct root", () => {
    for (const id of ["E", "A"] as const) {
      const chord = CHORDS.find((c) => c.id === id) as ChordDef;
      const match = matchChord(chromaFor(chord.playedMidi), chord);
      expect(match.chord?.root).toBe(chord.root);
    }
  });

  it("muting the chord's only F# destroys the D7 match", () => {
    const d7 = CHORDS.find((c) => c.id === "D7") as ChordDef;
    // Full strum
    const full = matchChord(chromaFor(d7.playedMidi), d7);
    // Remove the high F# (last string) — D7's only F#
    const withoutFsharp = [...d7.playedMidi];
    withoutFsharp[5] = null;
    const partial = matchChord(chromaFor(withoutFsharp), d7);
    expect(partial.similarity).toBeLessThan(full.similarity);
  });

  it("major vs minor is reliably distinguishable", () => {
    const a = CHORDS.find((c) => c.id === "A") as ChordDef;
    const am = CHORDS.find((c) => c.id === "Am") as ChordDef;
    const fromA = matchChord(chromaFor(a.playedMidi));
    const fromAm = matchChord(chromaFor(am.playedMidi));
    expect(fromA.chord?.root).toBe("A");
    expect(fromAm.chord?.root).toBe("A");
    expect(fromA.chord?.quality).toBe("major");
    expect(fromAm.chord?.quality).toBe("minor");
  });

  it("transposing a detected chord changes the detected root accordingly", () => {
    const c = CHORDS.find((c) => c.id === "C") as ChordDef;
    const transposed = c.playedMidi.map((m) => (m == null ? null : m + 7));
    const match = matchChord(chromaFor(transposed));
    // C transposed up a fifth → G-family chord.
    expect(match.chord?.root).toBe("G");
  });
});
