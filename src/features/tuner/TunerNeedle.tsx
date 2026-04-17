import { clamp } from "@/lib/math";

interface Props {
  cents: number;
  inTune: boolean;
  label: string;
  targetLabel: string;
}

const CENTS_MAX = 50;

export function TunerNeedle({ cents, inTune, label, targetLabel }: Props) {
  const clamped = clamp(cents, -CENTS_MAX, CENTS_MAX);
  // Map cents [-50, 50] to angle [-60deg, 60deg]
  const angle = (clamped / CENTS_MAX) * 60;

  return (
    <div
      className="flex flex-col items-center w-full select-none"
      role="meter"
      aria-valuemin={-CENTS_MAX}
      aria-valuemax={CENTS_MAX}
      aria-valuenow={Math.round(clamped)}
      aria-label={`Tuning deviation: ${Math.round(cents)} cents ${cents >= 0 ? "sharp" : "flat"}`}
    >
      <svg viewBox="-200 -180 400 220" className="w-full max-w-md">
        <title>Tuner needle</title>
        {/* Arc */}
        <path d="M -150 0 A 150 150 0 0 1 150 0" stroke="#2a323c" strokeWidth={3} fill="none" />
        {/* Centre band (±5 cents) */}
        <path
          d="M -15 0 A 150 150 0 0 1 15 0"
          stroke={inTune ? "#66d9a8" : "#394553"}
          strokeWidth={6}
          fill="none"
        />
        {/* Tick marks */}
        {[-50, -25, 0, 25, 50].map((c) => {
          const a = (c / CENTS_MAX) * 60 - 90;
          const rad = (a * Math.PI) / 180;
          const x1 = Math.cos(rad) * 140;
          const y1 = Math.sin(rad) * 140;
          const x2 = Math.cos(rad) * 155;
          const y2 = Math.sin(rad) * 155;
          return (
            <g key={c}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#4a5563" strokeWidth={1.5} />
              <text
                x={Math.cos(rad) * 170}
                y={Math.sin(rad) * 170 + 4}
                textAnchor="middle"
                fontSize={11}
                fill="#8793a2"
                fontFamily="ui-monospace, monospace"
              >
                {c}
              </text>
            </g>
          );
        })}
        {/* Needle */}
        <g transform={`rotate(${angle})`}>
          <line
            x1={0}
            y1={0}
            x2={0}
            y2={-140}
            stroke={inTune ? "#66d9a8" : "#e9edf1"}
            strokeWidth={3}
            strokeLinecap="round"
          />
          <circle cx={0} cy={0} r={7} fill={inTune ? "#66d9a8" : "#e9edf1"} />
        </g>
      </svg>
      <div className="flex items-baseline gap-2 mt-2">
        <div className="text-5xl font-semibold tabular-nums">{label}</div>
        <div className="text-muted text-sm">→ {targetLabel}</div>
      </div>
      <div className="text-sm text-muted tabular-nums" aria-hidden>
        {cents >= 0 ? "+" : ""}
        {Math.round(cents)}¢
      </div>
      <div className="sr-only" aria-live="polite">
        {inTune ? `In tune at ${targetLabel}` : ""}
      </div>
    </div>
  );
}
