import { ensureEngineStarted, getEngine } from "@/audio/useAudioEngine";
import type { ChordDef } from "@/data/chords";
import {
  classifyStrings,
  expectedRingsMask,
  matchChord,
} from "@/features/chord-library/chord-detection";
import { useProgress } from "@/storage/progress-store";
import { useSettings } from "@/storage/settings-store";
import { useCallback, useEffect, useRef, useState } from "react";
import { Metronome } from "../metronome";
import { type DrillEvent, usePractice } from "../practice-store";
import { type ScoredEvent, scoreEvent } from "../scoring";

export interface DrillConfig {
  chords: ChordDef[];
  beatsPerChange: number;
  bpm: number;
}

export interface UseDrillSession {
  bpm: number;
  setBpm: (n: number) => void;
  running: boolean;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  currentBeat: number;
  currentIndex: number;
  lastEvent: {
    expected: ChordDef;
    detected: ChordDef | null;
    scored: ScoredEvent;
    stringStates: ReturnType<typeof classifyStrings>;
  } | null;
  error: string | null;
}

const CAPTURE_MS = 300;
const TIMING_WINDOW_MS = 250;

export function useDrillSession(config: DrillConfig): UseDrillSession {
  const [bpm, setBpm] = useState(config.bpm);
  const [running, setRunning] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [lastEvent, setLastEvent] = useState<UseDrillSession["lastEvent"]>(null);
  const [error, setError] = useState<string | null>(null);
  const metronomeRef = useRef<Metronome | null>(null);
  const captureRef = useRef<{ start: number; frames: Float32Array[] } | null>(null);
  const chordIndexRef = useRef(0);
  const chordsRef = useRef(config.chords);
  const beatsPerChangeRef = useRef(config.beatsPerChange);
  const settings = useSettings();
  const recordEvent = usePractice((s) => s.recordEvent);
  const recordTransition = useProgress((s) => s.recordTransition);

  chordsRef.current = config.chords;
  beatsPerChangeRef.current = config.beatsPerChange;

  const emitScore = useCallback(
    (deltaMs: number, avgChroma: Float32Array) => {
      const chords = chordsRef.current;
      const expected = chords[chordIndexRef.current % chords.length]!;
      const match = matchChord(avgChroma, expected);
      const stringStates = classifyStrings(expected, avgChroma);
      const scored = scoreEvent({
        detectedChordId: match.chord?.id,
        expectedChordId: expected.id,
        sameFamily: match.sameFamily,
        strings: stringStates,
        expectedRings: expectedRingsMask(expected),
        timingApplies: true,
        timingDeltaMs: deltaMs,
        strumDetected: true,
      });
      const event: DrillEvent = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        atIso: new Date().toISOString(),
        expectedChordId: expected.id,
        detectedChordId: match.chord?.id ?? null,
        score: scored,
        bpm,
      };
      recordEvent(event);
      setLastEvent({ expected, detected: match.chord, scored, stringStates });

      // Record transition metric (prev -> expected) when chord just advanced
      const prev = chords[(chordIndexRef.current - 1 + chords.length) % chords.length];
      if (prev && prev.id !== expected.id) {
        recordTransition(prev.id, expected.id, bpm, scored.score).catch((err) =>
          console.error("recordTransition failed", err),
        );
      }
    },
    [bpm, recordEvent, recordTransition],
  );

  const start = useCallback(async () => {
    setError(null);
    try {
      const engine = await ensureEngineStarted();
      const ctx = engine.ctx;
      if (!ctx) throw new Error("audio context not available");
      const metronome = new Metronome({
        bpm,
        audible: settings.metronomeAudible,
        volume: settings.metronomeVolume,
        onBeat: ({ beat }) => {
          setCurrentBeat(beat);
          const bpc = beatsPerChangeRef.current;
          const idx = Math.floor(beat / bpc);
          if (idx !== chordIndexRef.current) {
            chordIndexRef.current = idx;
            setCurrentIndex(idx % chordsRef.current.length);
          }
        },
      });
      metronomeRef.current = metronome;
      usePractice.getState().reset();
      metronome.start(ctx);
      setRunning(true);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Could not start drill.");
    }
  }, [bpm, settings.metronomeAudible, settings.metronomeVolume]);

  const stop = useCallback(async () => {
    metronomeRef.current?.stop();
    metronomeRef.current = null;
    await getEngine().stop();
    setRunning(false);
    chordIndexRef.current = 0;
    setCurrentIndex(0);
    setCurrentBeat(0);
  }, []);

  // Subscribe to audio events while running
  useEffect(() => {
    if (!running) return;
    const engine = getEngine();
    const unsubOnset = engine.on("onset", (e) => {
      const beatInfo = metronomeRef.current?.beatAt(e.t);
      if (!beatInfo) return;
      if (Math.abs(beatInfo.deltaMs) > TIMING_WINDOW_MS) return;
      captureRef.current = { start: e.t, frames: [] };
      window.setTimeout(() => {
        const capture = captureRef.current;
        captureRef.current = null;
        if (!capture || capture.frames.length === 0) return;
        const avg = new Float32Array(12);
        for (const f of capture.frames)
          for (let i = 0; i < 12; i++) avg[i] = (avg[i] ?? 0) + (f[i] ?? 0);
        for (let i = 0; i < 12; i++) avg[i] = (avg[i] ?? 0) / capture.frames.length;
        let n = 0;
        for (let i = 0; i < 12; i++) n += (avg[i] ?? 0) * (avg[i] ?? 0);
        n = Math.sqrt(n);
        if (n > 1e-8) for (let i = 0; i < 12; i++) avg[i] = (avg[i] ?? 0) / n;
        emitScore(beatInfo.deltaMs, avg);
      }, CAPTURE_MS);
    });
    const unsubChroma = engine.on("chroma", (e) => {
      if (captureRef.current) captureRef.current.frames.push(e.chroma);
    });
    return () => {
      unsubOnset();
      unsubChroma();
    };
  }, [running, emitScore]);

  // Keep metronome BPM synced if user changes it during a running drill
  useEffect(() => {
    metronomeRef.current?.setOptions({
      bpm,
      audible: settings.metronomeAudible,
      volume: settings.metronomeVolume,
    });
  }, [bpm, settings.metronomeAudible, settings.metronomeVolume]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      metronomeRef.current?.stop();
    };
  }, []);

  return {
    bpm,
    setBpm,
    running,
    start,
    stop,
    currentBeat,
    currentIndex,
    lastEvent,
    error,
  };
}
