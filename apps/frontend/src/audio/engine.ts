import { Emitter } from "@/lib/events";
import type { AudioEvent, AudioEventMap, AudioEventType } from "./events";

export type EngineState = "idle" | "starting" | "running" | "stopping" | "error";

export interface AudioEngineOptions {
  deviceId?: string;
  sampleRate?: number;
}

export interface AudioEngine {
  start(): Promise<void>;
  stop(): Promise<void>;
  on<T extends AudioEventType>(type: T, handler: (e: AudioEventMap[T]) => void): () => void;
  readonly state: EngineState;
  readonly ctx: AudioContext | null;
  readonly mediaStream: MediaStream | null;
  onStateChange(listener: (state: EngineState) => void): () => void;
}

const WORKLET_URL = "/analyzer.worklet.js";

export function createAudioEngine(options: AudioEngineOptions = {}): AudioEngine {
  const emitter = new Emitter<AudioEventMap>();
  const stateListeners = new Set<(s: EngineState) => void>();
  let state: EngineState = "idle";
  let ctx: AudioContext | null = null;
  let stream: MediaStream | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let analyzer: AudioWorkletNode | null = null;
  let sinkGain: GainNode | null = null;

  function setState(next: EngineState): void {
    state = next;
    for (const l of stateListeners) l(next);
  }

  async function start(): Promise<void> {
    if (state === "running" || state === "starting") return;
    setState("starting");
    try {
      ctx = new AudioContext({
        sampleRate: options.sampleRate ?? 48000,
        latencyHint: "interactive",
      });
      // AudioContext may start suspended if called before user gesture — resume defensively.
      if (ctx.state === "suspended") await ctx.resume();

      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: options.deviceId,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
          channelCount: 1,
        },
      });

      await ctx.audioWorklet.addModule(WORKLET_URL);
      analyzer = new AudioWorkletNode(ctx, "guitar-analyzer", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      analyzer.port.onmessage = (event) => {
        const data = event.data as AudioEvent;
        // biome-ignore lint/suspicious/noExplicitAny: dispatching discriminated union
        emitter.emit(data.type, data as any);
      };
      analyzer.port.postMessage({ type: "start" });

      source = ctx.createMediaStreamSource(stream);
      sinkGain = ctx.createGain();
      sinkGain.gain.value = 0; // keep the graph alive without monitoring mic
      source.connect(analyzer);
      analyzer.connect(sinkGain);
      sinkGain.connect(ctx.destination);

      setState("running");
    } catch (err) {
      await cleanup();
      setState("error");
      throw err;
    }
  }

  async function cleanup(): Promise<void> {
    try {
      if (analyzer) {
        analyzer.port.postMessage({ type: "stop" });
        analyzer.disconnect();
      }
      if (source) source.disconnect();
      if (sinkGain) sinkGain.disconnect();
      if (stream) for (const t of stream.getTracks()) t.stop();
      if (ctx) await ctx.close();
    } finally {
      analyzer = null;
      source = null;
      sinkGain = null;
      stream = null;
      ctx = null;
    }
  }

  async function stop(): Promise<void> {
    if (state === "idle" || state === "stopping") return;
    setState("stopping");
    await cleanup();
    setState("idle");
  }

  return {
    start,
    stop,
    on: <T extends AudioEventType>(type: T, handler: (e: AudioEventMap[T]) => void) =>
      emitter.on(type, handler),
    get state() {
      return state;
    },
    get ctx() {
      return ctx;
    },
    get mediaStream() {
      return stream;
    },
    onStateChange(listener) {
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },
  };
}
