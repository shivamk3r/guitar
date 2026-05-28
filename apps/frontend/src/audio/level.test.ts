import { describe, expect, it } from "vitest";
import { normalizeInputLevel } from "./level";

describe("normalizeInputLevel", () => {
  it("maps quiet and loud input onto a clamped meter range", () => {
    expect(normalizeInputLevel({ rms: 0, peak: 0 })).toBe(0);
    expect(normalizeInputLevel({ rms: 0.01, peak: 0.02 })).toBeGreaterThan(0);
    expect(normalizeInputLevel({ rms: 0.2, peak: 0.6 })).toBeLessThanOrEqual(1);
    expect(normalizeInputLevel({ rms: 10, peak: 10 })).toBe(1);
  });

  it("treats invalid level samples as silence", () => {
    expect(normalizeInputLevel({ rms: Number.NaN, peak: Number.NaN })).toBe(0);
  });
});
