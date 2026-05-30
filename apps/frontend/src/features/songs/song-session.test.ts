import { SONGS } from "@/data/songs";
import {
  buildSongPracticeMetadata,
  buildSongPracticeSummary,
  buildSongSectionProgressPatch,
  buildStoppedSongPracticeMetadata,
  songPracticeMinutes,
  songSectionProgressId,
} from "./song-session";

describe("song practice sessions", () => {
  const song = SONGS[0]!;
  const section = song.sections[0]!;

  it("builds backend metadata for a completed song section loop", () => {
    expect(
      buildSongPracticeMetadata({
        completedSectionIds: ["verse"],
        mastery: 50,
        minutes: 8,
        section,
        song,
        tempo: 72,
      }),
    ).toMatchObject({
      completionStatus: "completed",
      resultSummary: "Verse complete at 72 BPM",
      score: 10,
      practiceMode: "song_section_loop",
      songId: "open-road-study",
      sectionId: "verse",
      completedSectionIds: ["verse"],
      mastery: 50,
      bpm: 72,
      originalBpm: 76,
      minutes: 8,
      chords: ["G", "C", "G", "D"],
      bars: 8,
    });
  });

  it("builds local history summaries and rounded practice minutes", () => {
    expect(
      buildSongPracticeSummary({
        id: "session-1",
        score: 10,
        section,
        startedAtIso: "2026-05-30T10:00:00.000Z",
        endedAtIso: "2026-05-30T10:07:35.000Z",
        tempo: 72,
      }),
    ).toEqual({
      id: "session-1",
      startedAtIso: "2026-05-30T10:00:00.000Z",
      endedAtIso: "2026-05-30T10:07:35.000Z",
      drillType: "song-practice",
      chords: ["G", "C", "G", "D"],
      targetBpm: 72,
      averageScore: 10,
      events: 8,
      completionStatus: "completed",
      resultSummary: "Verse complete at 72 BPM",
    });

    expect(
      songPracticeMinutes({
        startedAtIso: "2026-05-30T10:00:00.000Z",
        endedAtIso: "2026-05-30T10:07:35.000Z",
      }),
    ).toBe(8);
  });

  it("builds durable song-section progress patches", () => {
    expect(songSectionProgressId(song.id, section.id)).toBe("open-road-study:verse");
    expect(
      buildSongSectionProgressPatch({
        endedAtIso: "2026-05-30T10:08:00.000Z",
        minutes: 8,
        section,
        song,
        tempo: 72,
      }),
    ).toEqual({
      itemType: "song-section",
      itemId: "open-road-study:verse",
      status: "mastered",
      mastery: 100,
      attempts: 1,
      minutes: 8,
      bestScore: 100,
      lastScore: 100,
      lastPracticedIso: "2026-05-30T10:08:00.000Z",
      metadata: {
        songId: "open-road-study",
        songTitle: "Open Road Study",
        sectionId: "verse",
        sectionName: "Verse",
        bpm: 72,
        originalBpm: 76,
        bars: 8,
        chords: ["G", "C", "G", "D"],
      },
    });
  });

  it("builds stopped song practice metadata and local history without awarding progress", () => {
    expect(
      buildStoppedSongPracticeMetadata({
        minutes: 3,
        section,
        song,
        tempo: 68,
      }),
    ).toMatchObject({
      completionStatus: "stopped",
      resultSummary: "Verse stopped at 68 BPM",
      practiceMode: "song_section_loop",
      songId: "open-road-study",
      sectionId: "verse",
      bpm: 68,
      minutes: 3,
    });

    expect(
      buildSongPracticeSummary({
        id: "stopped-session",
        score: 0,
        section,
        startedAtIso: "2026-05-30T10:00:00.000Z",
        endedAtIso: "2026-05-30T10:03:00.000Z",
        tempo: 68,
      }),
    ).toMatchObject({
      id: "stopped-session",
      drillType: "song-practice",
      averageScore: 0,
      completionStatus: "stopped",
      resultSummary: "Verse stopped at 68 BPM",
    });
  });
});
