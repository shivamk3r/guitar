import type { ChordDef } from "@/data/chords";
import { Button } from "@/ui/Button";
import { Fretboard, type StringState } from "@/ui/Fretboard";
import { LearnTermLink } from "@/ui/LearnTermLink";
import { LinkedFeedbackCue } from "@/ui/LinkedFeedbackCue";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { usePractice } from "../practice-store";
import type { UseDrillSession } from "./useDrillSession";

interface Props {
  title: string;
  subtitle?: string;
  session: UseDrillSession;
  currentChord: ChordDef;
  upcomingChord?: ChordDef | null;
  sidebar?: ReactNode;
  minBpm?: number;
  maxBpm?: number;
}

export function DrillShell({
  title,
  subtitle,
  session,
  currentChord,
  upcomingChord,
  sidebar,
  minBpm = 40,
  maxBpm = 200,
}: Props) {
  const events = usePractice((s) => s.events);
  const rollingAverage = usePractice((s) => s.rollingAverage);
  const stringStates: StringState[] | undefined =
    session.lastEvent && session.lastEvent.expected.id === currentChord.id
      ? (session.lastEvent.stringStates as StringState[])
      : undefined;

  return (
    <section>
      <Link to="/practice" className="text-muted text-sm hover:text-ink">
        ← Back to practice
      </Link>
      <header className="mt-3 mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          {subtitle && <p className="text-muted text-sm mt-1">{subtitle}</p>}
        </div>
        <div className="flex items-start gap-3 flex-wrap justify-end">
          <div className="text-sm text-muted flex items-center gap-2">
            <LearnTermLink termId="tempo">BPM</LearnTermLink>
            <input
              type="number"
              aria-label="BPM"
              min={minBpm}
              max={maxBpm}
              value={session.bpm}
              onChange={(e) =>
                session.setBpm(Math.max(minBpm, Math.min(maxBpm, Number(e.target.value) || minBpm)))
              }
              className="bg-panel border border-white/10 rounded px-2 py-1 text-ink w-20 tabular-nums"
              disabled={session.running}
            />
          </div>
          {session.running ? (
            <Button variant="danger" onClick={() => session.stop()}>
              Stop
            </Button>
          ) : (
            <Button onClick={() => session.start()}>Start</Button>
          )}
        </div>
      </header>

      {session.error && (
        <div className="mb-4 text-bad text-sm border border-bad/30 rounded px-3 py-2">
          {session.error}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-panel rounded-lg p-6 border border-white/5 flex flex-col items-center">
          <div className="text-sm text-muted mb-1">Play</div>
          <div className="text-4xl font-semibold mb-3">{currentChord.name}</div>
          <Fretboard chord={currentChord} stringStates={stringStates} size="lg" />
          {upcomingChord && (
            <div className="mt-4 text-sm text-muted">
              Next: <span className="text-ink">{upcomingChord.name}</span>
            </div>
          )}
        </div>

        <div className="bg-panel rounded-lg p-6 border border-white/5">
          <div className="flex items-baseline gap-4">
            <div className="text-6xl font-semibold tabular-nums">
              {events.length > 0 ? rollingAverage.toFixed(1) : "—"}
            </div>
            <div className="text-muted text-sm">rolling avg (last 8)</div>
          </div>
          {session.lastEvent && (
            <div className="mt-4 text-sm">
              <div>
                <span className="text-muted">Last:</span>{" "}
                <span className="font-medium tabular-nums">{session.lastEvent.scored.score}</span>{" "}
                <span className="text-muted">
                  · <LinkedFeedbackCue cue={session.lastEvent.scored.cue} />
                </span>
              </div>
            </div>
          )}
          {sidebar}
          {events.length > 0 && (
            <ul className="mt-6 space-y-1 text-xs text-muted max-h-48 overflow-y-auto">
              {events
                .slice(-12)
                .reverse()
                .map((e) => (
                  <li key={e.id} className="flex justify-between tabular-nums">
                    <span>
                      {e.expectedChordId} →{" "}
                      {e.detectedChordId ?? <span className="text-bad">?</span>}
                    </span>
                    <span className="text-ink">{e.score.score}</span>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
