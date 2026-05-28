import type { ChordDef } from "@/data/chords";

export type StringState = "clean" | "dull" | "muted" | "wrong" | "unknown";

interface Props {
  chord: ChordDef;
  stringStates?: readonly StringState[]; // length 6
  size?: "sm" | "md" | "lg";
  showLabels?: boolean;
}

const SIZE_PX: Record<NonNullable<Props["size"]>, number> = {
  sm: 140,
  md: 220,
  lg: 320,
};

const STRING_COLORS: Record<StringState, string> = {
  clean: "#66d9a8",
  dull: "#f3b454",
  muted: "#8793a2",
  wrong: "#ef5a6f",
  unknown: "#e9edf1",
};

/**
 * Fretboard chord diagram.
 * - Strings are rendered left-to-right as low E..high E (bass at left).
 * - 5 frets shown by default; if the chord uses frets above 5, we shift the grid.
 */
export function Fretboard({ chord, stringStates, size = "md", showLabels = true }: Props) {
  const { frets, fingers, barre } = chord.shape;
  const width = SIZE_PX[size];
  const height = Math.round(width * 1.25);
  const pad = Math.round(width * 0.12);
  const fretCount = 5;

  const maxFret = Math.max(0, ...frets);
  const startFret = maxFret > fretCount ? maxFret - fretCount + 1 : 1;
  const showNut = startFret === 1;

  const innerW = width - 2 * pad;
  const innerH = height - 2 * pad - (showLabels ? 20 : 0);
  const stringSpacing = innerW / 5;
  const fretSpacing = innerH / fretCount;

  const stringX = (i: number) => pad + i * stringSpacing;
  const fretY = (f: number) => pad + (showLabels ? 20 : 0) + f * fretSpacing;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={`${chord.name} chord diagram`}
    >
      <title>{chord.name} chord diagram</title>
      {/* labels: open / mute above each string */}
      {showLabels &&
        frets.map((f, i) => {
          const state = stringStates?.[i] ?? "unknown";
          const color = stringStates ? STRING_COLORS[state] : "#e9edf1";
          const label = f === -1 ? "×" : f === 0 ? "○" : "";
          return (
            <text
              key={`lbl-${i}`}
              x={stringX(i)}
              y={pad + 12}
              textAnchor="middle"
              fontSize={14}
              fill={color}
              fontFamily="ui-monospace, monospace"
            >
              {label}
            </text>
          );
        })}

      {/* fret lines */}
      {Array.from({ length: fretCount + 1 }, (_, i) => (
        <line
          key={`fret-${i}`}
          x1={pad}
          x2={pad + innerW}
          y1={fretY(i)}
          y2={fretY(i)}
          stroke={i === 0 && showNut ? "#e9edf1" : "#3a434e"}
          strokeWidth={i === 0 && showNut ? 4 : 1}
        />
      ))}

      {/* strings */}
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const state = stringStates?.[i] ?? "unknown";
        const color = stringStates ? STRING_COLORS[state] : "#8793a2";
        return (
          <line
            key={`s-${i}`}
            x1={stringX(i)}
            x2={stringX(i)}
            y1={fretY(0)}
            y2={fretY(fretCount)}
            stroke={color}
            strokeWidth={1.5}
          />
        );
      })}

      {/* barre */}
      {barre && (
        <rect
          x={stringX(barre.fromString) - 7}
          y={fretY(barre.fret - startFret + 0.5) - 7}
          width={stringX(barre.toString) - stringX(barre.fromString) + 14}
          height={14}
          rx={7}
          fill="#e9edf1"
          opacity={0.9}
        />
      )}

      {/* finger dots */}
      {frets.map((f, i) => {
        if (f <= 0) return null;
        const rel = f - startFret + 1;
        if (rel < 1 || rel > fretCount) return null;
        const cx = stringX(i);
        const cy = fretY(rel - 0.5);
        const finger = fingers[i];
        return (
          <g key={`dot-${i}`}>
            <circle cx={cx} cy={cy} r={11} fill="#e9edf1" />
            {finger ? (
              <text
                x={cx}
                y={cy + 4}
                textAnchor="middle"
                fontSize={11}
                fontWeight={700}
                fill="#0b0d10"
              >
                {finger}
              </text>
            ) : null}
          </g>
        );
      })}

      {/* start-fret label if shifted */}
      {!showNut && (
        <text
          x={pad - 6}
          y={fretY(0.5) + 4}
          textAnchor="end"
          fontSize={12}
          fill="#8793a2"
          fontFamily="ui-monospace, monospace"
        >
          {startFret}fr
        </text>
      )}
    </svg>
  );
}
