import {
  GLOSSARY_CATEGORIES,
  GLOSSARY_TERMS,
  filterGlossaryTerms,
  getGlossaryTerm,
  getRelatedGlossaryTerms,
} from "./glossary";

const REQUIRED_TERMS = [
  "pitch",
  "fret",
  "cent",
  "beat",
  "semitone",
  "sharp",
  "flat",
  "note",
  "chord",
  "tempo",
  "rhythm",
  "tuning",
  "string",
] as const;

describe("glossary data", () => {
  it("contains the beginner guitar terms with lessons and audio examples", () => {
    for (const id of REQUIRED_TERMS) {
      const term = getGlossaryTerm(id);
      expect(term).toBeDefined();
      expect(term?.shortDefinition.length).toBeGreaterThan(10);
      expect(term?.detail.length).toBeGreaterThanOrEqual(2);
      expect(term?.encounter).toMatch(/tuner|chord|practice|drill/i);
      expect(term?.audioExamples.length).toBeGreaterThanOrEqual(2);
      expect(term?.relatedTermIds.length).toBeGreaterThan(0);
    }
  });

  it("keeps categories and related links valid", () => {
    for (const term of GLOSSARY_TERMS) {
      expect(GLOSSARY_CATEGORIES).toContain(term.category);
      expect(getRelatedGlossaryTerms(term).map((related) => related.id)).toEqual(
        term.relatedTermIds,
      );
    }
  });

  it("filters by search text and category", () => {
    expect(filterGlossaryTerms({ query: "BPM", category: "All" }).map((term) => term.id)).toEqual([
      "tempo",
    ]);

    const timingTerms = filterGlossaryTerms({ query: "", category: "Timing" }).map(
      (term) => term.id,
    );
    expect(timingTerms).toEqual(["beat", "tempo", "rhythm"]);

    expect(
      filterGlossaryTerms({ query: "needle", category: "Sound" }).map((term) => term.id),
    ).toEqual(["cent"]);
  });
});
