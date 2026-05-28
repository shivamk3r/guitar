import { describe, expect, it } from "vitest";
import {
  beatToTimelinePercent,
  formatTimelineBeatLabel,
  getCenteredBeatWindow,
  getVisibleBeatCount,
  getVisibleTimelineBeats,
  getVisibleWholeBeats,
} from "./timeline-view";

describe("timeline-view", () => {
  it("shows about ten seconds as a whole number of beats", () => {
    expect(getVisibleBeatCount(60)).toBe(10);
    expect(getVisibleBeatCount(72)).toBe(12);
    expect(getVisibleBeatCount(84)).toBe(14);
    expect(getVisibleBeatCount(40)).toBe(7);
  });

  it("keeps the playhead centered while beats move left", () => {
    const firstWindow = getCenteredBeatWindow({ playheadBeat: 8, visibleBeats: 12 });
    const nextWindow = getCenteredBeatWindow({ playheadBeat: 9, visibleBeats: 12 });

    expect(beatToTimelinePercent(8, firstWindow)).toBe(50);
    expect(beatToTimelinePercent(8, nextWindow)).toBeCloseTo(41.67, 2);
  });

  it("returns whole beat grid lines for the visible window", () => {
    const window = getCenteredBeatWindow({ playheadBeat: 3.25, visibleBeats: 10 });

    expect(window).toEqual({ startBeat: -1.75, endBeat: 8.25, visibleBeats: 10 });
    expect(getVisibleWholeBeats(window)).toEqual([-1, 0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("keeps negative count-in beats in the centered timeline window", () => {
    const window = getCenteredBeatWindow({ playheadBeat: -4, visibleBeats: 12 });
    const labels = getVisibleTimelineBeats({
      window,
      minBeat: -4,
      maxBeat: 8,
    }).map(formatTimelineBeatLabel);

    expect(window).toEqual({ startBeat: -10, endBeat: 2, visibleBeats: 12 });
    expect(labels).toEqual(["-4", "-3", "-2", "-1", "0", "1", "2"]);
    expect(beatToTimelinePercent(-4, window)).toBe(50);
  });
});
