import type { ProgressItem } from "@/storage/db";
import { progressItemId } from "@/storage/progress-store";

export interface SongSection {
  id: string;
  name: string;
  bars: number;
  chords: string[];
  guidance: string;
}

export interface Song {
  id: string;
  title: string;
  origin: string;
  difficulty: "Beginner" | "Late beginner" | "Early intermediate";
  requiredSkillIds: string[];
  chords: string[];
  tempo: number;
  strummingPattern: string;
  recommendation: string;
  sections: SongSection[];
}

export const SONGS: Song[] = [
  {
    id: "open-road-study",
    title: "Open Road Study",
    origin: "App-authored original",
    difficulty: "Beginner",
    requiredSkillIds: ["first-open-chords", "steady-eighth-strums"],
    chords: ["G", "C", "D", "Em"],
    tempo: 76,
    strummingPattern: "D D U U D U",
    recommendation: "Best first song once G-C-D changes are mostly clean around 70 BPM.",
    sections: [
      {
        id: "verse",
        name: "Verse",
        bars: 8,
        chords: ["G", "C", "G", "D"],
        guidance: "Loop until the D chord arrives without a pause.",
      },
      {
        id: "chorus",
        name: "Chorus",
        bars: 8,
        chords: ["Em", "C", "G", "D"],
        guidance: "Keep the Em-to-C motion light and let open strings ring.",
      },
    ],
  },
  {
    id: "steady-rain-waltz",
    title: "Steady Rain Waltz",
    origin: "App-authored original",
    difficulty: "Beginner",
    requiredSkillIds: ["first-open-chords", "steady-eighth-strums", "barre-prep"],
    chords: ["C", "G", "Am", "F"],
    tempo: 68,
    strummingPattern: "3/4: D - U D - U",
    recommendation: "Use the mini-F shape and keep the waltz count relaxed.",
    sections: [
      {
        id: "a",
        name: "A section",
        bars: 8,
        chords: ["C", "G", "Am", "F"],
        guidance: "Let the F shape be small and quiet before making it louder.",
      },
      {
        id: "b",
        name: "B section",
        bars: 8,
        chords: ["F", "C", "G", "C"],
        guidance: "Count in three and resist speeding up into the C chord.",
      },
    ],
  },
  {
    id: "twelve-bar-e",
    title: "Twelve-Bar in E",
    origin: "Traditional public-domain form",
    difficulty: "Late beginner",
    requiredSkillIds: ["power-chords", "steady-eighth-strums"],
    chords: ["E", "A", "B7", "E7", "A7"],
    tempo: 84,
    strummingPattern: "Shuffle eighths",
    recommendation: "Great for dominant 7ths, steady rhythm, and first blues vocabulary.",
    sections: [
      {
        id: "form",
        name: "12-bar form",
        bars: 12,
        chords: ["E", "E", "E", "E7", "A", "A", "E", "E", "B7", "A7", "E", "B7"],
        guidance:
          "Name the form out loud: four bars of I, two of IV, two of I, then the turnaround.",
      },
    ],
  },
];

export const SONGS_BY_ID: Record<string, Song> = Object.fromEntries(
  SONGS.map((song) => [song.id, song]),
);

export function getSong(id: string | undefined): Song | undefined {
  return id ? SONGS_BY_ID[id] : undefined;
}

export function songProgress(
  progressItems: Record<string, ProgressItem>,
  songId: string,
): ProgressItem | undefined {
  return progressItems[progressItemId("song", songId)];
}

export function completedSongSectionIds(progress: ProgressItem | undefined): string[] {
  const value = progress?.metadata.completedSectionIds;
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
