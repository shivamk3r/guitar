import {
  type ChordVerifierStatus,
  type ChromaFrame,
  aggregateChromaFrames,
  classifyStrings,
  expectedRingsMask,
  matchChord,
  verifyChord,
} from "@/audio/chord-detection";
import { type ActiveRecordedSession, startRecordedSession } from "@/audio/sessionRecording";
import { ensureEngineStarted, getEngine, useEngineState } from "@/audio/useAudioEngine";
import { type ChordDef, getChord, playedNotes } from "@/data/chords";
import { type ScoredEvent, type StringClass, scoreEvent } from "@/features/practice/scoring";
import { syncLearningSessionOrQueue } from "@/storage/pending-backend-sync";
import { useProgress } from "@/storage/progress-store";
import { useSettings } from "@/storage/settings-store";
import { Button } from "@/ui/Button";
import { Fretboard, type StringState } from "@/ui/Fretboard";
import { LearnTermLink } from "@/ui/LearnTermLink";
import { LinkedFeedbackCue } from "@/ui/LinkedFeedbackCue";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { buildChordCheckSessionSummary } from "./chord-check-session";
import { useChordCheck } from "./chord-check-store";
import { playChordReference } from "./reference-audio";

const CAPTURE_MS = 400;

interface ChordCheckAttemptMetadata {
  atIso: string;
  expectedChordId: string;
  detectedChordId: string | null;
  detectedChordName: string | null;
  verifierStatus: ChordVerifierStatus;
  verifierConfidence: number;
  similarity: number;
  score: ScoredEvent;
  stringStates: StringClass[];
}

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
  const saveSession = useProgress((s) => s.saveSession);
  const settings = useSettings();
  const recordingRef = useRef<ActiveRecordedSession | null>(null);
  const sessionRef = useRef<{ id: string; startedAtIso: string } | null>(null);
  const capturingRef = useRef(false);
  const chromaBuffer = useRef<ChromaFrame[]>([]);
  const attemptsRef = useRef<ChordCheckAttemptMetadata[]>([]);

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
        const aggregate = aggregateChromaFrames(chromaBuffer.current);
        if (!aggregate.hasSignal) {
          setState("listening");
          return;
        }
        const avg = aggregate.avgChroma;
        const match = matchChord(avg, chord);
        const verification = verifyChord(avg, chord);
        const detectedChord =
          verification.status === "accepted"
            ? chord
            : verification.status === "rejected"
              ? getChord(verification.bestAlternativeChordId ?? "")
              : null;
        const stringStates = classifyStrings(chord, avg);
        const scored = scoreEvent({
          detectedChordId: detectedChord?.id,
          expectedChordId: chord.id,
          sameFamily: detectedChord != null && detectedChord.root === chord.root,
          strings: stringStates,
          expectedRings: expectedRingsMask(chord),
          timingApplies: false,
        });
        setResult({
          detectedId: detectedChord?.id ?? null,
          detectedName: detectedChord?.name ?? null,
          similarity: verification.expectedSimilarity,
          runnerUpId: match.runnerUp?.chord.id ?? null,
          verifierStatus: verification.status,
          confidence: verification.confidence,
          stringStates,
          scored,
        });
        attemptsRef.current = [
          ...attemptsRef.current,
          {
            atIso: new Date().toISOString(),
            expectedChordId: chord.id,
            detectedChordId: detectedChord?.id ?? null,
            detectedChordName: detectedChord?.name ?? null,
            verifierStatus: verification.status,
            verifierConfidence: verification.confidence,
            similarity: verification.expectedSimilarity,
            score: scored,
            stringStates,
          },
        ];
        recordChordCheck(chord.id, scored.score).catch((err) =>
          console.error("record chord check failed", err),
        );
      }, CAPTURE_MS);
    });
    const unsubChroma = engine.on("chroma", (e) => {
      if (!capturingRef.current) return;
      chromaBuffer.current.push({ chroma: e.chroma, rms: e.rms, t: e.t });
    });
    return () => {
      unsubOnset();
      unsubChroma();
    };
  }, [state, chord, setState, setResult, recordChordCheck]);

  async function handleStartCheck() {
    setError(null);
    attemptsRef.current = [];
    try {
      const engine = await ensureEngineStarted();
      const session = { id: crypto.randomUUID(), startedAtIso: new Date().toISOString() };
      sessionRef.current = session;
      setState("listening");
      recordingRef.current = await startRecordedSession({
        id: session.id,
        startedAtIso: session.startedAtIso,
        engine,
        activityType: "chord_check",
        settings,
        updateSettings: settings.update,
        metadata: { chordId: chord.id, chordName: chord.name },
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
    const endedAtIso = new Date().toISOString();
    const session = sessionRef.current ?? {
      id: crypto.randomUUID(),
      startedAtIso: new Date(Date.now() - 60_000).toISOString(),
    };
    const metadata = buildChordCheckSessionMetadata(chord, attemptsRef.current);
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
        buildChordCheckSessionSummary({
          id: session.id,
          startedAtIso: session.startedAtIso,
          endedAtIso,
          chord,
          attempts: attemptsRef.current,
        }),
      );
    } catch (err) {
      console.error("local chord check session save failed", err);
    }
    if (!hadBackendSession || backendStopFailed) {
      const syncResult = await syncLearningSessionOrQueue(
        {
          sessionId: session.id,
          activityType: "chord_check",
          startedAtIso: session.startedAtIso,
          endedAtIso,
          metadata,
        },
        settings,
      );
      if (!syncResult.synced) {
        console.error("chord check backend sync queued", syncResult.error);
      }
    }
    await getEngine().stop();
    sessionRef.current = null;
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

function buildChordCheckSessionMetadata(
  chord: ChordDef,
  attempts: readonly ChordCheckAttemptMetadata[],
): Record<string, unknown> {
  const averageScore =
    attempts.length === 0
      ? null
      : attempts.reduce((total, attempt) => total + attempt.score.score, 0) / attempts.length;
  const lastScore = attempts.at(-1)?.score.score ?? null;
  return {
    completionStatus: attempts.length > 0 ? "completed" : "stopped",
    resultSummary:
      averageScore == null
        ? "No attempts scored"
        : `${averageScore.toFixed(1)}/10 average across ${attempts.length} attempts`,
    score: averageScore,
    scoreSummary: {
      attempts: attempts.length,
      averageScore,
      lastScore,
      bestScore:
        attempts.length === 0 ? null : Math.max(...attempts.map((attempt) => attempt.score.score)),
    },
    chordId: chord.id,
    chordName: chord.name,
    attempts,
  };
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
