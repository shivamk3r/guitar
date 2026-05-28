/**
 * YIN pitch detection — Cheveigné & Kawahara, 2002.
 *
 * Returns the fundamental frequency in Hz, or null if no reliable pitch is found.
 * Works best with a window covering ~2 periods of the lowest expected note.
 * For guitar low E (~82 Hz at 48 kHz) that means ≥ ~1200 samples.
 */
export interface YinOptions {
  threshold: number;
  sampleRate: number;
  minHz: number;
  maxHz: number;
}

export interface YinResult {
  hz: number;
  probability: number;
}

const DEFAULT_THRESHOLD = 0.15;

export function detectPitch(
  buffer: Float32Array,
  options: Partial<YinOptions> & { sampleRate: number },
): YinResult | null {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const minHz = options.minHz ?? 70;
  const maxHz = options.maxHz ?? 1500;
  const sampleRate = options.sampleRate;
  const n = buffer.length;
  const tauMin = Math.max(2, Math.floor(sampleRate / maxHz));
  const tauMax = Math.min(Math.floor(n / 2), Math.floor(sampleRate / minHz));
  if (tauMax <= tauMin) return null;

  const yin = new Float32Array(tauMax + 1);

  // Step 1: autocorrelation difference function
  for (let tau = tauMin; tau <= tauMax; tau++) {
    let sum = 0;
    for (let i = 0; i < n - tau; i++) {
      const diff = (buffer[i] ?? 0) - (buffer[i + tau] ?? 0);
      sum += diff * diff;
    }
    yin[tau] = sum;
  }

  // Step 2: cumulative mean normalized difference
  yin[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    running += yin[tau] ?? 0;
    if (running === 0) {
      yin[tau] = 1;
    } else {
      yin[tau] = ((yin[tau] ?? 0) * tau) / running;
    }
  }

  // Step 3: absolute threshold
  let tauEstimate = -1;
  for (let tau = tauMin; tau <= tauMax; tau++) {
    if ((yin[tau] ?? 1) < threshold) {
      // find local minimum
      while (tau + 1 <= tauMax && (yin[tau + 1] ?? 1) < (yin[tau] ?? 1)) tau++;
      tauEstimate = tau;
      break;
    }
  }
  if (tauEstimate < 0) return null;

  // Step 4: parabolic interpolation for sub-sample accuracy
  const x0 = tauEstimate > tauMin ? tauEstimate - 1 : tauEstimate;
  const x2 = tauEstimate + 1 <= tauMax ? tauEstimate + 1 : tauEstimate;
  let betterTau = tauEstimate;
  if (x0 !== tauEstimate && x2 !== tauEstimate) {
    const s0 = yin[x0] ?? 0;
    const s1 = yin[tauEstimate] ?? 0;
    const s2 = yin[x2] ?? 0;
    const denom = 2 * (2 * s1 - s2 - s0);
    if (denom !== 0) betterTau = tauEstimate + (s2 - s0) / denom;
  }

  const probability = 1 - (yin[tauEstimate] ?? 0);
  return { hz: sampleRate / betterTau, probability };
}
