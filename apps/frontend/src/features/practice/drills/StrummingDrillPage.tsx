import { type ActiveRecordedSession, startRecordedSession } from "@/audio/sessionRecording";
import { ensureEngineStarted, getEngine, useEngineState } from "@/audio/useAudioEngine";
import { useSettings } from "@/storage/settings-store";
import { Button } from "@/ui/Button";
import { LearnTermLink } from "@/ui/LearnTermLink";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Metronome } from "../metronome";
import { usePractice } from "../practice-store";
import { type ScoredEvent, scoreEvent } from "../scoring";

type Stroke = "D" | "U" | "-";

interface Pattern {
  id: string;
  name: string;
  /** One entry per eighth-note in a 4/4 bar: D, U, or - (rest). */
  strokes: Stroke[];
}

const PATTERNS: Pattern[] = [
  {
    id: "down8",
    name: "Downstrokes (quarter notes)",
    strokes: ["D", "-", "D", "-", "D", "-", "D", "-"],
  },
  { id: "8th-alt", name: "Alternating 8ths", strokes: ["D", "U", "D", "U", "D", "U", "D", "U"] },
  { id: "classic", name: "D · D U · U D U", strokes: ["D", "-", "D", "U", "-", "U", "D", "U"] },
  { id: "folk", name: "Folk (D · D U D U)", strokes: ["D", "-", "D", "U", "D", "-", "D", "U"] },
];

const TIMING_WINDOW_MS = 300;

interface StrummingAttemptMetadata {
  atIso: string;
  expectedStroke: Stroke;
  beat: number;
  timingDeltaMs: number;
  bpm: number;
  score: ScoredEvent;
}

export function StrummingDrillPage() {
  const [patternId, setPatternId] = useState(PATTERNS[0]!.id);
  const [bpm, setBpm] = useState(80);
  const pattern = useMemo(
    () => PATTERNS.find((p) => p.id === patternId) ?? PATTERNS[0]!,
    [patternId],
  );
  const engineState = useEngineState();
  const [running, setRunning] = useState(false);
  const [currentEighth, setCurrentEighth] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const metronomeRef = useRef<Metronome | null>(null);
  const recordingRef = useRef<ActiveRecordedSession | null>(null);
  const attemptsRef = useRef<StrummingAttemptMetadata[]>([]);
  const settings = useSettings();
  const recordEvent = usePractice((s) => s.recordEvent);
  const patternRef = useRef(pattern);
  patternRef.current = pattern;

  const events = usePractice((s) => s.events);
  const rollingAverage = usePractice((s) => s.rollingAverage);

  async function start() {
    setError(null);
    try {
      const engine = await ensureEngineStarted();
      const ctx = engine.ctx;
      if (!ctx) throw new Error("no audio context");
      usePractice.getState().reset();
      attemptsRef.current = [];
      const metronome = new Metronome({
        bpm: bpm * 2, // Eighth notes
        audible: settings.metronomeAudible,
        volume: settings.metronomeVolume,
        onBeat: ({ beat }) => {
          setCurrentEighth(beat % patternRef.current.strokes.length);
        },
      });
      metronomeRef.current = metronome;
      recordingRef.current = await startRecordedSession({
        engine,
        activityType: "practice_drill",
        settings,
        updateSettings: settings.update,
        metadata: {
          practiceMode: "strumming_drill",
          bpm,
          patternId: pattern.id,
          patternName: pattern.name,
          strokes: pattern.strokes,
        },
      }).catch((err) => {
        console.error("session recording failed", err);
        return null;
      });
      metronome.start(ctx);
      setRunning(true);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "could not start");
    }
  }

  async function stop() {
    metronomeRef.current?.stop();
    metronomeRef.current = null;
    try {
      await recordingRef.current?.stop(
        buildStrummingSessionMetadata({
          attempts: attemptsRef.current,
          bpm,
          pattern,
        }),
      );
    } catch (err) {
      console.error("session recording upload failed", err);
    } finally {
      recordingRef.current = null;
    }
    await getEngine().stop();
    setRunning(false);
    setCurrentEighth(0);
  }

  // Listen for onsets and score them against nearest expected stroke
  useEffect(() => {
    if (!running) return;
    const engine = getEngine();
    const unsub = engine.on("onset", (e) => {
      const metronome = metronomeRef.current;
      if (!metronome) return;
      const beatInfo = metronome.beatAt(e.t);
      if (!beatInfo) return;
      const deltaMs = beatInfo.deltaMs;
      if (Math.abs(deltaMs) > TIMING_WINDOW_MS) return;
      const strokes = patternRef.current.strokes;
      const idx = ((beatInfo.beat % strokes.length) + strokes.length) % strokes.length;
      const expected = strokes[idx];
      if (expected === "-" || expected === undefined) return; // rest — no strum expected
      const scored = scoreEvent({
        strings: ["clean", "clean", "clean", "clean", "clean", "clean"],
        expectedRings: [true, true, true, true, true, true],
        timingApplies: true,
        timingDeltaMs: deltaMs,
        strumDetected: true,
      });
      recordEvent({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        atIso: new Date().toISOString(),
        expectedChordId: expected,
        detectedChordId: null,
        score: scored,
        bpm,
      });
      attemptsRef.current = [
        ...attemptsRef.current,
        {
          atIso: new Date().toISOString(),
          expectedStroke: expected,
          beat: beatInfo.beat,
          timingDeltaMs: deltaMs,
          bpm,
          score: scored,
        },
      ];
    });
    return () => unsub();
  }, [running, bpm, recordEvent]);

  useEffect(() => {
    return () => {
      metronomeRef.current?.stop();
    };
  }, []);

  return (
    <section>
      <Link to="/practice" className="text-muted text-sm hover:text-ink">
        ← Back to practice
      </Link>
      <header className="mt-3 mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Strumming pattern</h1>
          <p className="text-muted text-sm mt-1">
            Lock into the <LearnTermLink termId="rhythm">rhythm</LearnTermLink>. Timing is scored
            against the <LearnTermLink termId="beat">beat</LearnTermLink>.
          </p>
        </div>
        <div className="flex items-start gap-3 flex-wrap justify-end">
          <div className="text-sm text-muted">
            <LearnTermLink termId="rhythm">Pattern</LearnTermLink>
            <select
              aria-label="Strumming pattern"
              className="ml-2 bg-panel border border-white/10 rounded px-2 py-1 text-ink"
              value={patternId}
              onChange={(e) => setPatternId(e.target.value)}
              disabled={running}
            >
              {PATTERNS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="text-sm text-muted flex items-center gap-2">
            <LearnTermLink termId="tempo">BPM</LearnTermLink>
            <input
              type="number"
              aria-label="BPM"
              min={40}
              max={200}
              value={bpm}
              onChange={(e) => setBpm(Math.max(40, Math.min(200, Number(e.target.value) || 40)))}
              className="bg-panel border border-white/10 rounded px-2 py-1 text-ink w-20 tabular-nums"
              disabled={running}
            />
          </div>
          {running ? (
            <Button variant="danger" onClick={stop}>
              Stop
            </Button>
          ) : (
            <Button onClick={start} disabled={engineState === "starting"}>
              Start
            </Button>
          )}
        </div>
      </header>

      {error && <div className="mb-4 text-bad text-sm">{error}</div>}

      <div className="bg-panel rounded-lg p-6 border border-white/5">
        <div className="grid grid-cols-8 gap-2 mb-6">
          {pattern.strokes.map((s, i) => (
            <div
              key={`stroke-${i}-${s}`}
              className={`rounded-md text-center py-4 text-xl font-semibold border transition-colors ${
                i === currentEighth && running
                  ? "border-accent bg-accent/20 text-accent"
                  : s === "-"
                    ? "border-white/5 bg-panel/60 text-muted"
                    : "border-white/10 bg-panel text-ink"
              }`}
            >
              {s === "-" ? "·" : s}
            </div>
          ))}
        </div>

        <div className="flex items-baseline gap-4">
          <div className="text-6xl font-semibold tabular-nums">
            {events.length > 0 ? rollingAverage.toFixed(1) : "—"}
          </div>
          <div className="text-muted text-sm">rolling avg (last 8)</div>
        </div>
      </div>
    </section>
  );
}

function buildStrummingSessionMetadata(input: {
  attempts: readonly StrummingAttemptMetadata[];
  bpm: number;
  pattern: Pattern;
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
        ? "No strums scored"
        : `${averageScore.toFixed(1)}/10 average across ${input.attempts.length} strums`,
    score: averageScore,
    scoreSummary: {
      attempts: input.attempts.length,
      averageScore,
      bestScore:
        input.attempts.length === 0
          ? null
          : Math.max(...input.attempts.map((attempt) => attempt.score.score)),
    },
    practiceMode: "strumming_drill",
    bpm: input.bpm,
    patternId: input.pattern.id,
    patternName: input.pattern.name,
    strokes: input.pattern.strokes,
    attempts: input.attempts,
  };
}
