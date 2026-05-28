import { readFile } from "node:fs/promises";
import { ChromaExtractor } from "../../src/audio/dsp/chroma";
import { FFT, applyHann } from "../../src/audio/dsp/fft";
import { OnsetDetector } from "../../src/audio/dsp/onset";
import { CAPTURE_CONFIG, type CaptureResult } from "./types";

export interface DecodedAudio {
  sampleRate: number;
  samples: Float32Array;
}

interface WavFormat {
  audioFormat: number;
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  blockAlign: number;
}

export async function decodeWavFile(filePath: string): Promise<DecodedAudio> {
  const buffer = await readFile(filePath);
  return decodeWavBuffer(buffer);
}

export function decodeWavBuffer(buffer: Buffer): DecodedAudio {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (readAscii(view, 0, 4) !== "RIFF" || readAscii(view, 8, 4) !== "WAVE") {
    throw new Error("unsupported audio: expected RIFF/WAVE");
  }

  let fmt: WavFormat | null = null;
  let dataOffset = -1;
  let dataSize = 0;
  let offset = 12;
  while (offset + 8 <= view.byteLength) {
    const chunkId = readAscii(view, offset, 4);
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkDataOffset = offset + 8;
    if (chunkId === "fmt ") {
      fmt = {
        audioFormat: view.getUint16(chunkDataOffset, true),
        channels: view.getUint16(chunkDataOffset + 2, true),
        sampleRate: view.getUint32(chunkDataOffset + 4, true),
        blockAlign: view.getUint16(chunkDataOffset + 12, true),
        bitsPerSample: view.getUint16(chunkDataOffset + 14, true),
      };
    } else if (chunkId === "data") {
      dataOffset = chunkDataOffset;
      dataSize = chunkSize;
    }
    offset = chunkDataOffset + chunkSize + (chunkSize % 2);
  }

  if (!fmt) throw new Error("unsupported WAV: missing fmt chunk");
  if (dataOffset < 0) throw new Error("unsupported WAV: missing data chunk");
  if (fmt.channels < 1) throw new Error("unsupported WAV: no channels");
  const frames = Math.floor(dataSize / fmt.blockAlign);
  const samples = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame++) {
    let sum = 0;
    for (let channel = 0; channel < fmt.channels; channel++) {
      const sampleOffset = dataOffset + frame * fmt.blockAlign + channel * (fmt.bitsPerSample / 8);
      sum += readWavSample(view, sampleOffset, fmt.audioFormat, fmt.bitsPerSample);
    }
    samples[frame] = sum / fmt.channels;
  }
  return { sampleRate: fmt.sampleRate, samples };
}

export function analyzeChordCapture(
  audio: DecodedAudio,
  segmentStartSec: number,
  segmentEndSec: number,
): CaptureResult {
  const fft = new FFT(CAPTURE_CONFIG.fftSize);
  const chromaExtractor = new ChromaExtractor({
    sampleRate: audio.sampleRate,
    fftSize: CAPTURE_CONFIG.fftSize,
    minHz: CAPTURE_CONFIG.minHz,
    maxHz: CAPTURE_CONFIG.maxHz,
  });
  const mag = new Float32Array(CAPTURE_CONFIG.fftSize / 2 + 1);
  const chroma = new Float32Array(12);
  const hopMs = (CAPTURE_CONFIG.hopSize / audio.sampleRate) * 1000;
  const onset = new OnsetDetector(CAPTURE_CONFIG.fftSize / 2 + 1, hopMs);
  const segmentStart = Math.max(0, segmentStartSec);
  const audioEndSec = audio.samples.length / audio.sampleRate;
  const segmentEnd = Math.min(Math.max(segmentEndSec, segmentStart), audioEndSec);
  const scanStartSec = Math.max(0, segmentStart - CAPTURE_CONFIG.onsetLookbackMs / 1000);
  const scanStartSample = Math.max(
    CAPTURE_CONFIG.fftSize,
    Math.floor(scanStartSec * audio.sampleRate),
  );
  const scanEndSample = Math.min(audio.samples.length, Math.ceil(segmentEnd * audio.sampleRate));
  const frames: Array<{ t: number; chroma: Float32Array }> = [];
  let onsetSec: number | null = null;

  for (
    let windowEnd = scanStartSample;
    windowEnd <= scanEndSample;
    windowEnd += CAPTURE_CONFIG.hopSize
  ) {
    const windowStart = windowEnd - CAPTURE_CONFIG.fftSize;
    if (windowStart < 0) continue;
    const fftBuf = audio.samples.slice(windowStart, windowEnd);
    applyHann(fftBuf);
    fft.magnitudeSpectrum(fftBuf, mag);
    const t = windowEnd / audio.sampleRate;
    const onsetResult = onset.process(mag);
    if (onsetSec == null && t >= segmentStart && t <= segmentEnd && onsetResult.onset) {
      onsetSec = t;
    }
    if (windowRms(audio.samples, windowStart, windowEnd) > CAPTURE_CONFIG.rmsThreshold) {
      chromaExtractor.compute(mag, chroma);
      frames.push({ t, chroma: new Float32Array(chroma) });
    }
  }

  const strategy = onsetSec != null ? "onset" : "midpoint";
  const captureStartSec =
    onsetSec ?? Math.max(segmentStart, segmentStart + (segmentEnd - segmentStart) / 2);
  const captureEndSec = Math.min(segmentEnd, captureStartSec + CAPTURE_CONFIG.captureMs / 1000);
  let captureFrames = frames.filter(
    (frame) => frame.t >= captureStartSec && frame.t <= captureEndSec,
  );
  let captureStrategy: CaptureResult["captureStrategy"] = strategy;
  if (captureFrames.length === 0) {
    captureFrames = frames.filter((frame) => frame.t >= segmentStart && frame.t <= segmentEnd);
    captureStrategy = "fallback";
  }
  const { avgChroma, hasSignal } = averageChroma(captureFrames.map((frame) => frame.chroma));
  return {
    chroma: [...avgChroma],
    hasSignal,
    captureStartSec,
    captureEndSec,
    captureStrategy,
    onsetSec,
    chromaFrames: captureFrames.length,
  };
}

function averageChroma(frames: readonly Float32Array[]): {
  avgChroma: Float32Array;
  hasSignal: boolean;
} {
  const avgChroma = new Float32Array(12);
  if (frames.length === 0) return { avgChroma, hasSignal: false };
  for (const frame of frames) {
    for (let i = 0; i < 12; i++) avgChroma[i] = (avgChroma[i] ?? 0) + (frame[i] ?? 0);
  }
  for (let i = 0; i < 12; i++) avgChroma[i] = (avgChroma[i] ?? 0) / frames.length;
  let norm = 0;
  for (let i = 0; i < 12; i++) norm += (avgChroma[i] ?? 0) * (avgChroma[i] ?? 0);
  norm = Math.sqrt(norm);
  if (norm <= 1e-8) return { avgChroma, hasSignal: false };
  for (let i = 0; i < 12; i++) avgChroma[i] = (avgChroma[i] ?? 0) / norm;
  return { avgChroma, hasSignal: true };
}

function windowRms(samples: Float32Array, start: number, end: number): number {
  let sum = 0;
  for (let i = start; i < end; i++) {
    const sample = samples[i] ?? 0;
    sum += sample * sample;
  }
  return Math.sqrt(sum / Math.max(1, end - start));
}

function readWavSample(
  view: DataView,
  offset: number,
  audioFormat: number,
  bitsPerSample: number,
): number {
  if (audioFormat === 3 && bitsPerSample === 32) return view.getFloat32(offset, true);
  if (audioFormat === 3 && bitsPerSample === 64) return view.getFloat64(offset, true);
  if (audioFormat !== 1) throw new Error(`unsupported WAV format ${audioFormat}`);
  if (bitsPerSample === 8) return (view.getUint8(offset) - 128) / 128;
  if (bitsPerSample === 16) return view.getInt16(offset, true) / 32768;
  if (bitsPerSample === 24) {
    const b0 = view.getUint8(offset);
    const b1 = view.getUint8(offset + 1);
    const b2 = view.getUint8(offset + 2);
    const value = (b2 & 0x80 ? 0xff000000 : 0) | (b2 << 16) | (b1 << 8) | b0;
    return value / 8388608;
  }
  if (bitsPerSample === 32) return view.getInt32(offset, true) / 2147483648;
  throw new Error(`unsupported WAV bit depth ${bitsPerSample}`);
}

function readAscii(view: DataView, offset: number, length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += String.fromCharCode(view.getUint8(offset + i));
  return out;
}
