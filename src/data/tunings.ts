import { type NoteName, noteToMidi } from "@/lib/math";

export interface StringTuning {
  note: NoteName;
  octave: number;
  midi: number;
}

export interface Tuning {
  id: string;
  name: string;
  /** Low-to-high order: string index 0 is low E (thickest), index 5 is high E. */
  strings: StringTuning[];
}

function st(note: NoteName, octave: number): StringTuning {
  return { note, octave, midi: noteToMidi(note, octave) };
}

export const TUNINGS: Tuning[] = [
  {
    id: "standard",
    name: "Standard (E A D G B E)",
    strings: [st("E", 2), st("A", 2), st("D", 3), st("G", 3), st("B", 3), st("E", 4)],
  },
  {
    id: "drop-d",
    name: "Drop D (D A D G B E)",
    strings: [st("D", 2), st("A", 2), st("D", 3), st("G", 3), st("B", 3), st("E", 4)],
  },
  {
    id: "half-step-down",
    name: "Half-step down (E♭ A♭ D♭ G♭ B♭ E♭)",
    strings: [st("D#", 2), st("G#", 2), st("C#", 3), st("F#", 3), st("A#", 3), st("D#", 4)],
  },
  {
    id: "dadgad",
    name: "DADGAD",
    strings: [st("D", 2), st("A", 2), st("D", 3), st("G", 3), st("A", 3), st("D", 4)],
  },
  {
    id: "open-g",
    name: "Open G (D G D G B D)",
    strings: [st("D", 2), st("G", 2), st("D", 3), st("G", 3), st("B", 3), st("D", 4)],
  },
];

export const DEFAULT_TUNING = TUNINGS[0]!;

export function getTuning(id: string): Tuning {
  return TUNINGS.find((t) => t.id === id) ?? DEFAULT_TUNING;
}
