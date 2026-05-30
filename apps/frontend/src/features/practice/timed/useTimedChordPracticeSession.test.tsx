import { startRecordedSession } from "@/audio/sessionRecording";
import { getChord } from "@/data/chords";
import { syncLearningSessionOrQueue } from "@/storage/pending-backend-sync";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type TimedChordPracticeConfig,
  useTimedChordPracticeSession,
} from "./useTimedChordPracticeSession";

const engineMock = vi.hoisted(() => {
  type Handler = (event: unknown) => void;
  const handlers = new Map<string, Set<Handler>>();
  const ctx = { currentTime: 0 };
  const stop = vi.fn(async () => {});
  const on = vi.fn((type: string, handler: Handler) => {
    const bucket = handlers.get(type) ?? new Set<Handler>();
    bucket.add(handler);
    handlers.set(type, bucket);
    return () => bucket.delete(handler);
  });
  return {
    ctx,
    stop,
    on,
    emit(type: string, event: unknown) {
      for (const handler of handlers.get(type) ?? []) handler(event);
    },
    reset() {
      handlers.clear();
      ctx.currentTime = 0;
      stop.mockClear();
      on.mockClear();
    },
  };
});

const metronomeMock = vi.hoisted(() => ({
  instances: [] as Array<{ emitBeat: (beat: number) => void }>,
}));

const progressMock = vi.hoisted(() => ({
  recordTransition: vi.fn(async () => {}),
  saveSession: vi.fn(async () => {}),
}));

let rafCallback: FrameRequestCallback | null = null;

vi.mock("@/audio/useAudioEngine", () => {
  const engine = {
    start: vi.fn(async () => {}),
    stop: engineMock.stop,
    setInputDeviceId: vi.fn(async () => {}),
    on: engineMock.on,
    state: "running",
    ctx: engineMock.ctx,
    mediaStream: null,
    inputDeviceId: null,
    activeInput: null,
    onStateChange: vi.fn(() => () => {}),
  };
  return {
    ensureEngineStarted: vi.fn(async () => engine),
    getEngine: vi.fn(() => engine),
  };
});

vi.mock("@/audio/sessionRecording", () => ({
  startRecordedSession: vi.fn(async () => null),
}));

vi.mock("@/storage/pending-backend-sync", () => ({
  syncLearningSessionOrQueue: vi.fn(async () => ({
    synced: false,
    queued: true,
    error: "offline",
  })),
}));

vi.mock("@/storage/progress-store", () => ({
  useProgress: vi.fn((selector: (state: typeof progressMock) => unknown) => selector(progressMock)),
}));

vi.mock("../metronome", () => {
  type Options = {
    bpm: number;
    audible: boolean;
    volume: number;
    onBeat: (info: { beat: number; tAudio: number }) => void;
  };

  class MockMetronome {
    startedAtAudioTime: number | null = null;

    constructor(private options: Options) {
      metronomeMock.instances.push(this);
    }

    setOptions(patch: Partial<Options>): void {
      this.options = { ...this.options, ...patch };
    }

    start(ctx: { currentTime: number }): void {
      this.startedAtAudioTime = ctx.currentTime + 0.1;
    }

    stop(): void {}

    emitBeat(beat: number): void {
      const secondsPerBeat = 60 / this.options.bpm;
      this.options.onBeat({
        beat,
        tAudio: (this.startedAtAudioTime ?? 0) + beat * secondsPerBeat,
      });
    }
  }

  return { Metronome: MockMetronome };
});

describe("useTimedChordPracticeSession count-in", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    rafCallback = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      rafCallback = callback;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    engineMock.reset();
    metronomeMock.instances.length = 0;
    progressMock.recordTransition.mockClear();
    progressMock.saveSession.mockClear();
    vi.mocked(startRecordedSession).mockClear();
    vi.mocked(syncLearningSessionOrQueue).mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("shows a count-in and ignores strums before scored beat zero", async () => {
    const { result } = renderHook(() => useTimedChordPracticeSession(configWithCountIn(4)));

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.running).toBe(true);
    expect(result.current.phase).toBe("count-in");
    expect(result.current.countInRemainingBeats).toBe(4);
    expect(result.current.playheadBeat).toBe(0);
    expect(result.current.timelineBeat).toBe(-4);

    act(() => {
      engineMock.ctx.currentTime = 1.1;
      runAnimationFrame();
    });

    expect(result.current.timelineBeat).toBeCloseTo(-2);
    expect(result.current.playheadBeat).toBe(0);

    act(() => {
      engineMock.emit("onset", { type: "onset", strength: 1, t: 1 });
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.attempts).toEqual([]);
    expect(result.current.strumMarkers).toEqual([]);

    act(() => {
      metronomeMock.instances[0]?.emitBeat(4);
    });

    expect(result.current.phase).toBe("scoring");
    expect(result.current.countInRemainingBeats).toBe(0);
    expect(result.current.playheadBeat).toBe(0);
  });

  it("starts in the scoring phase when count-in is off", async () => {
    const { result } = renderHook(() => useTimedChordPracticeSession(configWithCountIn(0)));

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.phase).toBe("scoring");
    expect(result.current.countInRemainingBeats).toBe(0);
    expect(result.current.timelineBeat).toBe(0);
  });

  it("keeps microphone identifiers out of recording metadata", async () => {
    const { result } = renderHook(() => useTimedChordPracticeSession(configWithCountIn(0)));

    await act(async () => {
      await result.current.start();
    });

    expect(vi.mocked(startRecordedSession)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(startRecordedSession).mock.calls[0]?.[0].metadata).not.toHaveProperty(
      "audioInputDeviceId",
    );
  });

  it("uses one client session id for local history and queued backend sync", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => useTimedChordPracticeSession(configWithCountIn(0)));

    await act(async () => {
      await result.current.start();
    });

    const startPayload = vi.mocked(startRecordedSession).mock.calls[0]?.[0];
    expect(startPayload?.id).toEqual(expect.any(String));
    expect(startPayload?.startedAtIso).toEqual(expect.any(String));

    await act(async () => {
      await result.current.stop();
    });

    expect(progressMock.saveSession).toHaveBeenCalledWith(
      expect.objectContaining({
        id: startPayload?.id,
        startedAtIso: startPayload?.startedAtIso,
        drillType: "timed-chord",
      }),
    );
    expect(syncLearningSessionOrQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: startPayload?.id,
        activityType: "practice_drill",
        startedAtIso: startPayload?.startedAtIso,
        metadata: expect.objectContaining({
          practiceMode: "timed_chord_practice",
          bpm: 120,
          countInBeats: 0,
        }),
      }),
      expect.anything(),
    );
  });
});

function runAnimationFrame() {
  if (!rafCallback) throw new Error("requestAnimationFrame was not scheduled");
  rafCallback(0);
}

function configWithCountIn(countInBeats: TimedChordPracticeConfig["countInBeats"]) {
  const a = getChord("A");
  const d = getChord("D");
  if (!a || !d) throw new Error("test chords missing");
  return {
    chords: [a, d],
    bpm: 120,
    beatsPerChord: 2,
    order: "forward",
    sessionLength: 4,
    countInBeats,
  } satisfies TimedChordPracticeConfig;
}
