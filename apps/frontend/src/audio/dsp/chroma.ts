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
  /** Number of harmonic hypotheses to fold back into candidate fundamentals. Default 6. */
  harmonics?: number;
  /** Exponent for harmonic weighting. Default 2.4. */
  harmonicRolloff?: number;
  /** Divide each bin by a local spectral mean before chroma projection. Default true. */
  spectralWhitening?: boolean;
  /** Half-width of the local mean window in FFT bins. Default 12. */
  whiteningBins?: number;
}

export class ChromaExtractor {
  private readonly weights: Float32Array; // [binCount * 12]
  private readonly whitened: Float32Array;
  private readonly binCount: number;
  private readonly spectralWhitening: boolean;
  private readonly whiteningBins: number;

  constructor(options: ChromaOptions) {
    const { sampleRate, fftSize } = options;
    const binCount = fftSize / 2 + 1;
    const minHz = options.minHz ?? 70;
    const maxHz = options.maxHz ?? 2000;
    const sigma = options.sigma ?? 0.5;
    const harmonics = options.harmonics ?? 6;
    const harmonicRolloff = options.harmonicRolloff ?? 2.4;
    this.binCount = binCount;
    this.weights = new Float32Array(binCount * 12);
    this.whitened = new Float32Array(binCount);
    this.spectralWhitening = options.spectralWhitening ?? true;
    this.whiteningBins = options.whiteningBins ?? 12;

    for (let i = 0; i < binCount; i++) {
      const hz = (i * sampleRate) / fftSize;
      if (hz < minHz || hz > maxHz) continue;
      const midiFloat = 12 * Math.log2(hz / 440) + 69;
      let harmonicWeightTotal = 0;
      for (let harmonic = 1; harmonic <= harmonics; harmonic++) {
        const fundamentalMidi = midiFloat - 12 * Math.log2(harmonic);
        const pcFloat = ((fundamentalMidi % 12) + 12) % 12;
        const harmonicWeight = harmonic === 1 ? 4 : harmonic ** -harmonicRolloff;
        harmonicWeightTotal += harmonicWeight;
        for (let pc = 0; pc < 12; pc++) {
          let delta = pcFloat - pc;
          // Circular distance: shortest signed arc on a 12-note wheel
          delta = ((((delta + 6) % 12) + 12) % 12) - 6;
          const w = harmonicWeight * Math.exp(-(delta * delta) / (2 * sigma * sigma));
          this.weights[i * 12 + pc] = (this.weights[i * 12 + pc] ?? 0) + w;
        }
      }
      if (harmonicWeightTotal > 0) {
        for (let pc = 0; pc < 12; pc++) {
          this.weights[i * 12 + pc] = (this.weights[i * 12 + pc] ?? 0) / harmonicWeightTotal;
        }
      }
    }
  }

  /** Writes a length-12 chroma vector (L2-normalized) into `out`. */
  compute(mag: Float32Array, out: Float32Array): void {
    if (out.length !== 12) throw new Error("chroma out must be length 12");
    if (mag.length !== this.binCount) throw new Error("mag length mismatch");
    out.fill(0);
    const spectrum = this.prepareSpectrum(mag);
    for (let i = 0; i < this.binCount; i++) {
      const m = spectrum[i] ?? 0;
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

  private prepareSpectrum(mag: Float32Array): Float32Array {
    if (!this.spectralWhitening) return mag;
    this.whitened.fill(0);
    for (let i = 1; i < this.binCount; i++) {
      const m = mag[i] ?? 0;
      if (m <= 0) continue;
      const start = Math.max(1, i - this.whiteningBins);
      const end = Math.min(this.binCount - 1, i + this.whiteningBins);
      let localSum = 0;
      let localCount = 0;
      for (let j = start; j <= end; j++) {
        const value = mag[j] ?? 0;
        if (value <= 0) continue;
        localSum += value;
        localCount++;
      }
      const localMean = localCount > 0 ? localSum / localCount : 0;
      this.whitened[i] =
        localMean > 0 ? Math.max(0, Math.log1p(m / localMean) - Math.LN2) : Math.log1p(m);
    }
    return this.whitened;
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
