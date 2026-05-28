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
  let quality: CalibrationQuality;
  if (peak < 0.005) quality = "silent";
  else if (peak < 0.03) quality = "quiet";
  else if (peak > 0.98) quality = "clipping";
  else quality = "good";
  return { quality, peak, meanRms, samples };
}
