import { CHORDS, type ChordDef, getChord } from "@/data/chords";
import {
  TIMED_PRACTICE_COUNT_IN_OPTIONS,
  type TimedPracticeCountInBeats,
} from "@/storage/preferences";
import { useSettings } from "@/storage/settings-store";
import { Button } from "@/ui/Button";
import { Fretboard, type StringState } from "@/ui/Fretboard";
import { LearnTermLink } from "@/ui/LearnTermLink";
import { clsx } from "@/ui/clsx";
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
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
  beatToTimelinePercent,
  formatTimelineBeatLabel,
  getCenteredBeatWindow,
  getVisibleBeatCount,
  getVisibleTimelineBeats,
  isTimelinePercentVisible,
} from "./timeline-view";
import {
  TIMED_PRACTICE_WINDOW_MS,
  useTimedChordPracticeSession,
} from "./useTimedChordPracticeSession";

const LENGTH_OPTIONS = [8, 12, 16, 24];
const BEATS_PER_CHORD_OPTIONS = [1, 2, 4];

export function TimedChordPracticePage() {
  const settings = useSettings();
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
    () => ({
      chords,
      bpm,
      beatsPerChord,
      order,
      sessionLength,
      countInBeats: settings.timedPracticeCountInBeats,
    }),
    [beatsPerChord, bpm, chords, order, sessionLength, settings.timedPracticeCountInBeats],
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

  function updateCountIn(value: number) {
    settings
      .update({ timedPracticeCountInBeats: value as TimedPracticeCountInBeats })
      .catch((err) => console.error("timed practice count-in preference failed", err));
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
            <NumberField
              label="BPM"
              min={40}
              max={200}
              value={bpm}
              disabled={session.running}
              onChange={setBpm}
              help={
                <InfoPopover
                  label="Open tempo help"
                  align="right"
                  title="BPM"
                  links={<LearnTermLink termId="tempo">Tempo</LearnTermLink>}
                >
                  BPM means beats per minute. A lower number gives you more time between clicks; a
                  higher number makes the same chord change arrive sooner.
                </InfoPopover>
              }
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
              help={
                <InfoPopover
                  label="Open beat help"
                  align="right"
                  title="Beats"
                  links={<LearnTermLink termId="beat">Beat</LearnTermLink>}
                >
                  This sets how many metronome beats each chord lasts before the next chord is due.
                  More beats means more setup time for your fretting hand.
                </InfoPopover>
              }
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
            <SelectField
              label="Count-in"
              value={settings.timedPracticeCountInBeats}
              disabled={session.running}
              onChange={updateCountIn}
              options={TIMED_PRACTICE_COUNT_IN_OPTIONS.map((value) => ({
                value,
                label: value === 0 ? "Off" : `${value} beats`,
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
                {session.phase === "count-in"
                  ? "Get ready"
                  : session.running
                    ? "Now"
                    : "First chord"}
              </div>
              <div className="text-5xl font-semibold mb-3">{currentChord.name}</div>
              {session.phase === "count-in" && (
                <div
                  className="mb-4 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 text-sm"
                  aria-live="polite"
                >
                  <span className="text-xs uppercase tracking-wide text-accent">Count-in</span>
                  <span className="font-semibold tabular-nums">
                    {" "}
                    {formatTimelineBeatLabel(-session.countInRemainingBeats)}
                  </span>
                </div>
              )}
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
                <div className="text-sm text-muted">
                  {session.phase === "count-in" ? "Scoring starts after the count-in." : "Ready."}
                </div>
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
            timelineBeat={session.timelineBeat}
            running={session.running}
            sessionLength={sessionLength}
            countInBeats={settings.timedPracticeCountInBeats}
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
  help,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (value: number) => void;
  help?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="text-sm text-muted flex items-center gap-2">
      <div className="flex items-center gap-1">
        <label htmlFor={id}>{label}</label>
        {help}
      </div>
      <input
        id={id}
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
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  disabled,
  onChange,
  help,
}: {
  label: string;
  value: number;
  options: Array<{ value: number; label: string }>;
  disabled?: boolean;
  onChange: (value: number) => void;
  help?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="text-sm text-muted flex items-center gap-2">
      <div className="flex items-center gap-1">
        <label htmlFor={id}>{label}</label>
        {help}
      </div>
      <select
        id={id}
        className="bg-panel border border-white/10 rounded px-2 py-1 text-ink"
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
    </div>
  );
}

function InfoPopover({
  label,
  title,
  children,
  links,
  align = "left",
}: {
  label: string;
  title: string;
  children: ReactNode;
  links: ReactNode;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const popoverId = useId();
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/15 bg-surface text-[11px] font-semibold leading-none text-muted transition-colors hover:border-accent/50 hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
      >
        i
      </button>
      {open && (
        <dialog
          open
          id={popoverId}
          aria-label={title}
          className={clsx(
            "absolute top-7 z-20 m-0 w-72 rounded-md border border-white/10 bg-surface p-3 text-left text-sm leading-6 text-muted shadow-xl shadow-black/30",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink">
            {title}
          </span>
          <span className="block">{children}</span>
          <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">Learn: {links}</span>
        </dialog>
      )}
    </div>
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
  timelineBeat,
  running,
  sessionLength,
  countInBeats,
}: {
  bpm: number;
  beatsPerChord: number;
  plan: TimedPracticePlanItem[];
  attempts: TimedPracticeAttempt[];
  strumMarkers: TimedPracticeStrumMarker[];
  timelineBeat: number;
  running: boolean;
  sessionLength: number;
  countInBeats: TimedPracticeCountInBeats;
}) {
  const totalBeats = Math.max(1, sessionLength * beatsPerChord);
  const visibleBeats = getVisibleBeatCount(bpm);
  const timelineWindow = getCenteredBeatWindow({ playheadBeat: timelineBeat, visibleBeats });
  const beatMs = 60000 / bpm;
  const windowBeats = TIMED_PRACTICE_WINDOW_MS / beatMs;
  const windowWidthPercent = Math.max(3, (windowBeats * 2 * 100) / timelineWindow.visibleBeats);
  const attemptByIndex = new Map(attempts.map((attempt) => [attempt.expectedIndex, attempt]));
  const visibleWholeBeats = getVisibleTimelineBeats({
    window: timelineWindow,
    minBeat: running ? -countInBeats : 0,
    maxBeat: totalBeats,
  });

  return (
    <div className="bg-panel rounded-lg p-5 border border-white/5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-2">
          <div className="text-sm uppercase tracking-wide text-muted">Beat timeline</div>
          <InfoPopover
            label="Open timeline help"
            title="Beat timeline"
            links={
              <>
                <LearnTermLink termId="beat">Beat</LearnTermLink>
                <LearnTermLink termId="chord">Chord</LearnTermLink>
                <LearnTermLink termId="string">String</LearnTermLink>
              </>
            }
          >
            Yellow bars are the acceptable strum windows around each expected chord beat. Play when
            a chord window reaches the center line. Negative beat numbers are count-in; scoring
            starts at 0. The app scores timing, chord correctness, and string cleanliness.
          </InfoPopover>
        </div>
        <div className="text-xs text-muted tabular-nums">
          {bpm} BPM · {beatsPerChord} beats per chord
        </div>
      </div>
      <div
        className="relative h-52 overflow-hidden rounded-md border border-white/10 bg-surface/50"
        aria-label="Scrolling beat timeline"
      >
        <div className="absolute left-0 right-0 top-14 border-t border-white/10" />
        {visibleWholeBeats.map((beat) => {
          const isBar = beat % 4 === 0;
          const left = beatToTimelinePercent(beat, timelineWindow);
          return (
            <div
              key={`beat-${beat}`}
              className={clsx(
                "absolute top-7 bottom-9 border-l",
                isBar ? "border-white/35" : "border-white/10",
              )}
              style={{ left: `${left}%` }}
            >
              <div className="absolute top-full mt-1 -translate-x-1/2 text-[10px] text-muted tabular-nums">
                {formatTimelineBeatLabel(beat)}
              </div>
            </div>
          );
        })}
        {plan.map((item) => {
          const attempt = attemptByIndex.get(item.index);
          const center = beatToTimelinePercent(item.beat, timelineWindow);
          const left = beatToTimelinePercent(item.beat - windowBeats, timelineWindow);
          const right = left + windowWidthPercent;
          if (
            !isTimelinePercentVisible(center) &&
            !isTimelinePercentVisible(left) &&
            !isTimelinePercentVisible(right)
          ) {
            return null;
          }
          return (
            <div key={item.id}>
              <div
                className={clsx(
                  "absolute top-16 h-16 rounded-md border flex items-center justify-center text-sm font-medium shadow-sm",
                  attempt?.status === "hit"
                    ? "border-accent/80 bg-warn/15 text-ink shadow-accent/10"
                    : attempt?.status === "miss"
                      ? "border-bad/80 bg-warn/10 text-bad"
                      : "border-warn/60 bg-warn/15 text-ink",
                )}
                style={{ left: `${left}%`, width: `${windowWidthPercent}%` }}
                aria-label={`${item.chordId} strum window at beat ${formatTimelineBeatLabel(
                  item.beat,
                )}`}
              >
                <span className="truncate px-1">{item.chordId}</span>
                {attempt?.status === "hit" && (
                  <span
                    className="absolute -right-1 -top-1 h-3 w-3 rounded-full border border-surface bg-accent"
                    aria-label={`Hit ${item.chordId}`}
                  />
                )}
              </div>
              {isTimelinePercentVisible(center) && (
                <div
                  className="absolute top-3 -translate-x-1/2 text-xs text-muted tabular-nums"
                  style={{ left: `${center}%` }}
                >
                  {item.chordId}
                </div>
              )}
              {attempt?.status === "miss" && isTimelinePercentVisible(center) && (
                <div
                  className="absolute top-36 -translate-x-1/2 rounded-full border border-bad/60 bg-bad/15 px-1.5 text-sm font-semibold text-bad"
                  style={{ left: `${center}%` }}
                  aria-label={`Missed ${item.chordId}`}
                >
                  x
                </div>
              )}
            </div>
          );
        })}
        {strumMarkers.map((marker) => {
          const left = beatToTimelinePercent(marker.beat, timelineWindow);
          if (!isTimelinePercentVisible(left)) return null;
          return (
            <div
              key={marker.id}
              className={clsx(
                "absolute top-36 h-9 -translate-x-1/2 border-l-2",
                marker.status === "hit" ? "border-accent" : "border-warn",
              )}
              style={{ left: `${left}%` }}
              title={marker.status === "hit" ? "Detected strum" : "Extra strum"}
              aria-label={marker.status === "hit" ? "Detected strum" : "Extra strum"}
            >
              <span
                className={clsx(
                  "absolute -left-1 top-full mt-1 h-2 w-2 rounded-full",
                  marker.status === "hit" ? "bg-accent" : "bg-warn",
                )}
              />
            </div>
          );
        })}
        <div
          className={clsx(
            "absolute left-1/2 top-3 bottom-7 z-10 w-0.5 -translate-x-1/2 bg-accent shadow-[0_0_16px_rgba(102,217,168,0.55)] transition-opacity",
            running ? "opacity-100" : "opacity-50",
          )}
          aria-hidden="true"
        >
          <div className="absolute -top-1 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full bg-accent" />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-muted">
        <TimelineLegendSwatch className="border-warn/60 bg-warn/15" label="Window" />
        <TimelineLegendSwatch className="border-accent bg-accent" label="Hit" />
        <TimelineLegendSwatch className="border-bad bg-bad/70" label="Miss" />
        <TimelineLegendSwatch className="border-warn bg-warn" label="Extra strum" />
      </div>
    </div>
  );
}

function TimelineLegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={clsx("h-2.5 w-2.5 rounded-sm border", className)} />
      {label}
    </span>
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
