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
import type { TimedPracticeCountInBeats } from "@/storage/preferences";
import { useProgress } from "@/storage/progress-store";
import { useSettings } from "@/storage/settings-store";
import { useCallback, useEffect, useRef, useState } from "react";
import { Metronome } from "../metronome";
import { usePractice } from "../practice-store";
import { type StringClass, scoreEvent } from "../scoring";
import {
  type TimedPracticeAttempt,
  type TimedPracticeOrder,
  type TimedPracticePlanItem,
  type TimedPracticeStrumMarker,
  type TimedPracticeSummary,
  buildTimedPracticePlan,
  buildTimedPracticeSessionSummary,
  summarizeTimedPractice,
} from "./timed-practice";

export interface TimedChordPracticeConfig {
  chords: ChordDef[];
  bpm: number;
  beatsPerChord: number;
  order: TimedPracticeOrder;
  sessionLength: number;
  countInBeats: TimedPracticeCountInBeats;
}

export interface TimedChordPracticeSession {
  status: "idle" | "running" | "ended";
  phase: "idle" | "count-in" | "scoring" | "ended";
  running: boolean;
  plan: TimedPracticePlanItem[];
  attempts: TimedPracticeAttempt[];
  strumMarkers: TimedPracticeStrumMarker[];
  summary: TimedPracticeSummary | null;
  playheadBeat: number;
  timelineBeat: number;
  countInRemainingBeats: number;
  currentIndex: number;
  error: string | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

const CAPTURE_MS = 320;
export const TIMED_PRACTICE_WINDOW_MS = 250;

interface ActiveExpected extends TimedPracticePlanItem {
  chord: ChordDef;
  targetAudioTime: number;
}

interface PendingCapture {
  expected: ActiveExpected;
  deltaMs: number;
  detectedAtBeat: number;
  frames: ChromaFrame[];
}

export function useTimedChordPracticeSession(
  config: TimedChordPracticeConfig,
): TimedChordPracticeSession {
  const [status, setStatus] = useState<TimedChordPracticeSession["status"]>("idle");
  const [phase, setPhase] = useState<TimedChordPracticeSession["phase"]>("idle");
  const [plan, setPlan] = useState<TimedPracticePlanItem[]>([]);
  const [attempts, setAttempts] = useState<TimedPracticeAttempt[]>([]);
  const [strumMarkers, setStrumMarkers] = useState<TimedPracticeStrumMarker[]>([]);
  const [summary, setSummary] = useState<TimedPracticeSummary | null>(null);
  const [playheadBeat, setPlayheadBeat] = useState(0);
  const [timelineBeat, setTimelineBeat] = useState(0);
  const [countInRemainingBeats, setCountInRemainingBeats] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const metronomeRef = useRef<Metronome | null>(null);
  const recordingRef = useRef<ActiveRecordedSession | null>(null);
  const sessionRef = useRef<{ id: string; startedAtIso: string } | null>(null);
  const activePlanRef = useRef<ActiveExpected[]>([]);
  const attemptsRef = useRef<TimedPracticeAttempt[]>([]);
  const hitExpectedRef = useRef<Set<number>>(new Set());
  const pendingCapturesRef = useRef<Map<number, PendingCapture>>(new Map());
  const missTimeoutsRef = useRef<number[]>([]);
  const endTimeoutRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const startAudioTimeRef = useRef<number | null>(null);
  const secondsPerBeatRef = useRef(60 / config.bpm);
  const sessionSavedRef = useRef(false);

  const settings = useSettings();
  const recordEvent = usePractice((state) => state.recordEvent);
  const recordTransition = useProgress((state) => state.recordTransition);
  const saveSession = useProgress((state) => state.saveSession);

  secondsPerBeatRef.current = 60 / config.bpm;

  const clearTimers = useCallback(() => {
    for (const timeout of missTimeoutsRef.current) window.clearTimeout(timeout);
    missTimeoutsRef.current = [];
    if (endTimeoutRef.current != null) {
      window.clearTimeout(endTimeoutRef.current);
      endTimeoutRef.current = null;
    }
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const appendMarker = useCallback((marker: TimedPracticeStrumMarker) => {
    setStrumMarkers((current) => [...current, marker].slice(-80));
  }, []);

  const commitAttempt = useCallback(
    (attempt: TimedPracticeAttempt) => {
      const next = [
        ...attemptsRef.current.filter((item) => item.expectedIndex !== attempt.expectedIndex),
        attempt,
      ].sort((a, b) => a.expectedIndex - b.expectedIndex);
      attemptsRef.current = next;
      setAttempts(next);
      recordEvent({
        id: attempt.id,
        atIso: new Date().toISOString(),
        expectedChordId: attempt.chordId,
        detectedChordId: attempt.detectedChordId,
        score: attempt.score,
        bpm: config.bpm,
      });
      if (attempt.previousChordId && attempt.previousChordId !== attempt.chordId) {
        recordTransition(
          attempt.previousChordId,
          attempt.chordId,
          config.bpm,
          attempt.score.score,
        ).catch((err) => console.error("recordTransition failed", err));
      }
    },
    [config.bpm, recordEvent, recordTransition],
  );

  const finishSession = useCallback(async () => {
    if (sessionRef.current === null && recordingRef.current === null && sessionSavedRef.current) {
      return;
    }
    clearTimers();
    pendingCapturesRef.current.clear();
    metronomeRef.current?.stop();
    metronomeRef.current = null;
    const endedAtIso = new Date().toISOString();
    const session = sessionRef.current ?? {
      id: crypto.randomUUID(),
      startedAtIso: new Date(Date.now() - 60_000).toISOString(),
    };
    const finalAttempts = attemptsRef.current;
    const finalSummary = summarizeTimedPractice(finalAttempts);
    const metadata = buildTimedPracticeSessionMetadata({
      attempts: finalAttempts,
      config,
      summary: finalSummary,
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
    await getEngine().stop();

    setSummary(finalSummary);
    setStatus("ended");
    setPhase("ended");
    setCountInRemainingBeats(0);
    setTimelineBeat((beat) => Math.max(0, beat));
    startAudioTimeRef.current = null;
    activePlanRef.current = [];
    pendingCapturesRef.current.clear();

    if (!sessionSavedRef.current) {
      sessionSavedRef.current = true;
      try {
        await saveSession(
          buildTimedPracticeSessionSummary({
            id: session.id,
            startedAtIso: session.startedAtIso,
            endedAtIso,
            chordIds: config.chords.map((chord) => chord.id),
            bpm: config.bpm,
            summary: finalSummary,
          }),
        );
      } catch (err) {
        console.error("save timed practice session failed", err);
      }
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
        console.error("timed practice backend sync queued", syncResult.error);
      }
    }
    sessionRef.current = null;
  }, [clearTimers, config, saveSession, settings]);

  const createMiss = useCallback(
    (expected: ActiveExpected) => {
      if (hitExpectedRef.current.has(expected.index)) return;
      hitExpectedRef.current.add(expected.index);
      const stringStates = expected.chord.playedMidi.map(() => "muted") as StringClass[];
      const scored = scoreEvent({
        detectedChordId: undefined,
        expectedChordId: expected.chordId,
        sameFamily: false,
        strings: stringStates,
        expectedRings: expectedRingsMask(expected.chord),
        timingApplies: true,
        strumDetected: false,
      });
      commitAttempt({
        id: `${Date.now()}-${expected.index}-miss`,
        expectedId: expected.id,
        expectedIndex: expected.index,
        chordId: expected.chordId,
        previousChordId: expected.previousChordId,
        expectedBeat: expected.beat,
        detectedChordId: null,
        detectedAtBeat: null,
        timingDeltaMs: null,
        status: "miss",
        score: scored,
        stringStates,
      });
    },
    [commitAttempt],
  );

  const finishCapture = useCallback(
    (expectedIndex: number) => {
      const capture = pendingCapturesRef.current.get(expectedIndex);
      pendingCapturesRef.current.delete(expectedIndex);
      if (!capture) return;
      const { avgChroma, hasSignal } = aggregateChromaFrames(capture.frames);
      const verification = hasSignal ? verifyChord(avgChroma, capture.expected.chord) : null;
      const detectedChord =
        verification?.status === "accepted"
          ? capture.expected.chord
          : verification?.status === "rejected"
            ? (getChord(verification.bestAlternativeChordId ?? "") ?? null)
            : null;
      const stringStates = classifyStrings(capture.expected.chord, avgChroma);
      const scored = scoreEvent({
        detectedChordId: detectedChord?.id,
        expectedChordId: capture.expected.chordId,
        sameFamily: detectedChord != null && detectedChord.root === capture.expected.chord.root,
        strings: stringStates,
        expectedRings: expectedRingsMask(capture.expected.chord),
        timingApplies: true,
        timingDeltaMs: capture.deltaMs,
        strumDetected: true,
      });
      commitAttempt({
        id: `${Date.now()}-${capture.expected.index}-hit`,
        expectedId: capture.expected.id,
        expectedIndex: capture.expected.index,
        chordId: capture.expected.chordId,
        previousChordId: capture.expected.previousChordId,
        expectedBeat: capture.expected.beat,
        detectedChordId: detectedChord?.id ?? null,
        detectedAtBeat: capture.detectedAtBeat,
        timingDeltaMs: capture.deltaMs,
        status: "hit",
        score: scored,
        stringStates,
      });
      appendMarker({
        id: `${Date.now()}-${capture.expected.index}-marker`,
        beat: capture.detectedAtBeat,
        status: "hit",
        expectedIndex: capture.expected.index,
        timingDeltaMs: capture.deltaMs,
      });
    },
    [appendMarker, commitAttempt],
  );

  const startPlayhead = useCallback(
    (ctx: AudioContext, totalBeats: number, countInBeats: number) => {
      const tick = () => {
        const startAudioTime = startAudioTimeRef.current;
        if (startAudioTime == null) return;
        const beat = (ctx.currentTime - startAudioTime) / secondsPerBeatRef.current;
        const minTimelineBeat = countInBeats > 0 ? -countInBeats : 0;
        setTimelineBeat(Math.max(minTimelineBeat, Math.min(totalBeats, beat)));
        setPlayheadBeat(Math.min(totalBeats, Math.max(0, beat)));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    },
    [],
  );

  const start = useCallback(async () => {
    if (config.chords.length === 0) {
      setError("Choose at least one chord.");
      return;
    }
    setError(null);
    try {
      const engine = await ensureEngineStarted();
      const ctx = engine.ctx;
      if (!ctx) throw new Error("audio context not available");

      usePractice.getState().reset();
      clearTimers();
      hitExpectedRef.current.clear();
      pendingCapturesRef.current.clear();
      attemptsRef.current = [];
      sessionSavedRef.current = false;
      const session = { id: crypto.randomUUID(), startedAtIso: new Date().toISOString() };
      sessionRef.current = session;
      setAttempts([]);
      setStrumMarkers([]);
      setSummary(null);
      setPlayheadBeat(0);
      setTimelineBeat(config.countInBeats > 0 ? -config.countInBeats : 0);
      setCountInRemainingBeats(config.countInBeats);
      setPhase(config.countInBeats > 0 ? "count-in" : "scoring");

      const nextPlan = buildTimedPracticePlan({
        chordIds: config.chords.map((chord) => chord.id),
        beatsPerChord: config.beatsPerChord,
        order: config.order,
        sessionLength: config.sessionLength,
      });
      const chordById = new Map(config.chords.map((chord) => [chord.id, chord]));

      recordingRef.current = await startRecordedSession({
        id: session.id,
        startedAtIso: session.startedAtIso,
        engine,
        activityType: "practice_drill",
        settings,
        updateSettings: settings.update,
        metadata: {
          practiceMode: "timed_chord_practice",
          bpm: config.bpm,
          beatsPerChord: config.beatsPerChord,
          countInBeats: config.countInBeats,
          order: config.order,
          sessionLength: config.sessionLength,
          chords: config.chords.map((chord) => chord.id),
        },
      }).catch((err) => {
        console.error("session recording failed", err);
        return null;
      });

      const metronome = new Metronome({
        bpm: config.bpm,
        audible: settings.metronomeAudible,
        mode: settings.metronomeMode,
        volume: settings.metronomeVolume,
        onBeat: ({ beat }) => {
          if (config.countInBeats > 0 && beat < config.countInBeats) {
            setPhase("count-in");
            setCountInRemainingBeats(config.countInBeats - beat);
            return;
          }
          setCountInRemainingBeats(0);
          setPhase("scoring");
        },
      });
      metronome.start(ctx);
      metronomeRef.current = metronome;
      const metronomeStartAudioTime = metronome.startedAtAudioTime ?? ctx.currentTime;
      const startAudioTime =
        metronomeStartAudioTime + config.countInBeats * secondsPerBeatRef.current;
      startAudioTimeRef.current = startAudioTime;
      secondsPerBeatRef.current = 60 / config.bpm;
      const activePlan = nextPlan
        .map((item) => {
          const chord = chordById.get(item.chordId);
          if (!chord) return null;
          return {
            ...item,
            chord,
            targetAudioTime: startAudioTime + item.beat * secondsPerBeatRef.current,
          };
        })
        .filter((item): item is ActiveExpected => item != null);
      activePlanRef.current = activePlan;
      setPlan(nextPlan);
      setStatus("running");

      for (const expected of activePlan) {
        const delayMs = Math.max(
          0,
          (expected.targetAudioTime + TIMED_PRACTICE_WINDOW_MS / 1000 - ctx.currentTime) * 1000,
        );
        const timeout = window.setTimeout(() => createMiss(expected), delayMs);
        missTimeoutsRef.current.push(timeout);
      }
      const totalBeats = config.sessionLength * config.beatsPerChord;
      const endDelayMs = Math.max(
        0,
        (startAudioTime +
          totalBeats * secondsPerBeatRef.current +
          TIMED_PRACTICE_WINDOW_MS / 1000 -
          ctx.currentTime) *
          1000,
      );
      endTimeoutRef.current = window.setTimeout(() => {
        finishSession().catch((err) => console.error("timed practice finish failed", err));
      }, endDelayMs);
      startPlayhead(ctx, totalBeats, config.countInBeats);
    } catch (err) {
      console.error(err);
      sessionRef.current = null;
      setError(err instanceof Error ? err.message : "Could not start timed practice.");
      setStatus("idle");
      setPhase("idle");
      setCountInRemainingBeats(0);
      setTimelineBeat(0);
    }
  }, [clearTimers, config, createMiss, finishSession, settings, startPlayhead]);

  const stop = useCallback(async () => {
    await finishSession();
  }, [finishSession]);

  useEffect(() => {
    if (status !== "running") return;
    const engine = getEngine();
    const unsubOnset = engine.on("onset", (event) => {
      const activePlan = activePlanRef.current;
      const startAudioTime = startAudioTimeRef.current;
      if (activePlan.length === 0 || startAudioTime == null) return;
      if (event.t < startAudioTime) return;
      const secondsPerBeat = secondsPerBeatRef.current;
      const detectedAtBeat = (event.t - startAudioTime) / secondsPerBeat;
      const nearest = nearestExpected(activePlan, event.t);
      if (!nearest) return;
      const deltaMs = (event.t - nearest.targetAudioTime) * 1000;
      if (Math.abs(deltaMs) > TIMED_PRACTICE_WINDOW_MS) {
        appendMarker({
          id: `${Date.now()}-extra`,
          beat: detectedAtBeat,
          status: "extra",
          expectedIndex: null,
          timingDeltaMs: null,
        });
        return;
      }
      if (hitExpectedRef.current.has(nearest.index)) {
        appendMarker({
          id: `${Date.now()}-extra`,
          beat: detectedAtBeat,
          status: "extra",
          expectedIndex: nearest.index,
          timingDeltaMs: deltaMs,
        });
        return;
      }
      hitExpectedRef.current.add(nearest.index);
      pendingCapturesRef.current.set(nearest.index, {
        expected: nearest,
        deltaMs,
        detectedAtBeat,
        frames: [],
      });
      window.setTimeout(() => finishCapture(nearest.index), CAPTURE_MS);
    });
    const unsubChroma = engine.on("chroma", (event) => {
      for (const capture of pendingCapturesRef.current.values()) {
        capture.frames.push({ chroma: event.chroma, rms: event.rms, t: event.t });
      }
    });
    return () => {
      unsubOnset();
      unsubChroma();
    };
  }, [appendMarker, finishCapture, status]);

  useEffect(() => {
    metronomeRef.current?.setOptions({
      bpm: config.bpm,
      audible: settings.metronomeAudible,
      volume: settings.metronomeVolume,
    });
  }, [config.bpm, settings.metronomeAudible, settings.metronomeVolume]);

  useEffect(() => {
    return () => {
      clearTimers();
      metronomeRef.current?.stop();
      recordingRef.current
        ?.stop()
        .catch((err) => console.error("session recording stop failed", err));
      getEngine()
        .stop()
        .catch((err) => console.error("audio engine stop failed", err));
    };
  }, [clearTimers]);

  const currentIndex =
    status === "running" && plan.length > 0
      ? Math.min(plan.length - 1, Math.max(0, Math.floor(playheadBeat / config.beatsPerChord)))
      : 0;

  return {
    status,
    phase,
    running: status === "running",
    plan,
    attempts,
    strumMarkers,
    summary,
    playheadBeat,
    timelineBeat,
    countInRemainingBeats,
    currentIndex,
    error,
    start,
    stop,
  };
}

function buildTimedPracticeSessionMetadata(input: {
  attempts: readonly TimedPracticeAttempt[];
  config: TimedChordPracticeConfig;
  summary: TimedPracticeSummary;
}): Record<string, unknown> {
  return {
    completionStatus: input.attempts.length > 0 ? "completed" : "stopped",
    resultSummary:
      input.attempts.length === 0
        ? "No attempts scored"
        : `${input.summary.averageScore.toFixed(1)}/10 average across ${input.attempts.length} attempts`,
    score: input.summary.averageScore,
    scoreSummary: input.summary,
    practiceMode: "timed_chord_practice",
    bpm: input.config.bpm,
    beatsPerChord: input.config.beatsPerChord,
    countInBeats: input.config.countInBeats,
    order: input.config.order,
    sessionLength: input.config.sessionLength,
    chords: input.config.chords.map((chord) => chord.id),
    chordNames: input.config.chords.map((chord) => chord.name),
    attempts: input.attempts,
  };
}

function nearestExpected(
  activePlan: readonly ActiveExpected[],
  tAudio: number,
): ActiveExpected | null {
  let nearest: ActiveExpected | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const expected of activePlan) {
    const distance = Math.abs(tAudio - expected.targetAudioTime);
    if (distance < nearestDistance) {
      nearest = expected;
      nearestDistance = distance;
    }
  }
  return nearest;
}
