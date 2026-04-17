import { NOTE_NAMES, type NoteName } from "@/lib/math";
import { DEFAULT_TUNING } from "./tunings";

export type ChordQuality = "major" | "minor" | "dom7" | "min7" | "power" | "sus";
export type ChordTier = "first" | "open" | "seventh" | "power" | "barre";

export interface ChordShape {
  /** Low-to-high, index 0 = low E string. -1 = muted, 0 = open, positive = fret. */
  frets: readonly [number, number, number, number, number, number];
  /** 0 = not fretted / unused; 1-4 = fingers, 'T' = thumb (not used in v1). */
  fingers: readonly [number, number, number, number, number, number];
  /** Optional barre description for rendering. */
  barre?: { fromString: number; toString: number; fret: number };
}

export interface ChordDef {
  id: string;
  name: string;
  altNames?: readonly string[];
  root: NoteName;
  quality: ChordQuality;
  tier: ChordTier;
  tags: readonly string[];
  shape: ChordShape;
  /** Derived chroma template, 12 bins, L2-normalized. Used for detection. */
  chroma: Float32Array;
  /** MIDI numbers for each string after fretting. null = muted. */
  playedMidi: readonly (number | null)[];
}

function buildShape(
  frets: readonly [number, number, number, number, number, number],
  fingers: readonly [number, number, number, number, number, number],
  barre?: ChordShape["barre"],
): ChordShape {
  return { frets, fingers, ...(barre ? { barre } : {}) };
}

function midiForString(stringIdx: number, fret: number): number | null {
  if (fret < 0) return null;
  const tuningMidi = DEFAULT_TUNING.strings[stringIdx]?.midi;
  if (tuningMidi === undefined) throw new Error(`bad string idx ${stringIdx}`);
  return tuningMidi + fret;
}

function chromaFromMidi(midis: readonly (number | null)[]): Float32Array {
  const chroma = new Float32Array(12);
  // Weight the root and fifth more than higher voices; beginners listen mostly to the bass.
  // Keep it simple: root string (lowest non-muted) gets weight 2, others 1.
  let rootWeight = 2;
  for (const m of midis) {
    if (m == null) continue;
    const pc = ((m % 12) + 12) % 12;
    chroma[pc] = (chroma[pc] ?? 0) + rootWeight;
    rootWeight = 1;
  }
  let norm = 0;
  for (let i = 0; i < 12; i++) norm += (chroma[i] ?? 0) * (chroma[i] ?? 0);
  norm = Math.sqrt(norm);
  if (norm > 1e-8) for (let i = 0; i < 12; i++) chroma[i] = (chroma[i] ?? 0) / norm;
  return chroma;
}

interface ChordInput {
  id: string;
  name: string;
  altNames?: readonly string[];
  root: NoteName;
  quality: ChordQuality;
  tier: ChordTier;
  tags: readonly string[];
  frets: readonly [number, number, number, number, number, number];
  fingers: readonly [number, number, number, number, number, number];
  barre?: ChordShape["barre"];
}

function makeChord(input: ChordInput): ChordDef {
  const shape = buildShape(input.frets, input.fingers, input.barre);
  const playedMidi = input.frets.map((fret, idx) => midiForString(idx, fret));
  const chroma = chromaFromMidi(playedMidi);
  return {
    id: input.id,
    name: input.name,
    altNames: input.altNames,
    root: input.root,
    quality: input.quality,
    tier: input.tier,
    tags: input.tags,
    shape,
    chroma,
    playedMidi,
  };
}

export const CHORDS: ChordDef[] = [
  // --- Open majors ---
  makeChord({
    id: "C",
    name: "C",
    root: "C",
    quality: "major",
    tier: "first",
    tags: ["first chords", "key of C", "key of G"],
    frets: [-1, 3, 2, 0, 1, 0],
    fingers: [0, 3, 2, 0, 1, 0],
  }),
  makeChord({
    id: "G",
    name: "G",
    root: "G",
    quality: "major",
    tier: "first",
    tags: ["first chords", "key of G", "key of D"],
    frets: [3, 2, 0, 0, 0, 3],
    fingers: [2, 1, 0, 0, 0, 3],
  }),
  makeChord({
    id: "D",
    name: "D",
    root: "D",
    quality: "major",
    tier: "first",
    tags: ["first chords", "key of G", "key of D"],
    frets: [-1, -1, 0, 2, 3, 2],
    fingers: [0, 0, 0, 1, 3, 2],
  }),
  makeChord({
    id: "A",
    name: "A",
    root: "A",
    quality: "major",
    tier: "first",
    tags: ["first chords", "key of D", "key of A"],
    frets: [-1, 0, 2, 2, 2, 0],
    fingers: [0, 0, 1, 2, 3, 0],
  }),
  makeChord({
    id: "E",
    name: "E",
    root: "E",
    quality: "major",
    tier: "first",
    tags: ["first chords", "key of A", "key of E"],
    frets: [0, 2, 2, 1, 0, 0],
    fingers: [0, 2, 3, 1, 0, 0],
  }),
  makeChord({
    id: "F",
    name: "F (mini)",
    altNames: ["F", "F maj"],
    root: "F",
    quality: "major",
    tier: "open",
    tags: ["key of C", "tricky"],
    frets: [-1, -1, 3, 2, 1, 1],
    fingers: [0, 0, 3, 2, 1, 1],
  }),

  // --- Open minors ---
  makeChord({
    id: "Am",
    name: "A minor",
    altNames: ["Am"],
    root: "A",
    quality: "minor",
    tier: "first",
    tags: ["first chords", "key of C", "key of G"],
    frets: [-1, 0, 2, 2, 1, 0],
    fingers: [0, 0, 2, 3, 1, 0],
  }),
  makeChord({
    id: "Em",
    name: "E minor",
    altNames: ["Em"],
    root: "E",
    quality: "minor",
    tier: "first",
    tags: ["first chords", "key of G", "key of D"],
    frets: [0, 2, 2, 0, 0, 0],
    fingers: [0, 2, 3, 0, 0, 0],
  }),
  makeChord({
    id: "Dm",
    name: "D minor",
    altNames: ["Dm"],
    root: "D",
    quality: "minor",
    tier: "open",
    tags: ["key of F", "key of C"],
    frets: [-1, -1, 0, 2, 3, 1],
    fingers: [0, 0, 0, 2, 3, 1],
  }),

  // --- Dominant 7ths ---
  makeChord({
    id: "G7",
    name: "G7",
    root: "G",
    quality: "dom7",
    tier: "seventh",
    tags: ["key of C", "dominant"],
    frets: [3, 2, 0, 0, 0, 1],
    fingers: [3, 2, 0, 0, 0, 1],
  }),
  makeChord({
    id: "D7",
    name: "D7",
    root: "D",
    quality: "dom7",
    tier: "seventh",
    tags: ["key of G", "dominant"],
    frets: [-1, -1, 0, 2, 1, 2],
    fingers: [0, 0, 0, 2, 1, 3],
  }),
  makeChord({
    id: "E7",
    name: "E7",
    root: "E",
    quality: "dom7",
    tier: "seventh",
    tags: ["key of A", "dominant"],
    frets: [0, 2, 0, 1, 0, 0],
    fingers: [0, 2, 0, 1, 0, 0],
  }),
  makeChord({
    id: "A7",
    name: "A7",
    root: "A",
    quality: "dom7",
    tier: "seventh",
    tags: ["key of D", "dominant"],
    frets: [-1, 0, 2, 0, 2, 0],
    fingers: [0, 0, 2, 0, 3, 0],
  }),
  makeChord({
    id: "B7",
    name: "B7",
    root: "B",
    quality: "dom7",
    tier: "seventh",
    tags: ["key of E", "dominant", "tricky"],
    frets: [-1, 2, 1, 2, 0, 2],
    fingers: [0, 2, 1, 3, 0, 4],
  }),

  // --- Power chords ---
  makeChord({
    id: "E5",
    name: "E5",
    root: "E",
    quality: "power",
    tier: "power",
    tags: ["power"],
    frets: [0, 2, 2, -1, -1, -1],
    fingers: [0, 1, 2, 0, 0, 0],
  }),
  makeChord({
    id: "A5",
    name: "A5",
    root: "A",
    quality: "power",
    tier: "power",
    tags: ["power"],
    frets: [-1, 0, 2, 2, -1, -1],
    fingers: [0, 0, 1, 2, 0, 0],
  }),
  makeChord({
    id: "D5",
    name: "D5",
    root: "D",
    quality: "power",
    tier: "power",
    tags: ["power"],
    frets: [-1, -1, 0, 2, 3, -1],
    fingers: [0, 0, 0, 1, 3, 0],
  }),
];

export const CHORDS_BY_ID: Record<string, ChordDef> = Object.fromEntries(
  CHORDS.map((c) => [c.id, c]),
);

export function getChord(id: string): ChordDef | undefined {
  return CHORDS_BY_ID[id];
}

/** Get human-readable note names for the played strings. */
export function playedNotes(chord: ChordDef): (string | null)[] {
  return chord.playedMidi.map((m) => {
    if (m == null) return null;
    const pc = ((m % 12) + 12) % 12;
    const octave = Math.floor(m / 12) - 1;
    return `${NOTE_NAMES[pc]}${octave}`;
  });
}
