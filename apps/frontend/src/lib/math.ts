export const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;
export type NoteName = (typeof NOTE_NAMES)[number];

const A4_HZ = 440;
const A4_MIDI = 69;

export function hzToMidiFloat(hz: number): number {
  return 12 * Math.log2(hz / A4_HZ) + A4_MIDI;
}

export function midiToHz(midi: number): number {
  return A4_HZ * 2 ** ((midi - A4_MIDI) / 12);
}

export interface NoteInfo {
  name: NoteName;
  octave: number;
  midi: number;
  cents: number;
  targetHz: number;
}

export function hzToNote(hz: number): NoteInfo {
  const midiFloat = hzToMidiFloat(hz);
  const midi = Math.round(midiFloat);
  const cents = (midiFloat - midi) * 100;
  const name = NOTE_NAMES[((midi % 12) + 12) % 12] as NoteName;
  const octave = Math.floor(midi / 12) - 1;
  return { name, octave, midi, cents, targetHz: midiToHz(midi) };
}

export function noteToMidi(name: NoteName, octave: number): number {
  const idx = NOTE_NAMES.indexOf(name);
  if (idx < 0) throw new Error(`unknown note: ${name}`);
  return (octave + 1) * 12 + idx;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function rms(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i] ?? 0;
    sum += s * s;
  }
  return Math.sqrt(sum / Math.max(1, samples.length));
}
