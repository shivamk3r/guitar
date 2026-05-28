import type { GlossaryTerm } from "@/data/glossary";
import { Button } from "@/ui/Button";
import { useEffect, useMemo, useState } from "react";

const STRING_LABELS = ["low E", "A", "D", "G", "B", "high E"] as const;
const NOTE_LABELS = ["C", "D", "E", "F", "G", "A", "B"] as const;

export function ConceptAnimation({ term }: { term: GlossaryTerm }) {
  const [value, setValue] = useState(52);
  const [running, setRunning] = useState(true);
  const step = useAnimationStep(running);
  const visual = renderVisual(term, value, step);

  return (
    <div className="rounded-lg border border-white/10 bg-panel p-4">
      <div
        className="relative h-[230px] overflow-hidden rounded-md border border-white/5 bg-surface/70"
        role="img"
        aria-label={`${term.term} animated concept visual`}
      >
        {visual}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="flex min-w-0 flex-1 items-center gap-3 text-sm text-muted">
          <span className="shrink-0">Explore</span>
          <input
            type="range"
            min={0}
            max={100}
            value={value}
            onChange={(event) => setValue(Number(event.target.value))}
            className="w-full accent-accent"
            aria-label={`${term.term} visual control`}
          />
        </label>
        <Button type="button" variant="secondary" size="sm" onClick={() => setRunning((v) => !v)}>
          {running ? "Pause" : "Animate"}
        </Button>
      </div>
    </div>
  );
}

function useAnimationStep(running: boolean): number {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!running) return undefined;
    const id = window.setInterval(() => setStep((current) => current + 1), 140);
    return () => window.clearInterval(id);
  }, [running]);

  return step;
}

function renderVisual(term: GlossaryTerm, value: number, step: number) {
  switch (term.visualKind) {
    case "pitch":
      return <PitchVisual value={value} step={step} />;
    case "fret":
      return <FretVisual value={value} />;
    case "cent":
      return <CentVisual value={value} step={step} />;
    case "beat":
      return <BeatVisual step={step} />;
    case "semitone":
      return <SemitoneVisual value={value} step={step} />;
    case "accidental":
      return <AccidentalVisual termId={term.id} value={value} step={step} />;
    case "note":
      return <NoteVisual value={value} step={step} />;
    case "chord":
      return <ChordVisual step={step} />;
    case "tempo":
      return <TempoVisual value={value} step={step} />;
    case "rhythm":
      return <RhythmVisual value={value} step={step} />;
    case "tuning":
      return <TuningVisual value={value} step={step} />;
    case "string":
      return <StringVisual value={value} step={step} />;
  }
}

function PitchVisual({ value, step }: { value: number; step: number }) {
  const cycles = 1.2 + (value / 100) * 4.4;
  const path = useMemo(() => makeWavePath(cycles, 18, step), [cycles, step]);
  const label = value < 35 ? "low" : value > 65 ? "high" : "middle";

  return (
    <div className="flex h-full flex-col justify-center px-6">
      <svg viewBox="0 0 100 100" className="h-32 w-full" aria-hidden="true">
        <line x1="0" x2="100" y1="50" y2="50" stroke="rgba(255,255,255,0.12)" strokeWidth="2" />
        <polyline
          points={path}
          fill="none"
          stroke="#66d9a8"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>
      <div className="flex items-center justify-between text-sm text-muted">
        <span>low pitch</span>
        <span className="text-ink">{label}</span>
        <span>high pitch</span>
      </div>
    </div>
  );
}

function FretVisual({ value }: { value: number }) {
  const fret = Math.round((value / 100) * 5);
  const left = 18 + fret * 13;

  return (
    <div className="flex h-full flex-col justify-center px-6">
      <div className="relative h-36 rounded-md border border-white/10 bg-[#10161b]">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={`string-${index}`}
            className="absolute left-0 right-0 bg-white/30"
            style={{ top: `${16 + index * 20}%`, height: `${1 + index * 0.35}px` }}
          />
        ))}
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={`fret-${index}`}
            className="absolute top-0 bottom-0 w-1 bg-white/20"
            style={{ left: `${18 + index * 13}%` }}
          />
        ))}
        <div
          className="absolute top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-accent bg-accent/30 shadow-[0_0_24px_rgba(102,217,168,0.28)] transition-all"
          style={{ left: `${left}%` }}
        />
      </div>
      <div className="mt-4 text-center text-sm text-muted">
        fret <span className="text-ink">{fret}</span>
      </div>
    </div>
  );
}

function CentVisual({ value, step }: { value: number; step: number }) {
  const drift = Math.sin(step / 2) * 3;
  const cents = Math.round(value - 50 + drift);
  const left = Math.max(6, Math.min(94, cents + 50));

  return (
    <div className="flex h-full flex-col justify-center px-8">
      <div className="relative h-24">
        <div className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/10" />
        <div className="absolute left-[45%] right-[45%] top-1/2 h-5 -translate-y-1/2 rounded bg-accent/25" />
        <div
          className="absolute top-1/2 h-20 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent transition-all"
          style={{ left: `${left}%` }}
        />
        {[-50, -25, 0, 25, 50].map((mark) => (
          <div
            key={mark}
            className="absolute top-[64%] -translate-x-1/2 text-xs text-muted"
            style={{ left: `${mark + 50}%` }}
          >
            {mark}
          </div>
        ))}
      </div>
      <div className="text-center text-sm text-muted">
        <span
          className={Math.abs(cents) <= 5 ? "text-accent" : cents < 0 ? "text-warn" : "text-bad"}
        >
          {cents > 0 ? "+" : ""}
          {cents} cents
        </span>
      </div>
    </div>
  );
}

function BeatVisual({ step }: { step: number }) {
  const active = step % 4;
  return (
    <div className="flex h-full items-center justify-center gap-4 px-6">
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={`beat-${index}`}
          className={`flex h-20 w-20 items-center justify-center rounded-full border text-2xl font-semibold transition-all ${
            index === active
              ? "scale-110 border-accent bg-accent/20 text-accent"
              : "border-white/10 bg-white/5 text-muted"
          }`}
        >
          {index + 1}
        </div>
      ))}
    </div>
  );
}

function SemitoneVisual({ value, step }: { value: number; step: number }) {
  const offset = Math.round((value / 100) * 4);
  const active = (step + offset) % 5;
  const labels = ["E", "F", "F#", "G", "G#"] as const;

  return (
    <div className="flex h-full flex-col justify-center px-6">
      <div className="grid grid-cols-5 gap-2">
        {labels.map((label, index) => (
          <div
            key={label}
            className={`rounded-md border py-10 text-center text-lg font-semibold transition-all ${
              index === active
                ? "border-accent bg-accent/20 text-accent"
                : "border-white/10 bg-white/5 text-muted"
            }`}
          >
            {label}
          </div>
        ))}
      </div>
      <div className="mt-4 text-center text-sm text-muted">one fret is one semitone</div>
    </div>
  );
}

function AccidentalVisual({
  termId,
  value,
  step,
}: {
  termId: GlossaryTerm["id"];
  value: number;
  step: number;
}) {
  const prefersFlat = termId === "flat";
  const amount = prefersFlat ? -1 : 1;
  const slide = (value / 100) * amount * 34 + Math.sin(step / 3) * amount * 3;
  const label = prefersFlat ? "B♭" : "F#";

  return (
    <div className="flex h-full flex-col items-center justify-center px-6">
      <div className="relative h-28 w-full max-w-md">
        {Array.from({ length: 5 }, (_, index) => (
          <div
            key={`staff-${index}`}
            className="absolute left-0 right-0 h-px bg-white/15"
            style={{ top: `${18 + index * 16}%` }}
          />
        ))}
        <div
          className="absolute top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-accent bg-accent/20 text-xl font-semibold text-accent transition-all"
          style={{ left: `${50 + slide}%` }}
        >
          {label}
        </div>
      </div>
      <div className="text-sm text-muted">
        {prefersFlat ? "lower by one semitone" : "raise by one semitone"}
      </div>
    </div>
  );
}

function NoteVisual({ value, step }: { value: number; step: number }) {
  const index = Math.min(
    NOTE_LABELS.length - 1,
    Math.round((value / 100) * (NOTE_LABELS.length - 1)),
  );
  const top = 76 - index * 9 + Math.sin(step / 3) * 2;
  const label = NOTE_LABELS[index] ?? "C";

  return (
    <div className="flex h-full flex-col items-center justify-center px-6">
      <div className="relative h-32 w-full max-w-md">
        {Array.from({ length: 5 }, (_, line) => (
          <div
            key={`line-${line}`}
            className="absolute left-0 right-0 h-px bg-white/15"
            style={{ top: `${22 + line * 14}%` }}
          />
        ))}
        <div
          className="absolute left-1/2 flex h-12 w-16 -translate-x-1/2 items-center justify-center rounded-[50%] bg-accent text-lg font-semibold text-surface transition-all"
          style={{ top: `${top}%` }}
        >
          {label}
        </div>
      </div>
      <div className="text-sm text-muted">
        note name <span className="text-ink">{label}</span>
      </div>
    </div>
  );
}

function ChordVisual({ step }: { step: number }) {
  const active = step % 3;
  const notes = ["C", "E", "G"] as const;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6">
      <div className="grid w-full max-w-md grid-cols-3 gap-3">
        {notes.map((note, index) => (
          <div
            key={note}
            className={`rounded-md border py-8 text-center text-2xl font-semibold transition-all ${
              index === active
                ? "border-accent bg-accent/20 text-accent"
                : "border-white/10 bg-white/5 text-ink"
            }`}
          >
            {note}
          </div>
        ))}
      </div>
      <div className="text-sm text-muted">notes sounding together become a chord</div>
    </div>
  );
}

function TempoVisual({ value, step }: { value: number; step: number }) {
  const bpm = Math.round(50 + (value / 100) * 110);
  const speed = 0.08 + value / 280;
  const angle = Math.sin(step * speed * Math.PI) * 34;

  return (
    <div className="flex h-full flex-col items-center justify-center px-6">
      <div className="relative h-36 w-44">
        <div className="absolute bottom-0 left-1/2 h-4 w-32 -translate-x-1/2 rounded bg-white/10" />
        <div
          className="absolute bottom-2 left-1/2 h-32 w-1 origin-bottom rounded bg-accent transition-transform"
          style={{ transform: `translateX(-50%) rotate(${angle}deg)` }}
        >
          <div className="absolute -top-3 left-1/2 h-7 w-7 -translate-x-1/2 rounded-full bg-accent" />
        </div>
      </div>
      <div className="text-sm text-muted">
        tempo <span className="text-ink">{bpm} BPM</span>
      </div>
    </div>
  );
}

function RhythmVisual({ value, step }: { value: number; step: number }) {
  const dense = value > 55;
  const pattern = dense
    ? (["D", "U", "D", "-", "U", "D", "U", "-"] as const)
    : (["D", "-", "D", "-", "D", "-", "D", "-"] as const);
  const active = step % pattern.length;

  return (
    <div className="flex h-full flex-col justify-center px-6">
      <div className="grid grid-cols-8 gap-2">
        {pattern.map((stroke, index) => (
          <div
            key={`stroke-${index}`}
            className={`rounded-md border py-8 text-center text-xl font-semibold transition-all ${
              index === active
                ? "border-accent bg-accent/20 text-accent"
                : stroke === "-"
                  ? "border-white/5 bg-white/5 text-muted"
                  : "border-white/10 bg-white/10 text-ink"
            }`}
          >
            {stroke === "-" ? "·" : stroke}
          </div>
        ))}
      </div>
      <div className="mt-4 text-center text-sm text-muted">sounds and rests across the beat</div>
    </div>
  );
}

function TuningVisual({ value, step }: { value: number; step: number }) {
  const active = Math.min(
    STRING_LABELS.length - 1,
    Math.round((value / 100) * (STRING_LABELS.length - 1)),
  );

  return (
    <div className="flex h-full flex-col justify-center px-6">
      <div className="grid grid-cols-6 gap-2">
        {STRING_LABELS.map((label, index) => {
          const isActive = index === active;
          const drift = isActive ? Math.sin(step / 2) * 18 : 0;
          return (
            <div
              key={label}
              className={`rounded-md border px-2 py-5 text-center transition-colors ${
                isActive
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-white/10 bg-white/5 text-muted"
              }`}
            >
              <div className="text-sm font-semibold">{label}</div>
              <div className="relative mt-4 h-12">
                <div className="absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2 bg-white/15" />
                <div
                  className="absolute left-1/2 top-0 h-12 w-1 origin-bottom rounded bg-current transition-transform"
                  style={{ transform: `translateX(-50%) rotate(${drift}deg)` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StringVisual({ value, step }: { value: number; step: number }) {
  const active = Math.min(
    STRING_LABELS.length - 1,
    Math.round((value / 100) * (STRING_LABELS.length - 1)),
  );

  return (
    <div className="flex h-full flex-col justify-center px-6">
      <svg viewBox="0 0 100 100" className="h-40 w-full" aria-hidden="true">
        {STRING_LABELS.map((label, index) => {
          const y = 12 + index * 15;
          const activeString = index === active;
          const path = activeString ? makeStringPath(y, step, 2.5) : `M 4 ${y} L 96 ${y}`;
          return (
            <g key={label}>
              <path
                d={path}
                fill="none"
                stroke={activeString ? "#66d9a8" : "rgba(255,255,255,0.28)"}
                strokeWidth={2.8 - index * 0.24}
                strokeLinecap="round"
              />
              <text x="3" y={y - 3} fill="rgba(233,237,241,0.68)" fontSize="4">
                {label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="text-center text-sm text-muted">
        active string <span className="text-ink">{STRING_LABELS[active]}</span>
      </div>
    </div>
  );
}

function makeWavePath(cycles: number, amplitude: number, step: number): string {
  return Array.from({ length: 52 }, (_, index) => {
    const x = (index / 51) * 100;
    const y = 50 + Math.sin((index / 51) * cycles * Math.PI * 2 + step * 0.55) * amplitude;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

function makeStringPath(y: number, step: number, amplitude: number): string {
  const points = Array.from({ length: 24 }, (_, index) => {
    const x = 4 + (index / 23) * 92;
    const offset = Math.sin((index / 23) * Math.PI * 5 + step * 0.8) * amplitude;
    return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${(y + offset).toFixed(1)}`;
  });
  return points.join(" ");
}
