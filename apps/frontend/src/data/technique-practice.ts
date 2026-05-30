import type { ProgressItemType } from "@/storage/db";

export interface TechniquePracticeTarget {
  id: string;
  title: string;
  area: "Technique" | "Lead" | "Theory";
  itemType: Extract<ProgressItemType, "technique" | "scale" | "theory">;
  itemId: string;
  skillId: string;
  lessonId: string;
  defaultMinutes: number;
  defaultBpm: number | null;
  focus: string;
  checkpoints: string[];
}

export const TECHNIQUE_TARGETS: TechniquePracticeTarget[] = [
  {
    id: "barre-pressure",
    title: "Barre pressure release",
    area: "Technique",
    itemType: "technique",
    itemId: "pressure",
    skillId: "barre-prep",
    lessonId: "barre-chord-prep",
    defaultMinutes: 6,
    defaultBpm: null,
    focus: "Mini-F shape, release between repetitions, no thumb squeeze.",
    checkpoints: ["Even pressure", "Relaxed thumb", "Clean top strings"],
  },
  {
    id: "power-muting",
    title: "Power chord muting",
    area: "Technique",
    itemType: "technique",
    itemId: "muting",
    skillId: "power-chords",
    lessonId: "power-chords-muting",
    defaultMinutes: 6,
    defaultBpm: 72,
    focus: "Move compact E5/A5/D5 shapes while keeping unused strings quiet.",
    checkpoints: ["Compact shape", "Muted unused strings", "Even downstrokes"],
  },
  {
    id: "pentatonic-box",
    title: "A minor pentatonic box",
    area: "Lead",
    itemType: "scale",
    itemId: "A-minor-pentatonic",
    skillId: "pentatonic-scale",
    lessonId: "pentatonic-scale",
    defaultMinutes: 8,
    defaultBpm: 70,
    focus: "Two strings at a time with alternate picking and note names.",
    checkpoints: ["Alternate picking", "Even notes", "Names out loud"],
  },
  {
    id: "lead-slide",
    title: "Slides",
    area: "Lead",
    itemType: "technique",
    itemId: "slide",
    skillId: "lead-techniques",
    lessonId: "lead-techniques",
    defaultMinutes: 5,
    defaultBpm: 60,
    focus: "Slide into the target fret with steady pressure and clear arrival pitch.",
    checkpoints: ["Clear start", "Clear arrival", "No rushed release"],
  },
  {
    id: "lead-bend",
    title: "Bends and vibrato",
    area: "Lead",
    itemType: "technique",
    itemId: "bend",
    skillId: "lead-techniques",
    lessonId: "lead-techniques",
    defaultMinutes: 6,
    defaultBpm: null,
    focus: "Bend slowly to pitch, then add small relaxed vibrato.",
    checkpoints: ["Pitch target", "Finger support", "Relaxed vibrato"],
  },
  {
    id: "fingerstyle-alternating-bass",
    title: "Alternating bass",
    area: "Technique",
    itemType: "technique",
    itemId: "alternating-bass",
    skillId: "fingerstyle-basics",
    lessonId: "fingerstyle-intro",
    defaultMinutes: 8,
    defaultBpm: 64,
    focus: "Thumb alternates bass notes while fingers keep treble notes even.",
    checkpoints: ["Thumb assignment", "Even volume", "Small hand motion"],
  },
  {
    id: "theory-scale-degree",
    title: "Scale degrees in songs",
    area: "Theory",
    itemType: "theory",
    itemId: "scale-degree",
    skillId: "theory-for-guitar",
    lessonId: "music-theory-basics",
    defaultMinutes: 5,
    defaultBpm: null,
    focus: "Name I, IV, V, and vi in one practiced song key.",
    checkpoints: ["Key named", "Degrees named", "Song example found"],
  },
];

export function getTechniqueTarget(id: string | null | undefined): TechniquePracticeTarget {
  return TECHNIQUE_TARGETS.find((target) => target.id === id) ?? TECHNIQUE_TARGETS[0]!;
}
