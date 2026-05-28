import { useEffect, useState } from "react";
import { type AudioEngine, type EngineState, createAudioEngine } from "./engine";

let singleton: AudioEngine | null = null;

export function getEngine(): AudioEngine {
  if (!singleton) singleton = createAudioEngine();
  return singleton;
}

/** Subscribes to engine state and returns the current value. */
export function useEngineState(): EngineState {
  const engine = getEngine();
  const [state, setState] = useState<EngineState>(engine.state);
  useEffect(() => {
    setState(engine.state);
    return engine.onStateChange(setState);
  }, [engine]);
  return state;
}

export async function ensureEngineStarted(): Promise<AudioEngine> {
  const engine = getEngine();
  if (engine.state === "running" || engine.state === "starting") return engine;
  await engine.start();
  return engine;
}
