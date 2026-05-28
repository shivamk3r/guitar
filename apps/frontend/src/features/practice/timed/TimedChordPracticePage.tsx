import { CHORDS, type ChordDef, getChord } from "@/data/chords";
import { AudioInputSelect } from "@/ui/AudioInputSelect";
import { Button } from "@/ui/Button";
import { Fretboard, type StringState } from "@/ui/Fretboard";
import { clsx } from "@/ui/clsx";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { usePractice } from "../practice-store";
import type {
  TimedPracticeAttempt,
  TimedPracticeOrder,
  TimedPracticePlanItem,
  TimedPracticeStrumMarker,
  TimedPracticeSummary,
} from "./timed-practice";
import { buildTimedPracticePlan } from "./timed-practice";
import {
  TIMED_PRACTICE_WINDOW_MS,
  useTimedChordPracticeSession,
} from "./useTimedChordPracticeSession";

const LENGTH_OPTIONS = [8, 12, 16, 24];
const BEATS_PER_CHORD_OPTIONS = [1, 2, 4];

export function TimedChordPracticePage() {
  const [selectedIds, setSelectedIds] = useState<string[]>(["A", "D"]);
  const [bpm, setBpm] = useState(72);
  const [beatsPerChord, setBeatsPerChord] = useState(4);
  const [order, setOrder] = useState<TimedPracticeOrder>("forward");
  const [sessionLength, setSessionLength] = useState(12);
  const chords = useMemo(
    () => selectedIds.map((id) => getChord(id)).filter((chord): chord is ChordDef => !!chord),
    [selectedIds],
  );
  const sessionConfig = useMemo(
    () => ({ chords, bpm, beatsPerChord, order, sessionLength }),
    [beatsPerChord, bpm, chords, order, sessionLength],
  );
  const previewPlan = useMemo(
    () =>
      buildTimedPracticePlan({
        chordIds: chords.map((chord) => chord.id),
        beatsPerChord,
        order,
        sessionLength,
      }),
    [beatsPerChord, chords, order, sessionLength],
  );
  const session = useTimedChordPracticeSession(sessionConfig);
  const rollingAverage = usePractice((state) => state.rollingAverage);

  const currentPlanItem = session.plan[session.currentIndex] ?? null;
  const currentChord =
    (currentPlanItem ? getChord(currentPlanItem.chordId) : null) ?? chords[0] ?? null;
  const nextPlanItem = session.plan[session.currentIndex + 1] ?? null;
  const upcomingChord = nextPlanItem ? getChord(nextPlanItem.chordId) : null;
  const lastAttempt = session.attempts.at(-1) ?? null;
  const stringStates: StringState[] | undefined =
    lastAttempt && currentChord && lastAttempt.chordId === currentChord.id
      ? (lastAttempt.stringStates as StringState[])
      : undefined;

  function toggleChord(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  return (
    <section>
      <Link to="/practice" className="text-muted text-sm hover:text-ink">
        ← Back to practice
      </Link>
      <header className="mt-3 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">Timed chord practice</h1>
            <p className="text-muted text-sm mt-1">
              Play each chord on the timeline. Timing, chord match, and clean strings all count.
            </p>
          </div>
          <div className="flex items-start gap-3 flex-wrap justify-end">
            <AudioInputSelect disabled={session.running} />
            <NumberField
              label="BPM"
              min={40}
              max={200}
              value={bpm}
              disabled={session.running}
              onChange={setBpm}
            />
            <SelectField
              label="Beats"
              value={beatsPerChord}
              disabled={session.running}
              onChange={setBeatsPerChord}
              options={BEATS_PER_CHORD_OPTIONS.map((value) => ({
                value,
                label: `${value}`,
              }))}
            />
            <label className="text-sm text-muted">
              Order
              <select
                className="ml-2 bg-panel border border-white/10 rounded px-2 py-1 text-ink"
                value={order}
                disabled={session.running}
                onChange={(event) => setOrder(event.target.value as TimedPracticeOrder)}
              >
                <option value="forward">Forward</option>
                <option value="reverse">Reverse</option>
                <option value="shuffle">Shuffle</option>
              </select>
            </label>
            <SelectField
              label="Length"
              value={sessionLength}
              disabled={session.running}
              onChange={setSessionLength}
              options={LENGTH_OPTIONS.map((value) => ({
                value,
                label: `${value}`,
              }))}
            />
            {session.running ? (
              <Button variant="danger" onClick={session.stop}>
                Stop
              </Button>
            ) : (
              <Button onClick={session.start} disabled={chords.length === 0}>
                Start
              </Button>
            )}
          </div>
        </div>
      </header>

      {session.error && (
        <div className="mb-4 text-bad text-sm border border-bad/30 rounded px-3 py-2">
          {session.error}
        </div>
      )}

      <div className="mb-6">
        <ChordPicker selectedIds={selectedIds} onToggle={toggleChord} disabled={session.running} />
      </div>

      {chords.length === 0 || !currentChord ? (
        <div className="bg-panel border border-white/5 rounded-lg p-6 text-muted">
          Choose at least one chord.
        </div>
      ) : (
        <>
          <div className="grid lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.2fr)] gap-6 mb-6">
            <div className="bg-panel rounded-lg p-6 border border-white/5 flex flex-col items-center">
              <div className="text-sm text-muted mb-1">
                {session.running ? "Now" : "First chord"}
              </div>
              <div className="text-5xl font-semibold mb-3">{currentChord.name}</div>
              <Fretboard chord={currentChord} stringStates={stringStates} size="lg" />
              {upcomingChord && (
                <div className="mt-4 text-sm text-muted">
                  Next: <span className="text-ink">{upcomingChord.name}</span>
                </div>
              )}
            </div>

            <div className="bg-panel rounded-lg p-6 border border-white/5">
              <div className="flex items-baseline gap-4 mb-4">
                <div className="text-6xl font-semibold tabular-nums">
                  {session.attempts.length > 0 ? rollingAverage.toFixed(1) : "—"}
                </div>
                <div className="text-muted text-sm">rolling score</div>
              </div>
              {lastAttempt ? (
                <div className="grid sm:grid-cols-3 gap-3 text-sm">
                  <ScoreMetric label="Timing" value={lastAttempt.score.timing} />
                  <ScoreMetric label="Correct" value={lastAttempt.score.correctness} />
                  <ScoreMetric label="Clean" value={lastAttempt.score.cleanliness} />
                </div>
              ) : (
                <div className="text-sm text-muted">Ready.</div>
              )}
              {lastAttempt && (
                <div className="mt-4 text-sm">
                  <span className="text-muted">Last:</span>{" "}
                  <span className="font-medium tabular-nums">{lastAttempt.score.score}</span>{" "}
                  <span className="text-muted">· {formatTiming(lastAttempt)} · </span>
                  <span className="text-muted">{lastAttempt.score.cue}</span>
                </div>
              )}
            </div>
          </div>

          <BeatTimeline
            bpm={bpm}
            beatsPerChord={beatsPerChord}
            plan={session.plan.length > 0 ? session.plan : previewPlan}
            attempts={session.attempts}
            strumMarkers={session.strumMarkers}
            playheadBeat={session.playheadBeat}
            running={session.running}
            sessionLength={sessionLength}
          />

          <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-6 mt-6">
            <TraceTable attempts={session.attempts} />
            {session.summary ? (
              <SummaryPanel summary={session.summary} />
            ) : (
              <div className="bg-panel rounded-lg p-5 border border-white/5">
                <div className="text-sm uppercase tracking-wide text-muted mb-3">Summary</div>
                <div className="text-sm text-muted">Complete a session to see the next step.</div>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="text-sm text-muted flex items-center gap-2">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(event) =>
          onChange(Math.max(min, Math.min(max, Number(event.target.value) || min)))
        }
        className="bg-panel border border-white/10 rounded px-2 py-1 text-ink w-20 tabular-nums"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  options: Array<{ value: number; label: string }>;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="text-sm text-muted">
      {label}
      <select
        className="ml-2 bg-panel border border-white/10 rounded px-2 py-1 text-ink"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ChordPicker({
  selectedIds,
  onToggle,
  disabled,
}: {
  selectedIds: string[];
  onToggle: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <div className="text-sm text-muted mb-2">Chords</div>
      <div className="flex flex-wrap gap-2">
        {CHORDS.map((chord) => {
          const selected = selectedIds.includes(chord.id);
          return (
            <button
              key={chord.id}
              type="button"
              disabled={disabled}
              onClick={() => onToggle(chord.id)}
              className={clsx(
                "text-xs px-2 py-1 rounded border transition-colors",
                selected
                  ? "border-accent/60 bg-accent/10 text-accent"
                  : "border-white/10 bg-panel text-muted hover:text-ink",
                disabled && "opacity-50 cursor-not-allowed",
              )}
            >
              {chord.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ScoreMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-white/10 p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{Math.round(value)}</div>
    </div>
  );
}

function BeatTimeline({
  bpm,
  beatsPerChord,
  plan,
  attempts,
  strumMarkers,
  playheadBeat,
  running,
  sessionLength,
}: {
  bpm: number;
  beatsPerChord: number;
  plan: TimedPracticePlanItem[];
  attempts: TimedPracticeAttempt[];
  strumMarkers: TimedPracticeStrumMarker[];
  playheadBeat: number;
  running: boolean;
  sessionLength: number;
}) {
  const totalBeats = Math.max(1, sessionLength * beatsPerChord);
  const widthPx = Math.max(780, totalBeats * 56);
  const pxPerBeat = widthPx / totalBeats;
  const beatMs = 60000 / bpm;
  const windowBeats = TIMED_PRACTICE_WINDOW_MS / beatMs;
  const attemptByIndex = new Map(attempts.map((attempt) => [attempt.expectedIndex, attempt]));

  return (
    <div className="bg-panel rounded-lg p-5 border border-white/5">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="text-sm uppercase tracking-wide text-muted">Beat timeline</div>
        <div className="text-xs text-muted tabular-nums">
          {bpm} BPM · {beatsPerChord} beats per chord
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="relative h-44" style={{ width: `${widthPx}px` }}>
          {Array.from({ length: totalBeats + 1 }, (_, beat) => {
            const isBar = beat % 4 === 0;
            return (
              <div
                key={`beat-${beat}`}
                className={clsx(
                  "absolute top-8 bottom-8 border-l",
                  isBar ? "border-white/30" : "border-white/10",
                )}
                style={{ left: `${beat * pxPerBeat}px` }}
              >
                <div className="absolute top-full mt-1 -translate-x-1/2 text-[10px] text-muted tabular-nums">
                  {beat + 1}
                </div>
              </div>
            );
          })}
          {plan.map((item) => {
            const attempt = attemptByIndex.get(item.index);
            const left = Math.max(0, item.beat * pxPerBeat - windowBeats * pxPerBeat);
            const width = Math.max(10, windowBeats * 2 * pxPerBeat);
            return (
              <div key={item.id}>
                <div
                  className={clsx(
                    "absolute top-12 h-16 rounded-md border flex items-center justify-center text-sm font-medium",
                    attempt?.status === "hit"
                      ? "border-accent/70 bg-accent/15 text-accent"
                      : attempt?.status === "miss"
                        ? "border-bad/70 bg-bad/15 text-bad"
                        : running
                          ? "border-warn/50 bg-warn/10 text-ink"
                          : "border-white/15 bg-surface/60 text-ink",
                  )}
                  style={{ left: `${left}px`, width: `${width}px` }}
                >
                  {item.chordId}
                </div>
                <div
                  className="absolute top-4 -translate-x-1/2 text-xs text-muted tabular-nums"
                  style={{ left: `${item.beat * pxPerBeat}px` }}
                >
                  {item.chordId}
                </div>
                {attempt?.status === "miss" && (
                  <div
                    className="absolute top-28 -translate-x-1/2 text-bad text-sm font-semibold"
                    style={{ left: `${item.beat * pxPerBeat}px` }}
                    aria-label={`Missed ${item.chordId}`}
                  >
                    ×
                  </div>
                )}
              </div>
            );
          })}
          {strumMarkers.map((marker) => (
            <div
              key={marker.id}
              className={clsx(
                "absolute top-28 h-8 -translate-x-1/2 border-l-2",
                marker.status === "hit" ? "border-accent" : "border-warn",
              )}
              style={{ left: `${Math.max(0, Math.min(totalBeats, marker.beat)) * pxPerBeat}px` }}
              title={marker.status === "hit" ? "Detected strum" : "Extra strum"}
            />
          ))}
          <div
            className={clsx(
              "absolute top-2 bottom-4 w-0.5 bg-accent shadow-[0_0_16px_rgba(102,217,168,0.55)] transition-opacity",
              running ? "opacity-100" : "opacity-40",
            )}
            style={{ left: `${Math.max(0, Math.min(totalBeats, playheadBeat)) * pxPerBeat}px` }}
          >
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-accent" />
          </div>
        </div>
      </div>
    </div>
  );
}

function TraceTable({ attempts }: { attempts: TimedPracticeAttempt[] }) {
  return (
    <div className="bg-panel rounded-lg p-5 border border-white/5">
      <div className="text-sm uppercase tracking-wide text-muted mb-3">Trace</div>
      {attempts.length === 0 ? (
        <div className="text-sm text-muted">No attempts yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="py-2 pr-3 font-medium">Expected</th>
                <th className="py-2 pr-3 font-medium">Heard</th>
                <th className="py-2 pr-3 font-medium">Timing</th>
                <th className="py-2 pr-3 font-medium">Quality</th>
                <th className="py-2 text-right font-medium">Score</th>
              </tr>
            </thead>
            <tbody>
              {attempts
                .slice(-12)
                .reverse()
                .map((attempt) => (
                  <tr key={attempt.id} className="border-t border-white/5">
                    <td className="py-2 pr-3 font-medium">{attempt.chordId}</td>
                    <td className="py-2 pr-3">
                      {attempt.detectedChordId ?? <span className="text-bad">—</span>}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">{formatTiming(attempt)}</td>
                    <td className="py-2 pr-3 text-muted">{attempt.score.cue}</td>
                    <td className="py-2 text-right tabular-nums text-ink">{attempt.score.score}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SummaryPanel({ summary }: { summary: TimedPracticeSummary }) {
  const bestChord = summary.bestChordId
    ? (getChord(summary.bestChordId)?.name ?? summary.bestChordId)
    : "—";
  const weakest = summary.weakestTransition
    ? `${summary.weakestTransition.fromChordId} → ${summary.weakestTransition.toChordId}`
    : "—";
  const timing =
    summary.timingConsistencyMs == null
      ? "Need 2 hits"
      : `${Math.round(summary.timingConsistencyMs)} ms`;

  return (
    <div className="bg-panel rounded-lg p-5 border border-white/5">
      <div className="text-sm uppercase tracking-wide text-muted mb-3">Summary</div>
      <div className="space-y-3 text-sm">
        <SummaryRow label="Best chord" value={bestChord} />
        <SummaryRow label="Weakest transition" value={weakest} />
        <SummaryRow label="Timing consistency" value={timing} />
        <SummaryRow label="Rolling score" value={summary.rollingScore.toFixed(1)} />
      </div>
      <div className="mt-4 rounded-md border border-accent/30 bg-accent/10 p-3">
        <div className="text-xs uppercase tracking-wide text-accent mb-1">Next step</div>
        <div className="text-sm font-medium">{summary.recommendation}</div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="text-ink font-medium text-right">{value}</span>
    </div>
  );
}

function formatTiming(attempt: TimedPracticeAttempt): string {
  if (attempt.status === "miss" || attempt.timingDeltaMs == null) return "miss";
  const rounded = Math.round(Math.abs(attempt.timingDeltaMs));
  if (rounded <= 25) return "on beat";
  return attempt.timingDeltaMs < 0 ? `early ${rounded} ms` : `late ${rounded} ms`;
}
