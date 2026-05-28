// Guitar Coach analyzer worklet.
// Keep this file self-contained — AudioWorklet module loading has poor support for
// bare specifiers, so we inline the DSP primitives here. The TypeScript versions in
// src/audio/dsp/ are the canonical implementations and are covered by unit tests;
// this file mirrors them.

/* global AudioWorkletProcessor, registerProcessor, sampleRate, currentTime */

// ---------- FFT ----------
class FFT {
  constructor(size) {
    if ((size & (size - 1)) !== 0) throw new Error("FFT size must be power of two");
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
    this.real = new Float32Array(size);
    this.imag = new Float32Array(size);
  }
  magnitudeSpectrum(input, out) {
    const n = this.size;
    this.real.set(input.length >= n ? input.subarray(0, n) : input);
    if (input.length < n) this.real.fill(0, input.length);
    this.imag.fill(0);
    const r = this.real;
    const im = this.imag;
    for (let i = 0; i < n; i++) {
      const j = this.reverse[i];
      if (j > i) {
        const tr = r[i];
        const ti = im[i];
        r[i] = r[j];
        im[i] = im[j];
        r[j] = tr;
        im[j] = ti;
      }
    }
    for (let size = 2; size <= n; size *= 2) {
      const half = size / 2;
      const step = n / size;
      for (let k = 0; k < n; k += size) {
        for (let j = 0; j < half; j++) {
          const t = j * step;
          const c = this.cosTable[t];
          const s = this.sinTable[t];
          const tr = r[k + j + half] * c - im[k + j + half] * s;
          const ti = r[k + j + half] * s + im[k + j + half] * c;
          r[k + j + half] = r[k + j] - tr;
          im[k + j + half] = im[k + j] - ti;
          r[k + j] = r[k + j] + tr;
          im[k + j] = im[k + j] + ti;
        }
      }
    }
    const half = n / 2;
    for (let i = 0; i <= half; i++) {
      out[i] = Math.sqrt(r[i] * r[i] + im[i] * im[i]);
    }
  }
}

function applyHann(buffer) {
  const n = buffer.length;
  for (let i = 0; i < n; i++) {
    buffer[i] *= 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  }
}

// ---------- YIN ----------
function detectPitch(buffer, sampleRate, minHz, maxHz, threshold) {
  const n = buffer.length;
  const tauMin = Math.max(2, Math.floor(sampleRate / maxHz));
  const tauMax = Math.min(Math.floor(n / 2), Math.floor(sampleRate / minHz));
  if (tauMax <= tauMin) return null;
  const yin = new Float32Array(tauMax + 1);
  for (let tau = tauMin; tau <= tauMax; tau++) {
    let sum = 0;
    for (let i = 0; i < n - tau; i++) {
      const d = buffer[i] - buffer[i + tau];
      sum += d * d;
    }
    yin[tau] = sum;
  }
  yin[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    running += yin[tau];
    yin[tau] = running === 0 ? 1 : (yin[tau] * tau) / running;
  }
  let tauEst = -1;
  for (let tau = tauMin; tau <= tauMax; tau++) {
    if (yin[tau] < threshold) {
      while (tau + 1 <= tauMax && yin[tau + 1] < yin[tau]) tau++;
      tauEst = tau;
      break;
    }
  }
  if (tauEst < 0) return null;
  const x0 = tauEst > tauMin ? tauEst - 1 : tauEst;
  const x2 = tauEst + 1 <= tauMax ? tauEst + 1 : tauEst;
  let better = tauEst;
  if (x0 !== tauEst && x2 !== tauEst) {
    const s0 = yin[x0];
    const s1 = yin[tauEst];
    const s2 = yin[x2];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (denom !== 0) better = tauEst + (s2 - s0) / denom;
  }
  return { hz: sampleRate / better, probability: 1 - yin[tauEst] };
}

// ---------- Onset ----------
class OnsetDetector {
  constructor(bins, hopMs) {
    this.bins = bins;
    this.prev = null;
    this.history = [];
    this.historyLen = Math.max(4, Math.floor(400 / Math.max(1, hopMs)));
    this.minGap = Math.max(1, Math.floor(80 / Math.max(1, hopMs)));
    this.cooldown = 0;
  }
  process(mag) {
    let flux = 0;
    if (this.prev) {
      for (let i = 0; i < this.bins; i++) {
        const d = mag[i] - this.prev[i];
        if (d > 0) flux += d;
      }
    }
    if (!this.prev) this.prev = new Float32Array(this.bins);
    this.prev.set(mag);
    this.history.push(flux);
    if (this.history.length > this.historyLen) this.history.shift();
    const sorted = [...this.history].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    const madArr = sorted.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
    const mad = madArr[Math.floor(madArr.length / 2)] ?? 0;
    const threshold = median + 2.5 * mad + 1e-3;
    if (this.cooldown > 0) this.cooldown--;
    const onset = this.cooldown === 0 && flux > threshold && flux > 0.05;
    if (onset) this.cooldown = this.minGap;
    return { flux, threshold, onset };
  }
}

// ---------- Chroma ----------
class ChromaExtractor {
  constructor(sampleRate, fftSize, minHz, maxHz) {
    const binCount = fftSize / 2 + 1;
    this.binCount = binCount;
    this.weights = new Float32Array(binCount * 12);
    const sigma = 0.5;
    for (let i = 0; i < binCount; i++) {
      const hz = (i * sampleRate) / fftSize;
      if (hz < minHz || hz > maxHz) continue;
      const midiFloat = 12 * Math.log2(hz / 440) + 69;
      const pcFloat = ((midiFloat % 12) + 12) % 12;
      for (let pc = 0; pc < 12; pc++) {
        let delta = pcFloat - pc;
        delta = ((((delta + 6) % 12) + 12) % 12) - 6;
        this.weights[i * 12 + pc] = Math.exp(-(delta * delta) / (2 * sigma * sigma));
      }
    }
  }
  compute(mag, out) {
    out.fill(0);
    for (let i = 0; i < this.binCount; i++) {
      const m = mag[i];
      if (m === 0) continue;
      for (let pc = 0; pc < 12; pc++) {
        out[pc] += m * this.weights[i * 12 + pc];
      }
    }
    let norm = 0;
    for (let p = 0; p < 12; p++) norm += out[p] * out[p];
    norm = Math.sqrt(norm);
    if (norm > 1e-6) for (let p = 0; p < 12; p++) out[p] /= norm;
  }
}

// ---------- Processor ----------
const FFT_SIZE = 2048;
const HOP_SIZE = 512;
const PITCH_WINDOW = 2048;

class AnalyzerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ring = new Float32Array(FFT_SIZE * 2);
    this.ringWrite = 0;
    this.samplesSinceHop = 0;
    this.fft = new FFT(FFT_SIZE);
    this.mag = new Float32Array(FFT_SIZE / 2 + 1);
    this.hopMs = (HOP_SIZE / sampleRate) * 1000;
    this.onset = new OnsetDetector(FFT_SIZE / 2 + 1, this.hopMs);
    this.chroma = new ChromaExtractor(sampleRate, FFT_SIZE, 70, 2000);
    this.chromaOut = new Float32Array(12);
    this.running = false;
    this.port.onmessage = (e) => {
      if (e.data?.type === "start") this.running = true;
      if (e.data?.type === "stop") this.running = false;
    };
  }

  readWindow(size, out) {
    const len = this.ring.length;
    const start = (this.ringWrite - size + len) % len;
    for (let i = 0; i < size; i++) {
      out[i] = this.ring[(start + i) % len];
    }
  }

  process(inputs) {
    if (!this.running) return true;
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const ch = input[0];
    if (!ch) return true;

    const len = this.ring.length;
    for (let i = 0; i < ch.length; i++) {
      this.ring[this.ringWrite] = ch[i];
      this.ringWrite = (this.ringWrite + 1) % len;
    }
    this.samplesSinceHop += ch.length;

    while (this.samplesSinceHop >= HOP_SIZE) {
      this.samplesSinceHop -= HOP_SIZE;
      this.runHop();
    }
    return true;
  }

  runHop() {
    const t = currentTime;

    // level & pitch use a long window for low-frequency accuracy
    const pitchBuf = new Float32Array(PITCH_WINDOW);
    this.readWindow(PITCH_WINDOW, pitchBuf);
    let sumSq = 0;
    let peak = 0;
    for (let i = 0; i < PITCH_WINDOW; i++) {
      const s = pitchBuf[i];
      sumSq += s * s;
      const a = s < 0 ? -s : s;
      if (a > peak) peak = a;
    }
    const rms = Math.sqrt(sumSq / PITCH_WINDOW);
    this.port.postMessage({ type: "level", rms, peak, t });

    if (rms > 0.003) {
      const result = detectPitch(pitchBuf, sampleRate, 70, 1500, 0.15);
      if (result && result.probability > 0.8) {
        const midi = 12 * Math.log2(result.hz / 440) + 69;
        const rounded = Math.round(midi);
        const cents = (midi - rounded) * 100;
        this.port.postMessage({
          type: "pitch",
          hz: result.hz,
          cents,
          confidence: result.probability,
          rms,
          t,
        });
      }
    }

    // spectrum for onset + chroma
    const fftBuf = new Float32Array(FFT_SIZE);
    this.readWindow(FFT_SIZE, fftBuf);
    applyHann(fftBuf);
    this.fft.magnitudeSpectrum(fftBuf, this.mag);

    const onset = this.onset.process(this.mag);
    if (onset.onset) {
      this.port.postMessage({ type: "onset", strength: onset.flux, t });
    }

    this.chroma.compute(this.mag, this.chromaOut);
    // Only emit chroma when there's meaningful signal.
    if (rms > 0.01) {
      const copy = new Float32Array(12);
      copy.set(this.chromaOut);
      this.port.postMessage({ type: "chroma", chroma: copy, rms, t });
    }
  }
}

registerProcessor("guitar-analyzer", AnalyzerProcessor);
