import { type ActiveRecordedSession, startRecordedSession } from "@/audio/sessionRecording";
import { ensureEngineStarted, getEngine, useEngineState } from "@/audio/useAudioEngine";
import { useSettings } from "@/storage/settings-store";
import { Button } from "@/ui/Button";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Metronome } from "../metronome";
import { usePractice } from "../practice-store";
import { scoreEvent } from "../scoring";

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
        metadata: { bpm, patternId: pattern.id },
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
      await recordingRef.current?.stop();
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
            Lock into the pattern. Timing is scored per strum.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm text-muted">
            Pattern
            <select
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
          </label>
          <label className="text-sm text-muted flex items-center gap-2">
            BPM
            <input
              type="number"
              min={40}
              max={200}
              value={bpm}
              onChange={(e) => setBpm(Math.max(40, Math.min(200, Number(e.target.value) || 40)))}
              className="bg-panel border border-white/10 rounded px-2 py-1 text-ink w-20 tabular-nums"
              disabled={running}
            />
          </label>
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
