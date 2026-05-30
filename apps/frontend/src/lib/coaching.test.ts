import type { ChordBest, ProgressItem, SessionSummary, TransitionBest } from "@/storage/db";
import { progressItemId } from "@/storage/progress-store";
import { buildPracticePlanOptions, buildProgressDashboard, buildSkillStates } from "./coaching";

const SETTINGS = {
  dailyPracticeTargetMinutes: 20,
  goals: ["Play full songs"],
  skillLevel: "beginner" as const,
};

describe("coaching rules", () => {
  it("unlocks the first skill and derives mastery from lesson progress", () => {
    const progressItems: Record<string, ProgressItem> = {
      [progressItemId("lesson", "tuning-basics")]: progressItem({
        itemType: "lesson",
        itemId: "tuning-basics",
        status: "mastered",
        mastery: 100,
      }),
    };

    const states = buildSkillStates(progressItems);
    expect(states[0]?.id).toBe("setup-tuning");
    expect(states[0]?.status).toBe("mastered");
    expect(states[1]?.status).toBe("ready");
  });

  it("builds 10, 20, and 45 minute practice plans around weak evidence", () => {
    const chordBests: Record<string, ChordBest> = {
      G: {
        chordId: "G",
        bestScore: 8,
        lastScore: 8,
        attempts: 3,
        lastPlayedIso: "2026-05-30T00:00:00Z",
      },
      C: {
        chordId: "C",
        bestScore: 6,
        lastScore: 4,
        attempts: 3,
        lastPlayedIso: "2026-05-30T00:00:00Z",
      },
    };
    const transitionBests: Record<string, TransitionBest> = {
      "G->C": {
        id: "G->C",
        fromChordId: "G",
        toChordId: "C",
        bpmCeiling: 60,
        averageScore: 5,
        attempts: 4,
        lastPlayedIso: "2026-05-30T00:00:00Z",
      },
    };

    const plans = buildPracticePlanOptions({
      settings: SETTINGS,
      chordBests,
      transitionBests,
      progressItems: {},
    });

    expect(plans.map((plan) => plan.minutes)).toEqual([10, 20, 45]);
    expect(plans[0]?.tasks.some((task) => task.title.includes("C"))).toBe(true);
    expect(plans[1]?.tasks.some((task) => task.targetIds.includes("G->C"))).toBe(true);
  });

  it("uses trainer and target progress as skill-tree evidence", () => {
    const states = buildSkillStates({
      [progressItemId("fretboard", "low-e-notes")]: progressItem({
        itemType: "fretboard",
        itemId: "low-e-notes",
        mastery: 90,
      }),
      [progressItemId("ear-training", "major-minor")]: progressItem({
        itemType: "ear-training",
        itemId: "major-minor",
        mastery: 70,
      }),
    });

    expect(states.find((skill) => skill.id === "fretboard-notes")?.status).toBe("in-progress");
    expect(states.find((skill) => skill.id === "fretboard-notes")?.mastery).toBe(13);
    expect(states.find((skill) => skill.id === "ear-training")?.status).toBe("in-progress");
  });

  it("summarizes streaks, challenges, and blockers deterministically", () => {
    const now = new Date();
    const sessions: SessionSummary[] = [
      sessionSummary(now),
      sessionSummary(new Date(now.getTime() - 24 * 60 * 60 * 1000)),
    ];
    const dashboard = buildProgressDashboard({
      chordBests: {
        D: {
          chordId: "D",
          bestScore: 9,
          lastScore: 5,
          attempts: 2,
          lastPlayedIso: now.toISOString(),
        },
      },
      transitionBests: {},
      progressItems: {
        [progressItemId("chord", "D")]: progressItem({
          itemType: "chord",
          itemId: "D",
          mastery: 90,
          lastScore: 90,
          lastPracticedIso: now.toISOString(),
          updatedAtIso: now.toISOString(),
        }),
      },
      sessions,
    });

    expect(dashboard.streakDays).toBe(2);
    expect(dashboard.weakChords).toEqual(["D"]);
    expect(dashboard.challenges.map((challenge) => challenge.id)).toContain("first-song");
    expect(dashboard.recaps.weekly.practiceDays).toBe(2);
    expect(dashboard.recaps.weekly.bestImprovement).toContain("Chord D");
    expect(dashboard.recaps.monthly.suggestedFocus).toBe(
      "Five clean checks of D before speed work.",
    );
  });

  it("keeps the full practice streak during the one-day grace window", () => {
    const now = new Date();
    const sessions: SessionSummary[] = [
      sessionSummary(new Date(now.getTime() - 24 * 60 * 60 * 1000)),
      sessionSummary(new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)),
      sessionSummary(new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)),
    ];

    const dashboard = buildProgressDashboard({
      chordBests: {},
      transitionBests: {},
      progressItems: {},
      sessions,
    });
    const transitionChallenge = dashboard.challenges.find(
      (challenge) => challenge.id === "seven-day-transition",
    );

    expect(dashboard.streakDays).toBe(3);
    expect(transitionChallenge?.progress).toBeCloseTo(3 / 7);
  });
});

function progressItem(
  patch: Partial<ProgressItem> & Pick<ProgressItem, "itemType" | "itemId">,
): ProgressItem {
  const now = "2026-05-30T00:00:00Z";
  return {
    id: progressItemId(patch.itemType, patch.itemId),
    itemType: patch.itemType,
    itemId: patch.itemId,
    status: patch.status ?? "in-progress",
    mastery: patch.mastery ?? 0,
    attempts: patch.attempts ?? 1,
    minutes: patch.minutes ?? 5,
    bestScore: patch.bestScore ?? null,
    lastScore: patch.lastScore ?? null,
    bpmCeiling: patch.bpmCeiling ?? null,
    dueAtIso: patch.dueAtIso ?? null,
    lastPracticedIso: patch.lastPracticedIso ?? now,
    updatedAtIso: patch.updatedAtIso ?? now,
    metadata: patch.metadata ?? {},
  };
}

function sessionSummary(start: Date): SessionSummary {
  return {
    id: crypto.randomUUID(),
    startedAtIso: start.toISOString(),
    endedAtIso: new Date(start.getTime() + 10 * 60 * 1000).toISOString(),
    drillType: "chord-change",
    chords: ["G", "C"],
    targetBpm: 70,
    averageScore: 7,
    events: 12,
  };
}
