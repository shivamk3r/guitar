import { type ActiveRecordedSession, startRecordedSession } from "@/audio/sessionRecording";
import { ensureEngineStarted, getEngine, useEngineState } from "@/audio/useAudioEngine";
import { type StringTuning, TUNINGS, getTuning } from "@/data/tunings";
import { NOTE_NAMES } from "@/lib/math";
import { useSettings } from "@/storage/settings-store";
import { AudioInputSelect } from "@/ui/AudioInputSelect";
import { Button } from "@/ui/Button";
import { LearnTermLink } from "@/ui/LearnTermLink";
import { useEffect, useMemo, useRef, useState } from "react";
import { PitchStabilityTrace, type PitchStabilityTraceHandle } from "./PitchStabilityTrace";
import { TunerNeedle } from "./TunerNeedle";
import {
  centsFromTargetHz,
  getStringTargetHz,
  makePitchTraceSample,
  resolveTraceTarget,
} from "./pitch-trace";
import { useTuner } from "./tuner-store";

export function TunerPage() {
  const engineState = useEngineState();
  const { status, note, hz, inTune, ingestPitch, ingestSilence, reset, setStatus } = useTuner();
  const settings = useSettings();
  const tuningId = settings.tuningId;
  const updateSettings = settings.update;
  const tuning = getTuning(tuningId);
  const [error, setError] = useState<string | null>(null);
  const recordingRef = useRef<ActiveRecordedSession | null>(null);
  const traceRef = useRef<PitchStabilityTraceHandle | null>(null);
  const activeTargetRef = useRef<StringTuning | null>(null);
  const [activeTarget, setActiveTarget] = useState<StringTuning | null>(null);
  const [lockedStringMidis, setLockedStringMidis] = useState<Record<number, boolean>>({});

  useEffect(() => {
    activeTargetRef.current = null;
    setActiveTarget(null);
    traceRef.current?.reset();

    const engine = getEngine();
    const unsubPitch = engine.on("pitch", (e) => {
      const nextTarget = resolveTraceTarget(activeTargetRef.current, tuning, e.hz);
      if (activeTargetRef.current?.midi !== nextTarget.midi) {
        activeTargetRef.current = nextTarget;
        setActiveTarget(nextTarget);
        traceRef.current?.reset();
      }

      traceRef.current?.appendSample(
        makePitchTraceSample({
          hz: e.hz,
          t: e.t,
          confidence: e.confidence,
          rms: e.rms,
          target: nextTarget,
        }),
      );
      ingestPitch(e.hz, e.confidence, e.t);
    });
    const unsubLevel = engine.on("level", (e) => {
      traceRef.current?.setClock(e.t);
      if (e.rms < 0.003) ingestSilence();
    });
    return () => {
      unsubPitch();
      unsubLevel();
    };
  }, [ingestPitch, ingestSilence, tuning]);

  useEffect(() => {
    if (!inTune || activeTarget == null) return;
    setLockedStringMidis((current) =>
      current[activeTarget.midi] ? current : { ...current, [activeTarget.midi]: true },
    );
  }, [activeTarget, inTune]);

  async function handleStart() {
    setError(null);
    setLockedStringMidis({});
    try {
      const engine = await ensureEngineStarted();
      setStatus("listening");
      recordingRef.current = await startRecordedSession({
        engine,
        activityType: "tuner",
        settings,
        updateSettings,
        metadata: { tuningId },
      }).catch((err) => {
        console.error("session recording failed", err);
        return null;
      });
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : "Could not start microphone. Check browser permissions.",
      );
    }
  }

  async function handleStop() {
    try {
      await recordingRef.current?.stop(
        buildTunerSessionMetadata({
          hz,
          lockedStringMidis,
          noteLabel: note ? `${note.name}${note.octave}` : null,
          tuning,
          tuningId,
        }),
      );
    } catch (err) {
      console.error("session recording upload failed", err);
    } finally {
      recordingRef.current = null;
    }
    await getEngine().stop();
    activeTargetRef.current = null;
    setActiveTarget(null);
    traceRef.current?.reset();
    reset();
    setLockedStringMidis({});
  }

  const isRunning = engineState === "running";
  const target = activeTarget;
  const centsFromTarget = useMemo(() => {
    if (!note) return 0;
    if (!target) return note.cents;
    return centsFromTargetHz(hz, getStringTargetHz(target));
  }, [hz, note, target]);

  return (
    <section>
      <header className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Tuner</h1>
          <p className="text-muted text-sm mt-1">
            Pluck a single <LearnTermLink termId="string">string</LearnTermLink> and hold until the{" "}
            <LearnTermLink termId="pitch">pitch</LearnTermLink> locks near center.
          </p>
        </div>
        <div className="flex items-start gap-3 flex-wrap justify-end">
          <AudioInputSelect />
          <label className="text-sm text-muted">
            Tuning
            <select
              value={tuningId}
              onChange={(e) => updateSettings({ tuningId: e.target.value })}
              className="ml-2 bg-panel border border-white/10 rounded px-2 py-1 text-ink"
            >
              {TUNINGS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <div className="bg-panel rounded-lg p-6 border border-white/5">
        {!isRunning ? (
          <div className="text-center py-12">
            <p className="text-ink mb-4">
              The tuner needs microphone access. Recording only starts if you enabled consent in
              Settings.
            </p>
            <Button onClick={handleStart} size="lg">
              Start listening
            </Button>
            {error && <p className="mt-4 text-bad text-sm">{error}</p>}
          </div>
        ) : (
          <>
            <TunerNeedle
              cents={centsFromTarget}
              inTune={inTune}
              label={note ? `${note.name}${note.octave}` : "—"}
              targetLabel={target ? `${target.note}${target.octave}` : ""}
            />
            <PitchStabilityTrace ref={traceRef} target={target} />
            <p className="mt-3 text-xs text-muted">
              The needle and trace show <LearnTermLink termId="cent">cents</LearnTermLink> from the
              target in your selected <LearnTermLink termId="tuning">tuning</LearnTermLink>.
            </p>
            <div className="mt-6 flex items-center justify-between text-sm text-muted">
              <div>
                {status === "signal-weak" ? (
                  <>
                    Signal weak — pluck a <LearnTermLink termId="string">string</LearnTermLink>{" "}
                    closer to the mic.
                  </>
                ) : note ? (
                  `${hz.toFixed(2)} Hz`
                ) : (
                  <>
                    Waiting for a <LearnTermLink termId="note">note</LearnTermLink>…
                  </>
                )}
              </div>
              <Button variant="secondary" size="sm" onClick={handleStop}>
                Stop
              </Button>
            </div>
            <StringChecklist
              activeTargetMidi={target?.midi ?? null}
              lockedStringMidis={lockedStringMidis}
            />
          </>
        )}
      </div>
    </section>
  );
}

function StringChecklist({
  activeTargetMidi,
  lockedStringMidis,
}: {
  activeTargetMidi: number | null;
  lockedStringMidis: Record<number, boolean>;
}) {
  const tuningId = useSettings((s) => s.tuningId);
  const tuning = getTuning(tuningId);

  return (
    <div className="mt-6 grid grid-cols-6 gap-2">
      {tuning.strings.map((s, idx) => {
        const pc = ((s.midi % 12) + 12) % 12;
        const name = `${NOTE_NAMES[pc]}${s.octave}`;
        const done = lockedStringMidis[s.midi];
        const current = activeTargetMidi === s.midi;
        return (
          <div
            key={`${idx}-${s.midi}`}
            className={`rounded-md p-2 text-center text-xs border ${
              done
                ? "border-accent/60 bg-accent/10 text-accent"
                : current
                  ? "border-white/30 bg-panel text-ink"
                  : "border-white/10 bg-panel/40 text-muted"
            }`}
          >
            <div className="font-semibold">{name}</div>
            <div className="mt-1">
              {done ? "in tune" : current ? "tuning…" : `string ${idx + 1}`}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function buildTunerSessionMetadata(input: {
  hz: number;
  lockedStringMidis: Record<number, boolean>;
  noteLabel: string | null;
  tuning: ReturnType<typeof getTuning>;
  tuningId: string;
}): Record<string, unknown> {
  const tunedStrings = input.tuning.strings.filter(
    (string) => input.lockedStringMidis[string.midi],
  );
  const tunedStringCount = tunedStrings.length;
  const totalStringCount = input.tuning.strings.length;
  const completionStatus =
    tunedStringCount === totalStringCount
      ? "completed"
      : tunedStringCount > 0
        ? "partial"
        : "stopped";
  return {
    completionStatus,
    resultSummary: `${tunedStringCount}/${totalStringCount} strings in tune`,
    tuningResult: {
      tuningId: input.tuningId,
      tuningName: input.tuning.name,
      tunedStringCount,
      totalStringCount,
      tunedStrings: tunedStrings.map((string) => `${string.note}${string.octave}`),
      lastDetectedHz: Number.isFinite(input.hz) ? input.hz : null,
      lastDetectedNote: input.noteLabel,
    },
  };
}
