import { beforeEach, describe, expect, it } from "vitest";
import { useTuner } from "./tuner-store";

describe("tuner-store", () => {
  beforeEach(() => {
    useTuner.getState().reset();
  });

  it("starts idle with no reading", () => {
    const s = useTuner.getState();
    expect(s.status).toBe("idle");
    expect(s.note).toBeNull();
    expect(s.inTune).toBe(false);
  });

  it("ingesting a pitch populates the note", () => {
    useTuner.getState().ingestPitch(440, 0.95, 1);
    const s = useTuner.getState();
    expect(s.note?.name).toBe("A");
    expect(s.hz).toBe(440);
    expect(s.status).toBe("detecting");
  });

  it("locks as in-tune only after holding ±5¢ for ≥500ms", () => {
    const tuner = useTuner.getState();
    // First reading — lock starts but inTune=false
    tuner.ingestPitch(440, 0.95, 1);
    expect(useTuner.getState().inTune).toBe(false);
    // Same note, 300ms later — still not locked
    tuner.ingestPitch(440, 0.95, 1.3);
    expect(useTuner.getState().inTune).toBe(false);
    // 600ms later — locked
    tuner.ingestPitch(440, 0.95, 1.6);
    expect(useTuner.getState().inTune).toBe(true);
  });

  it("resets the lock when the note changes", () => {
    const tuner = useTuner.getState();
    tuner.ingestPitch(440, 0.95, 1);
    tuner.ingestPitch(440, 0.95, 1.6);
    expect(useTuner.getState().inTune).toBe(true);
    tuner.ingestPitch(880, 0.95, 1.7);
    expect(useTuner.getState().inTune).toBe(false);
  });

  it("does not lock when cents are too far off", () => {
    const tuner = useTuner.getState();
    // 20 cents sharp → outside ±5 band
    const hz = 440 * 2 ** (20 / 1200);
    tuner.ingestPitch(hz, 0.95, 1);
    tuner.ingestPitch(hz, 0.95, 1.6);
    expect(useTuner.getState().inTune).toBe(false);
  });
});
