export class FFT {
  readonly size: number;
  private readonly cosTable: Float32Array;
  private readonly sinTable: Float32Array;
  private readonly reverse: Uint32Array;

  constructor(size: number) {
    if ((size & (size - 1)) !== 0) throw new Error("FFT size must be a power of two");
    this.size = size;
    this.cosTable = new Float32Array(size / 2);
    this.sinTable = new Float32Array(size / 2);
    for (let i = 0; i < size / 2; i++) {
      this.cosTable[i] = Math.cos((-2 * Math.PI * i) / size);
      this.sinTable[i] = Math.sin((-2 * Math.PI * i) / size);
    }
    this.reverse = new Uint32Array(size);
    const bits = Math.log2(size);
    for (let i = 0; i < size; i++) {
      let r = 0;
      for (let j = 0; j < bits; j++) if ((i >> j) & 1) r |= 1 << (bits - 1 - j);
      this.reverse[i] = r;
    }
  }

  /** In-place radix-2 Cooley–Tukey FFT on real+imag arrays of length `size`. */
  transform(real: Float32Array, imag: Float32Array): void {
    const n = this.size;
    for (let i = 0; i < n; i++) {
      const j = this.reverse[i] ?? 0;
      if (j > i) {
        const tr = real[i] ?? 0;
        const ti = imag[i] ?? 0;
        real[i] = real[j] ?? 0;
        imag[i] = imag[j] ?? 0;
        real[j] = tr;
        imag[j] = ti;
      }
    }
    for (let size = 2; size <= n; size *= 2) {
      const half = size / 2;
      const step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = 0; j < half; j++) {
          const k = j * step;
          const c = this.cosTable[k] ?? 1;
          const s = this.sinTable[k] ?? 0;
          const tr = (real[i + j + half] ?? 0) * c - (imag[i + j + half] ?? 0) * s;
          const ti = (real[i + j + half] ?? 0) * s + (imag[i + j + half] ?? 0) * c;
          real[i + j + half] = (real[i + j] ?? 0) - tr;
          imag[i + j + half] = (imag[i + j] ?? 0) - ti;
          real[i + j] = (real[i + j] ?? 0) + tr;
          imag[i + j] = (imag[i + j] ?? 0) + ti;
        }
      }
    }
  }

  /** Compute magnitude spectrum from a real-valued input. Output length is size/2 + 1. */
  magnitudeSpectrum(input: Float32Array, out: Float32Array): void {
    const n = this.size;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    const len = Math.min(input.length, n);
    for (let i = 0; i < len; i++) real[i] = input[i] ?? 0;
    this.transform(real, imag);
    const half = n / 2;
    for (let i = 0; i <= half; i++) {
      const re = real[i] ?? 0;
      const im = imag[i] ?? 0;
      out[i] = Math.sqrt(re * re + im * im);
    }
  }
}

/** Hann window applied in place to a buffer. */
export function applyHann(buffer: Float32Array): void {
  const n = buffer.length;
  for (let i = 0; i < n; i++) {
    const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
    buffer[i] = (buffer[i] ?? 0) * w;
  }
}
