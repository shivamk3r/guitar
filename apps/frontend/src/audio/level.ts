export function normalizeInputLevel(input: { rms: number; peak: number }): number {
  const rms = clampUnit(input.rms);
  const peak = clampUnit(input.peak);
  const signal = Math.max(rms * 6, peak * 0.8);
  return clampUnit(Math.sqrt(signal));
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
