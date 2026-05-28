import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAudioEngine } from "./engine";

const getUserMedia = vi.fn();

class FakeAudioNode {
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeGainNode extends FakeAudioNode {
  gain = { value: 1 };
}

class FakeAudioContext {
  state = "running";
  destination = new FakeAudioNode();
  audioWorklet = {
    addModule: vi.fn(async () => {}),
  };

  resume = vi.fn(async () => {});
  close = vi.fn(async () => {});
  createMediaStreamSource = vi.fn(() => new FakeAudioNode());
  createGain = vi.fn(() => new FakeGainNode());
}

class FakeAudioWorkletNode extends FakeAudioNode {
  port = {
    onmessage: null as ((event: MessageEvent) => void) | null,
    postMessage: vi.fn(),
  };
}

describe("createAudioEngine input device selection", () => {
  beforeEach(() => {
    getUserMedia.mockReset();
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.stubGlobal("AudioWorkletNode", FakeAudioWorkletNode);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests the selected input device when starting", async () => {
    getUserMedia.mockResolvedValueOnce(createStream("USB Interface", "usb-1"));
    const engine = createAudioEngine();

    await engine.setInputDeviceId("usb-1");
    await engine.start();

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: expect.objectContaining({ deviceId: { exact: "usb-1" } }),
    });
    expect(engine.activeInput).toEqual({ deviceId: "usb-1", label: "USB Interface" });
    expect(engine.inputFallback).toBeNull();

    await engine.stop();
  });

  it("falls back to browser default when the selected input is unavailable", async () => {
    getUserMedia
      .mockRejectedValueOnce(namedError("OverconstrainedError"))
      .mockResolvedValueOnce(createStream("Built-in Microphone", "default-1"));
    const engine = createAudioEngine();

    await engine.setInputDeviceId("missing-device");
    await engine.start();

    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(getUserMedia.mock.calls[0]?.[0]).toEqual({
      audio: expect.objectContaining({ deviceId: { exact: "missing-device" } }),
    });
    expect(getUserMedia.mock.calls[1]?.[0]).toEqual({
      audio: expect.not.objectContaining({ deviceId: expect.anything() }),
    });
    expect(engine.activeInput).toEqual({ deviceId: "default-1", label: "Built-in Microphone" });
    expect(engine.inputFallback).toEqual({
      requestedDeviceId: "missing-device",
      reason: "unavailable",
    });

    await engine.stop();
  });

  it("does not fallback when the browser denies microphone permission", async () => {
    getUserMedia.mockRejectedValueOnce(namedError("NotAllowedError"));
    const engine = createAudioEngine();

    await engine.setInputDeviceId("usb-1");
    await expect(engine.start()).rejects.toThrow("NotAllowedError");

    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it("blocks switching while audio is active", async () => {
    getUserMedia.mockResolvedValueOnce(createStream("USB Interface", "usb-1"));
    const engine = createAudioEngine();

    await engine.start();

    await expect(engine.setInputDeviceId("other-device")).rejects.toThrow(
      "Cannot switch microphone while audio is active.",
    );

    await engine.stop();
  });
});

function createStream(label: string, deviceId: string): MediaStream {
  const track = {
    label,
    getSettings: () => ({ deviceId }),
    stop: vi.fn(),
  };
  return {
    getAudioTracks: () => [track],
    getTracks: () => [track],
  } as unknown as MediaStream;
}

function namedError(name: string): Error {
  const error = new Error(name);
  error.name = name;
  return error;
}
