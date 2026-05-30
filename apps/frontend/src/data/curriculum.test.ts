import { LESSONS, SKILL_TREE, getLesson } from "./curriculum";
import { SONGS } from "./songs";

describe("local curriculum", () => {
  it("covers the end-to-end beginner to intermediate learning areas", () => {
    const areas = new Set(SKILL_TREE.map((skill) => skill.area));
    for (const area of [
      "Foundations",
      "Chords",
      "Rhythm",
      "Songs",
      "Technique",
      "Lead",
      "Fretboard",
      "Ear",
      "Theory",
    ]) {
      expect(areas).toContain(area);
    }
  });

  it("keeps every skill connected to local lessons and practice routes", () => {
    for (const skill of SKILL_TREE) {
      expect(skill.practiceRoute).toMatch(/^\/(learn|practice|songs|tools|chords|progress)/);
      for (const lessonId of skill.lessonIds) {
        expect(getLesson(lessonId)).toBeDefined();
      }
    }
  });

  it("uses only local seed songs with skill requirements", () => {
    expect(SONGS.length).toBeGreaterThanOrEqual(3);
    for (const song of SONGS) {
      expect(song.origin).toMatch(/App-authored|public-domain/i);
      expect(song.requiredSkillIds.length).toBeGreaterThan(0);
      expect(song.sections.length).toBeGreaterThan(0);
    }
  });

  it("gives every lesson content and a next action", () => {
    for (const lesson of LESSONS) {
      expect(lesson.sections.length).toBeGreaterThanOrEqual(3);
      expect(lesson.outcomes.length).toBeGreaterThanOrEqual(3);
      expect(lesson.links.length).toBeGreaterThan(0);
    }
  });
});
