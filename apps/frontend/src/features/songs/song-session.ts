import type { Song, SongSection } from "@/data/songs";
import type { ProgressItem, SessionSummary } from "@/storage/db";

export function buildSongPracticeMetadata(input: {
  completedSectionIds: string[];
  mastery: number;
  minutes: number;
  section: SongSection;
  song: Song;
  tempo: number;
}): Record<string, unknown> {
  return {
    completionStatus: "completed",
    resultSummary: `${input.section.name} complete at ${input.tempo} BPM`,
    score: 10,
    scoreSummary: {
      attempts: 1,
      averageScore: 10,
      bestScore: 10,
    },
    practiceMode: "song_section_loop",
    songId: input.song.id,
    songTitle: input.song.title,
    sectionId: input.section.id,
    sectionName: input.section.name,
    completedSectionIds: input.completedSectionIds,
    mastery: input.mastery,
    bpm: input.tempo,
    originalBpm: input.song.tempo,
    minutes: input.minutes,
    chords: input.section.chords,
    bars: input.section.bars,
  };
}

export function buildStoppedSongPracticeMetadata(input: {
  minutes: number;
  section: SongSection;
  song: Song;
  tempo: number;
}): Record<string, unknown> {
  return {
    completionStatus: "stopped",
    resultSummary: `${input.section.name} stopped at ${input.tempo} BPM`,
    practiceMode: "song_section_loop",
    songId: input.song.id,
    songTitle: input.song.title,
    sectionId: input.section.id,
    sectionName: input.section.name,
    bpm: input.tempo,
    originalBpm: input.song.tempo,
    minutes: input.minutes,
    chords: input.section.chords,
    bars: input.section.bars,
  };
}

export function buildSongPracticeSummary(input: {
  id: string;
  score: number;
  section: SongSection;
  startedAtIso: string;
  endedAtIso: string;
  tempo: number;
}): SessionSummary {
  return {
    id: input.id,
    startedAtIso: input.startedAtIso,
    endedAtIso: input.endedAtIso,
    drillType: "song-practice",
    chords: input.section.chords,
    targetBpm: input.tempo,
    averageScore: input.score,
    events: input.section.bars,
    completionStatus: input.score > 0 ? "completed" : "stopped",
    resultSummary:
      input.score > 0
        ? `${input.section.name} complete at ${input.tempo} BPM`
        : `${input.section.name} stopped at ${input.tempo} BPM`,
  };
}

export function buildSongSectionProgressPatch(input: {
  endedAtIso: string;
  minutes: number;
  section: SongSection;
  song: Song;
  tempo: number;
}): {
  itemType: "song-section";
  itemId: string;
  status: ProgressItem["status"];
  mastery: number;
  attempts: number;
  minutes: number;
  bestScore: number;
  lastScore: number;
  lastPracticedIso: string;
  metadata: Record<string, unknown>;
} {
  return {
    itemType: "song-section",
    itemId: songSectionProgressId(input.song.id, input.section.id),
    status: "mastered",
    mastery: 100,
    attempts: 1,
    minutes: input.minutes,
    bestScore: 100,
    lastScore: 100,
    lastPracticedIso: input.endedAtIso,
    metadata: {
      songId: input.song.id,
      songTitle: input.song.title,
      sectionId: input.section.id,
      sectionName: input.section.name,
      bpm: input.tempo,
      originalBpm: input.song.tempo,
      bars: input.section.bars,
      chords: input.section.chords,
    },
  };
}

export function songSectionProgressId(songId: string, sectionId: string): string {
  return `${songId}:${sectionId}`;
}

export function fallbackSongPracticeStartIso(minutes = 8): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

export function songPracticeMinutes(input: {
  startedAtIso: string;
  endedAtIso: string;
  fallbackMinutes?: number;
}): number {
  const fallback = input.fallbackMinutes ?? 8;
  const elapsedMs = Date.parse(input.endedAtIso) - Date.parse(input.startedAtIso);
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return fallback;
  return Math.max(1, Math.round(elapsedMs / 60_000));
}
