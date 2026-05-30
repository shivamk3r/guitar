import { SKILL_TREE } from "./curriculum";
import { TECHNIQUE_TARGETS, getTechniqueTarget } from "./technique-practice";

describe("technique practice targets", () => {
  it("covers later technique, lead, scale, fingerstyle, and theory skills", () => {
    const skillIds = new Set(TECHNIQUE_TARGETS.map((target) => target.skillId));
    for (const skillId of [
      "barre-prep",
      "power-chords",
      "pentatonic-scale",
      "lead-techniques",
      "fingerstyle-basics",
      "theory-for-guitar",
    ]) {
      expect(skillIds).toContain(skillId);
    }
  });

  it("keeps each target connected to a skill target id", () => {
    for (const target of TECHNIQUE_TARGETS) {
      const skill = SKILL_TREE.find((candidate) => candidate.id === target.skillId);
      expect(skill).toBeDefined();
      expect(skill?.targetIds).toContain(target.itemId);
      expect(getTechniqueTarget(target.id)).toBe(target);
    }
  });
});
