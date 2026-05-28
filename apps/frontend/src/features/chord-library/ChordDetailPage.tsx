import { classifyStrings, expectedRingsMask, matchChord } from "@/audio/chord-detection";
import { type ActiveRecordedSession, startRecordedSession } from "@/audio/sessionRecording";
import { ensureEngineStarted, getEngine, useEngineState } from "@/audio/useAudioEngine";
import { getChord, playedNotes } from "@/data/chords";
import { scoreEvent } from "@/features/practice/scoring";
import { useProgress } from "@/storage/progress-store";
import { useSettings } from "@/storage/settings-store";
import { AudioInputSelect } from "@/ui/AudioInputSelect";
import { Button } from "@/ui/Button";
import { Fretboard, type StringState } from "@/ui/Fretboard";
import { LearnTermLink } from "@/ui/LearnTermLink";
import { LinkedFeedbackCue } from "@/ui/LinkedFeedbackCue";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useChordCheck } from "./chord-check-store";
import { playChordReference } from "./reference-audio";

const CAPTURE_MS = 400;

export function ChordDetailPage() {
  const { id } = useParams<{ id: string }>();
  const chord = id ? getChord(id) : undefined;

  if (!chord) {
    return (
      <div>
        <h1 className="text-xl font-semibold">Chord not found</h1>
        <Link to="/chords" className="text-accent underline">
          Back to library
        </Link>
      </div>
    );
  }

  return <ChordDetailInner key={chord.id} chordId={chord.id} />;
}

function ChordDetailInner({ chordId }: { chordId: string }) {
  const chord = getChord(chordId)!;
  const engineState = useEngineState();
  const { state, lastResult, setState, setResult, setExpected, reset } = useChordCheck();
  const [error, setError] = useState<string | null>(null);
  const recordChordCheck = useProgress((s) => s.recordChordCheck);
  const settings = useSettings();
  const recordingRef = useRef<ActiveRecordedSession | null>(null);
  const capturingRef = useRef(false);
  const chromaBuffer = useRef<Float32Array[]>([]);

  useEffect(() => {
    setExpected(chord);
    return () => {
      reset();
    };
  }, [chord, setExpected, reset]);

  useEffect(() => {
    const engine = getEngine();
    const unsubOnset = engine.on("onset", () => {
      if (state !== "listening") return;
      capturingRef.current = true;
      chromaBuffer.current = [];
      setState("capturing");
      // Stop capturing after CAPTURE_MS and analyze
      window.setTimeout(() => {
        capturingRef.current = false;
        const frames = chromaBuffer.current;
        if (frames.length === 0) {
          setState("listening");
          return;
        }
        const avg = new Float32Array(12);
        for (const f of frames) for (let i = 0; i < 12; i++) avg[i] = (avg[i] ?? 0) + (f[i] ?? 0);
        for (let i = 0; i < 12; i++) avg[i] = (avg[i] ?? 0) / frames.length;
        // Renormalize
        let n = 0;
        for (let i = 0; i < 12; i++) n += (avg[i] ?? 0) * (avg[i] ?? 0);
        n = Math.sqrt(n);
        if (n > 1e-8) for (let i = 0; i < 12; i++) avg[i] = (avg[i] ?? 0) / n;

        const match = matchChord(avg, chord);
        const stringStates = classifyStrings(chord, avg);
        const scored = scoreEvent({
          detectedChordId: match.chord?.id,
          expectedChordId: chord.id,
          sameFamily: match.sameFamily,
          strings: stringStates,
          expectedRings: expectedRingsMask(chord),
          timingApplies: false,
        });
        setResult({
          detectedId: match.chord?.id ?? null,
          detectedName: match.chord?.name ?? null,
          similarity: match.similarity,
          runnerUpId: match.runnerUp?.chord.id ?? null,
          stringStates,
          scored,
        });
        recordChordCheck(chord.id, scored.score).catch((err) =>
          console.error("record chord check failed", err),
        );
      }, CAPTURE_MS);
    });
    const unsubChroma = engine.on("chroma", (e) => {
      if (!capturingRef.current) return;
      chromaBuffer.current.push(e.chroma);
    });
    return () => {
      unsubOnset();
      unsubChroma();
    };
  }, [state, chord, setState, setResult, recordChordCheck]);

  async function handleStartCheck() {
    setError(null);
    try {
      const engine = await ensureEngineStarted();
      setState("listening");
      recordingRef.current = await startRecordedSession({
        engine,
        activityType: "chord_check",
        settings,
        updateSettings: settings.update,
        metadata: { chordId: chord.id },
      }).catch((err) => {
        console.error("session recording failed", err);
        return null;
      });
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Could not start microphone.");
    }
  }

  async function handleStop() {
    try {
      await recordingRef.current?.stop();
    } catch (err) {
      console.error("session recording upload failed", err);
    } finally {
      recordingRef.current = null;
    }
    await getEngine().stop();
    reset();
  }

  const stringStates: StringState[] | undefined = lastResult?.stringStates.map((s) =>
    s === "wrong" ? "wrong" : s,
  );

  const notes = playedNotes(chord);

  return (
    <section>
      <Link to="/chords" className="text-muted text-sm hover:text-ink">
        ← Back
      </Link>
      <header className="mt-3 mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold">{chord.name}</h1>
          <div className="text-muted text-sm mt-1 flex flex-wrap gap-2">
            {chord.tags.map((t) => (
              <span key={t} className="rounded-full border border-white/10 px-2 py-0.5">
                {t}
              </span>
            ))}
          </div>
        </div>
        <AudioInputSelect disabled={engineState === "running"} />
      </header>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-panel rounded-lg p-6 border border-white/5 flex flex-col items-center">
          <Fretboard chord={chord} stringStates={stringStates} size="lg" />
          <div className="mt-4 grid grid-cols-6 gap-1 w-full max-w-xs">
            {notes.map((n, i) => (
              <div
                key={`n-${i}-${n ?? "x"}`}
                className="text-center text-xs text-muted tabular-nums"
              >
                {n ?? "×"}
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="secondary" onClick={() => playChordReference(chord)}>
              Play reference
            </Button>
          </div>
        </div>

        <div className="bg-panel rounded-lg p-6 border border-white/5">
          <h2 className="text-lg font-semibold">Check my chord</h2>
          <p className="text-muted text-sm mt-1">
            Strum the <LearnTermLink termId="chord">chord</LearnTermLink> once. The app will score
            the <LearnTermLink termId="string">strings</LearnTermLink> it hears.
          </p>

          {engineState !== "running" ? (
            <div className="mt-6">
              <Button onClick={handleStartCheck} size="lg">
                Start listening
              </Button>
              {error && <p className="mt-3 text-bad text-sm">{error}</p>}
            </div>
          ) : (
            <>
              <div className="mt-4 text-sm">
                {state === "listening" && (
                  <span className="text-accent">Listening — strum now</span>
                )}
                {state === "capturing" && <span className="text-warn">Analyzing…</span>}
                {state === "idle" && <span className="text-muted">Ready</span>}
              </div>

              {lastResult && (
                <div className="mt-6">
                  <div className="flex items-baseline gap-4">
                    <div className="text-6xl font-semibold tabular-nums">
                      {lastResult.scored.score}
                    </div>
                    <div className="text-muted text-sm">out of 10</div>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-muted">
                    <Bar label="Correct" value={lastResult.scored.correctness} />
                    <Bar label="Clean" value={lastResult.scored.cleanliness} />
                    <Bar label="Timing" value={lastResult.scored.timing} />
                  </div>
                  <div className="mt-3 text-sm">
                    Heard:{" "}
                    <span className="font-medium">{lastResult.detectedName ?? "unrecognized"}</span>
                    {lastResult.runnerUpId && (
                      <span className="text-muted"> (or {lastResult.runnerUpId})</span>
                    )}
                  </div>
                  <div className="mt-2 text-sm text-ink/80">
                    <LinkedFeedbackCue cue={lastResult.scored.cue} />
                  </div>
                </div>
              )}

              <div className="mt-6 flex gap-2">
                <Button
                  onClick={() => setState("listening")}
                  disabled={state === "capturing"}
                  variant="primary"
                >
                  {lastResult ? "Try again" : "Listen"}
                </Button>
                <Button variant="ghost" onClick={handleStop}>
                  Stop
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function Bar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(1, value / 10));
  return (
    <div>
      <div className="flex items-center justify-between">
        <span>{label}</span>
        <span className="tabular-nums">{Math.round(value)}</span>
      </div>
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden mt-0.5">
        <div className="h-full bg-accent" style={{ width: `${pct * 100}%` }} />
      </div>
    </div>
  );
}
