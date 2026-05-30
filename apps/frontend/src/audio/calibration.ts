/**
 * Calibration: quick mic-signal check used on first visit (FR-X2).
 * Listens for ~2 seconds, records peak and RMS, classifies the input as
 * silent / too quiet / good / clipping.
 */
import type { AudioEngine } from "./engine";

export type CalibrationQuality = "silent" | "quiet" | "good" | "clipping";

export interface CalibrationResult {
  quality: CalibrationQuality;
  peak: number;
  meanRms: number;
  samples: number;
  latencyMs: number | null;
}

export interface CalibrationSample {
  peak: number;
  meanRms: number;
}

export async function runCalibration(
  engine: AudioEngine,
  durationMs = 2000,
): Promise<CalibrationResult> {
  let peak = 0;
  let rmsSum = 0;
  let samples = 0;
  const unsubscribe = engine.on("level", (evt) => {
    if (evt.peak > peak) peak = evt.peak;
    rmsSum += evt.rms;
    samples++;
  });
  await new Promise<void>((resolve) => setTimeout(resolve, durationMs));
  unsubscribe();
  const meanRms = samples > 0 ? rmsSum / samples : 0;
  return {
    quality: classifyCalibrationQuality({ peak, meanRms }),
    peak,
    meanRms,
    samples,
    latencyMs: estimateBrowserLatencyMs(engine.ctx),
  };
}

export function classifyCalibrationQuality(sample: CalibrationSample): CalibrationQuality {
  if (sample.peak < 0.005) return "silent";
  if (sample.peak < 0.03) return "quiet";
  if (sample.peak > 0.98) return "clipping";
  return "good";
}

export function calibrationGuidance(result: Pick<CalibrationResult, "quality">): string {
  if (result.quality === "silent") return "No usable signal. Check the selected input and cable.";
  if (result.quality === "quiet")
    return "Signal is low. Move closer or raise interface gain a little.";
  if (result.quality === "clipping") return "Signal is clipping. Lower input gain before scoring.";
  return "Input looks ready for tuner, chord checks, and practice scoring.";
}

export function calibrationQualityLabel(quality: CalibrationQuality): string {
  if (quality === "silent") return "Silent";
  if (quality === "quiet") return "Quiet";
  if (quality === "clipping") return "Clipping";
  return "Good";
}

function estimateBrowserLatencyMs(ctx: AudioContext | null): number | null {
  if (!ctx) return null;
  const outputLatency =
    "outputLatency" in ctx && typeof ctx.outputLatency === "number" ? ctx.outputLatency : 0;
  return Math.round((ctx.baseLatency + outputLatency) * 1000);
}
