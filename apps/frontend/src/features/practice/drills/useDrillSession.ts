import {
  type ChromaFrame,
  aggregateChromaFrames,
  classifyStrings,
  expectedRingsMask,
  verifyChord,
} from "@/audio/chord-detection";
import { type ActiveRecordedSession, startRecordedSession } from "@/audio/sessionRecording";
import { ensureEngineStarted, getEngine } from "@/audio/useAudioEngine";
import { type ChordDef, getChord } from "@/data/chords";
import { syncLearningSessionOrQueue } from "@/storage/pending-backend-sync";
import { useProgress } from "@/storage/progress-store";
import { useSettings } from "@/storage/settings-store";
import { useCallback, useEffect, useRef, useState } from "react";
import { Metronome } from "../metronome";
import { type DrillEvent, usePractice } from "../practice-store";
import { type ScoredEvent, scoreEvent } from "../scoring";
import { buildPracticeDrillSessionSummary } from "./drill-session";

export interface DrillConfig {
  chords: ChordDef[];
  beatsPerChange: number;
  bpm: number;
  practiceMode?: string;
  title?: string;
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

interface DrillAttemptMetadata {
  atIso: string;
  expectedChordId: string;
  detectedChordId: string | null;
  score: ScoredEvent;
  bpm: number;
  timingDeltaMs: number;
  stringStates: ReturnType<typeof classifyStrings>;
}

export function useDrillSession(config: DrillConfig): UseDrillSession {
  const [bpm, setBpm] = useState(config.bpm);
  const [running, setRunning] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [lastEvent, setLastEvent] = useState<UseDrillSession["lastEvent"]>(null);
  const [error, setError] = useState<string | null>(null);
  const metronomeRef = useRef<Metronome | null>(null);
  const recordingRef = useRef<ActiveRecordedSession | null>(null);
  const captureRef = useRef<{ start: number; frames: ChromaFrame[] } | null>(null);
  const chordIndexRef = useRef(0);
  const chordsRef = useRef(config.chords);
  const beatsPerChangeRef = useRef(config.beatsPerChange);
  const attemptsRef = useRef<DrillAttemptMetadata[]>([]);
  const sessionRef = useRef<{ id: string; startedAtIso: string } | null>(null);
  const settings = useSettings();
  const recordEvent = usePractice((s) => s.recordEvent);
  const recordTransition = useProgress((s) => s.recordTransition);
  const saveSession = useProgress((s) => s.saveSession);

  chordsRef.current = config.chords;
  beatsPerChangeRef.current = config.beatsPerChange;

  const emitScore = useCallback(
    (deltaMs: number, avgChroma: Float32Array) => {
      const chords = chordsRef.current;
      const expected = chords[chordIndexRef.current % chords.length]!;
      const verification = verifyChord(avgChroma, expected);
      const detected =
        verification.status === "accepted"
          ? expected
          : verification.status === "rejected"
            ? (getChord(verification.bestAlternativeChordId ?? "") ?? null)
            : null;
      const stringStates = classifyStrings(expected, avgChroma);
      const scored = scoreEvent({
        detectedChordId: detected?.id,
        expectedChordId: expected.id,
        sameFamily: detected != null && detected.root === expected.root,
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
        detectedChordId: detected?.id ?? null,
        score: scored,
        bpm,
      };
      recordEvent(event);
      setLastEvent({ expected, detected, scored, stringStates });
      attemptsRef.current = [
        ...attemptsRef.current,
        {
          atIso: event.atIso,
          expectedChordId: expected.id,
          detectedChordId: detected?.id ?? null,
          score: scored,
          bpm,
          timingDeltaMs: deltaMs,
          stringStates,
        },
      ];

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
      const session = { id: crypto.randomUUID(), startedAtIso: new Date().toISOString() };
      const metronome = new Metronome({
        bpm,
        audible: settings.metronomeAudible,
        mode: settings.metronomeMode,
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
      attemptsRef.current = [];
      sessionRef.current = session;
      recordingRef.current = await startRecordedSession({
        id: session.id,
        startedAtIso: session.startedAtIso,
        engine,
        activityType: "practice_drill",
        settings,
        updateSettings: settings.update,
        metadata: {
          practiceMode: config.practiceMode ?? "chord_change_drill",
          title: config.title,
          bpm,
          chords: chordsRef.current.map((chord) => chord.id),
          chordNames: chordsRef.current.map((chord) => chord.name),
          beatsPerChange: beatsPerChangeRef.current,
        },
      }).catch((err) => {
        console.error("session recording failed", err);
        return null;
      });
      metronome.start(ctx);
      setRunning(true);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Could not start drill.");
    }
  }, [bpm, config.practiceMode, config.title, settings]);

  const stop = useCallback(async () => {
    metronomeRef.current?.stop();
    metronomeRef.current = null;
    const endedAtIso = new Date().toISOString();
    const session = sessionRef.current ?? {
      id: crypto.randomUUID(),
      startedAtIso: new Date(Date.now() - 60_000).toISOString(),
    };
    const practiceMode = config.practiceMode ?? "chord_change_drill";
    const metadata = buildDrillSessionMetadata({
      attempts: attemptsRef.current,
      beatsPerChange: beatsPerChangeRef.current,
      bpm,
      chords: chordsRef.current,
      practiceMode,
      title: config.title,
    });
    const hadBackendSession = recordingRef.current !== null;
    let backendStopFailed = false;
    try {
      await recordingRef.current?.stop(metadata);
    } catch (err) {
      backendStopFailed = true;
      console.error("session recording upload failed", err);
    } finally {
      recordingRef.current = null;
    }
    try {
      await saveSession(
        buildPracticeDrillSessionSummary({
          id: session.id,
          startedAtIso: session.startedAtIso,
          endedAtIso,
          practiceMode,
          chords: chordsRef.current,
          bpm,
          attempts: attemptsRef.current,
        }),
      );
    } catch (err) {
      console.error("local drill session save failed", err);
    }
    if (!hadBackendSession || backendStopFailed) {
      const syncResult = await syncLearningSessionOrQueue(
        {
          sessionId: session.id,
          activityType: "practice_drill",
          startedAtIso: session.startedAtIso,
          endedAtIso,
          metadata,
        },
        settings,
      );
      if (!syncResult.synced) {
        console.error("practice drill backend sync queued", syncResult.error);
      }
    }
    await getEngine().stop();
    setRunning(false);
    chordIndexRef.current = 0;
    setCurrentIndex(0);
    setCurrentBeat(0);
    sessionRef.current = null;
  }, [bpm, config.practiceMode, config.title, saveSession, settings]);

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
        const aggregate = aggregateChromaFrames(capture.frames);
        if (!aggregate.hasSignal) return;
        emitScore(beatInfo.deltaMs, aggregate.avgChroma);
      }, CAPTURE_MS);
    });
    const unsubChroma = engine.on("chroma", (e) => {
      if (captureRef.current)
        captureRef.current.frames.push({ chroma: e.chroma, rms: e.rms, t: e.t });
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
      mode: settings.metronomeMode,
      volume: settings.metronomeVolume,
    });
  }, [bpm, settings.metronomeAudible, settings.metronomeMode, settings.metronomeVolume]);

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

function buildDrillSessionMetadata(input: {
  attempts: readonly DrillAttemptMetadata[];
  beatsPerChange: number;
  bpm: number;
  chords: readonly ChordDef[];
  practiceMode: string;
  title?: string;
}): Record<string, unknown> {
  const averageScore =
    input.attempts.length === 0
      ? null
      : input.attempts.reduce((total, attempt) => total + attempt.score.score, 0) /
        input.attempts.length;
  return {
    completionStatus: input.attempts.length > 0 ? "completed" : "stopped",
    resultSummary:
      averageScore == null
        ? "No attempts scored"
        : `${averageScore.toFixed(1)}/10 average across ${input.attempts.length} attempts`,
    score: averageScore,
    scoreSummary: {
      attempts: input.attempts.length,
      averageScore,
      bestScore:
        input.attempts.length === 0
          ? null
          : Math.max(...input.attempts.map((attempt) => attempt.score.score)),
    },
    practiceMode: input.practiceMode,
    title: input.title,
    bpm: input.bpm,
    chords: input.chords.map((chord) => chord.id),
    chordNames: input.chords.map((chord) => chord.name),
    beatsPerChange: input.beatsPerChange,
    attempts: input.attempts,
  };
}
