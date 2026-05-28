/**
 * Spectral-flux onset detection. A stateful detector: feed it magnitude spectra one at a time
 * and it returns an onset strength each call. A rising edge above the adaptive threshold
 * indicates a strum.
 */
export class OnsetDetector {
  private prevMag: Float32Array | null = null;
  private history: number[] = [];
  private readonly historyLen: number;
  private cooldownSamples = 0;

  private readonly minGapSamples: number;

  constructor(
    private readonly bins: number,
    hopMs: number,
    options: { historyMs?: number; minGapMs?: number } = {},
  ) {
    this.historyLen = Math.max(4, Math.floor((options.historyMs ?? 400) / Math.max(1, hopMs)));
    this.minGapSamples = Math.max(1, Math.floor((options.minGapMs ?? 80) / Math.max(1, hopMs)));
  }

  /** Returns { flux, threshold, onset } where onset indicates a detected attack. */
  process(mag: Float32Array): { flux: number; threshold: number; onset: boolean } {
    if (mag.length !== this.bins) throw new Error("mag length mismatch");
    let flux = 0;
    if (this.prevMag) {
      for (let i = 0; i < this.bins; i++) {
        const d = (mag[i] ?? 0) - (this.prevMag[i] ?? 0);
        if (d > 0) flux += d;
      }
    }
    this.prevMag = mag.slice();

    this.history.push(flux);
    if (this.history.length > this.historyLen) this.history.shift();

    // Adaptive threshold: median + k * mad
    const sorted = [...this.history].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    const mad =
      sorted.length > 0
        ? ([...sorted].map((v) => Math.abs(v - median)).sort((a, b) => a - b)[
            Math.floor(sorted.length / 2)
          ] ?? 0)
        : 0;
    const threshold = median + 2.5 * mad + 1e-3;

    if (this.cooldownSamples > 0) this.cooldownSamples--;

    const onset = this.cooldownSamples === 0 && flux > threshold && flux > 0.05;
    if (onset) this.cooldownSamples = this.minGapSamples;
    return { flux, threshold, onset };
  }

  reset(): void {
    this.prevMag = null;
    this.history.length = 0;
    this.cooldownSamples = 0;
  }
}
