/**
 * Pitch-class profile (chroma) features.
 *
 * For each spectrum bin we compute the fractional MIDI note and distribute its energy
 * across all 12 pitch classes using a circular Gaussian. This avoids quantization issues
 * when bin centers don't align with MIDI notes — which is the common case for low-frequency
 * guitar strings at typical FFT sizes.
 */

export interface ChromaOptions {
  sampleRate: number;
  fftSize: number;
  minHz?: number;
  maxHz?: number;
  /** Width of the Gaussian kernel in semitones. Default 0.5 semitones. */
  sigma?: number;
}

export class ChromaExtractor {
  private readonly weights: Float32Array; // [binCount * 12]
  private readonly binCount: number;

  constructor(options: ChromaOptions) {
    const { sampleRate, fftSize } = options;
    const binCount = fftSize / 2 + 1;
    const minHz = options.minHz ?? 70;
    const maxHz = options.maxHz ?? 2000;
    const sigma = options.sigma ?? 0.5;
    this.binCount = binCount;
    this.weights = new Float32Array(binCount * 12);

    for (let i = 0; i < binCount; i++) {
      const hz = (i * sampleRate) / fftSize;
      if (hz < minHz || hz > maxHz) continue;
      const midiFloat = 12 * Math.log2(hz / 440) + 69;
      const pcFloat = ((midiFloat % 12) + 12) % 12;
      for (let pc = 0; pc < 12; pc++) {
        let delta = pcFloat - pc;
        // Circular distance: shortest signed arc on a 12-note wheel
        delta = ((((delta + 6) % 12) + 12) % 12) - 6;
        const w = Math.exp(-(delta * delta) / (2 * sigma * sigma));
        this.weights[i * 12 + pc] = w;
      }
    }
  }

  /** Writes a length-12 chroma vector (L2-normalized) into `out`. */
  compute(mag: Float32Array, out: Float32Array): void {
    if (out.length !== 12) throw new Error("chroma out must be length 12");
    if (mag.length !== this.binCount) throw new Error("mag length mismatch");
    out.fill(0);
    for (let i = 0; i < this.binCount; i++) {
      const m = mag[i] ?? 0;
      if (m === 0) continue;
      for (let pc = 0; pc < 12; pc++) {
        out[pc] = (out[pc] ?? 0) + m * (this.weights[i * 12 + pc] ?? 0);
      }
    }
    // L2 normalize for cosine-similarity-friendly output.
    let norm = 0;
    for (let p = 0; p < 12; p++) norm += (out[p] ?? 0) * (out[p] ?? 0);
    norm = Math.sqrt(norm);
    if (norm > 1e-6) for (let p = 0; p < 12; p++) out[p] = (out[p] ?? 0) / norm;
  }
}

/**
 * Cosine similarity between two 12-bin chroma vectors.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < 12; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    na += ai * ai;
    nb += bi * bi;
  }
  const denom = Math.sqrt(na * nb);
  return denom > 1e-8 ? dot / denom : 0;
}
