export interface Progression {
  id: string;
  name: string;
  key: string;
  /** Ordered chord ids, one per bar. */
  chords: readonly string[];
  defaultBpm: number;
  tags: readonly string[];
}

export const PROGRESSIONS: Progression[] = [
  {
    id: "I-IV-V-G",
    name: "I–IV–V in G",
    key: "G",
    chords: ["G", "C", "D", "G"],
    defaultBpm: 70,
    tags: ["beginner", "essentials"],
  },
  {
    id: "I-IV-V-C",
    name: "I–IV–V in C",
    key: "C",
    chords: ["C", "F", "G", "C"],
    defaultBpm: 70,
    tags: ["beginner", "essentials"],
  },
  {
    id: "I-IV-V-D",
    name: "I–IV–V in D",
    key: "D",
    chords: ["D", "G", "A", "D"],
    defaultBpm: 75,
    tags: ["beginner", "essentials"],
  },
  {
    id: "vi-IV-I-V-G",
    name: "vi–IV–I–V in G",
    key: "G",
    chords: ["Em", "C", "G", "D"],
    defaultBpm: 80,
    tags: ["pop"],
  },
  {
    id: "vi-IV-I-V-C",
    name: "vi–IV–I–V in C",
    key: "C",
    chords: ["Am", "F", "C", "G"],
    defaultBpm: 80,
    tags: ["pop"],
  },
  {
    id: "12-bar-blues-E",
    name: "12-bar blues in E",
    key: "E",
    chords: ["E", "E", "E", "E", "A7", "A7", "E", "E", "B7", "A7", "E", "B7"],
    defaultBpm: 90,
    tags: ["blues"],
  },
  {
    id: "12-bar-blues-A",
    name: "12-bar blues in A",
    key: "A",
    chords: ["A", "A", "A", "A", "D", "D", "A", "A", "E7", "D", "A", "E7"],
    defaultBpm: 90,
    tags: ["blues"],
  },
];

export function getProgression(id: string): Progression | undefined {
  return PROGRESSIONS.find((p) => p.id === id);
}
