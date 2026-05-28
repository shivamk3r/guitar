export const TIMED_PRACTICE_VISIBLE_SECONDS = 10;

export interface CenteredBeatWindow {
  startBeat: number;
  endBeat: number;
  visibleBeats: number;
}

export function getVisibleBeatCount(bpm: number): number {
  const safeBpm = Math.max(1, bpm);
  return Math.max(4, Math.round((TIMED_PRACTICE_VISIBLE_SECONDS * safeBpm) / 60));
}

export function getCenteredBeatWindow(input: {
  playheadBeat: number;
  visibleBeats: number;
}): CenteredBeatWindow {
  const visibleBeats = Math.max(1, Math.floor(input.visibleBeats));
  const startBeat = input.playheadBeat - visibleBeats / 2;
  return {
    startBeat,
    endBeat: startBeat + visibleBeats,
    visibleBeats,
  };
}

export function beatToTimelinePercent(beat: number, window: CenteredBeatWindow): number {
  return ((beat - window.startBeat) / window.visibleBeats) * 100;
}

export function getVisibleWholeBeats(window: CenteredBeatWindow): number[] {
  const firstBeat = Math.ceil(window.startBeat);
  const lastBeat = Math.floor(window.endBeat);
  const beats: number[] = [];
  for (let beat = firstBeat; beat <= lastBeat; beat++) beats.push(beat);
  return beats;
}

export function getVisibleTimelineBeats(input: {
  window: CenteredBeatWindow;
  minBeat: number;
  maxBeat: number;
}): number[] {
  const minBeat = Math.ceil(input.minBeat);
  const maxBeat = Math.floor(input.maxBeat);
  return getVisibleWholeBeats(input.window).filter((beat) => beat >= minBeat && beat <= maxBeat);
}

export function formatTimelineBeatLabel(beat: number): string {
  return `${beat}`;
}

export function isTimelinePercentVisible(percent: number, overscanPercent = 8): boolean {
  return percent >= -overscanPercent && percent <= 100 + overscanPercent;
}
