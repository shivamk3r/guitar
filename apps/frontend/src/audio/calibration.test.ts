import { describe, expect, it } from "vitest";
import {
  calibrationGuidance,
  calibrationQualityLabel,
  classifyCalibrationQuality,
  runCalibration,
} from "./calibration";
import type { AudioEngine } from "./engine";
import type { AudioEventMap, AudioEventType } from "./events";

describe("calibration", () => {
  it("classifies microphone input levels", () => {
    expect(classifyCalibrationQuality({ peak: 0, meanRms: 0 })).toBe("silent");
    expect(classifyCalibrationQuality({ peak: 0.02, meanRms: 0.004 })).toBe("quiet");
    expect(classifyCalibrationQuality({ peak: 0.4, meanRms: 0.08 })).toBe("good");
    expect(classifyCalibrationQuality({ peak: 0.99, meanRms: 0.3 })).toBe("clipping");
  });

  it("summarizes calibration guidance for learner-facing UI", () => {
    expect(calibrationQualityLabel("good")).toBe("Good");
    expect(calibrationGuidance({ quality: "quiet" })).toContain("Signal is low");
    expect(calibrationGuidance({ quality: "clipping" })).toContain("Lower input gain");
  });

  it("runs against engine level samples and estimates browser latency", async () => {
    const engine = fakeEngine([
      { rms: 0.04, peak: 0.12 },
      { rms: 0.08, peak: 0.25 },
    ]);

    const result = await runCalibration(engine, 0);

    expect(result.quality).toBe("good");
    expect(result.peak).toBe(0.25);
    expect(result.meanRms).toBeCloseTo(0.06);
    expect(result.samples).toBe(2);
    expect(result.latencyMs).toBe(20);
  });
});

function fakeEngine(samples: { rms: number; peak: number }[]): AudioEngine {
  return {
    ctx: { baseLatency: 0.012, outputLatency: 0.008 } as AudioContext,
    on<T extends AudioEventType>(type: T, handler: (event: AudioEventMap[T]) => void) {
      if (type === "level") {
        const levelHandler = handler as (event: AudioEventMap["level"]) => void;
        samples.forEach((sample, index) =>
          levelHandler({ type: "level", t: index / 60, rms: sample.rms, peak: sample.peak }),
        );
      }
      return () => {};
    },
  } as AudioEngine;
}
