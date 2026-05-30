import { SKILL_TREE, type SkillState } from "@/data/curriculum";
import { SONGS } from "@/data/songs";
import type {
  ChordBest,
  ProgressItem,
  ProgressItemType,
  SessionSummary,
  SettingsRow,
  TransitionBest,
} from "@/storage/db";
import { progressItemId } from "@/storage/progress-store";

export interface PracticePlanTask {
  id: string;
  title: string;
  kind: "tool" | "lesson" | "drill" | "song" | "review" | "technique";
  minutes: number;
  route: string;
  reason: string;
  targetIds: string[];
}

export interface PracticePlanOption {
  minutes: 10 | 20 | 45;
  title: string;
  tasks: PracticePlanTask[];
}

export interface ProgressRecap {
  title: string;
  periodDays: 7 | 30;
  practiceDays: number;
  sessionCount: number;
  practiceMinutes: number;
  consistency: string;
  bestImprovement: string;
  currentBlocker: string;
  suggestedFocus: string;
}

export interface ProgressDashboard {
  practiceMinutes7d: number;
  practiceMinutes30d: number;
  streakDays: number;
  masteredCount: number;
  reviewCount: number;
  readyCount: number;
  weakChords: string[];
  weakTransitions: string[];
  highlights: string[];
  blockers: string[];
  recommendations: string[];
  challenges: { id: string; title: string; status: string; progress: number }[];
  recaps: {
    weekly: ProgressRecap;
    monthly: ProgressRecap;
  };
}

export function buildSkillStates(progressItems: Record<string, ProgressItem>): SkillState[] {
  const statusById = new Map<string, SkillState["status"]>();
  return SKILL_TREE.map((skill) => {
    const item = progressItems[progressItemId("skill", skill.id)];
    const lessonItems = skill.lessonIds
      .map((lessonId) => progressItems[progressItemId("lesson", lessonId)])
      .filter((value): value is ProgressItem => Boolean(value));
    const lessonMastery =
      lessonItems.length > 0
        ? lessonItems.reduce((total, lesson) => total + lesson.mastery, 0) / skill.lessonIds.length
        : 0;
    const targetItems = skill.targetIds.flatMap((targetId) =>
      targetProgressItems(progressItems, targetId),
    );
    const targetMastery =
      targetItems.length > 0
        ? targetItems.reduce((total, target) => total + target.mastery, 0) / skill.targetIds.length
        : 0;
    const mastery = Math.max(item?.mastery ?? 0, lessonMastery, targetMastery);
    const requirementsMet = skill.requiredSkillIds.every(
      (requiredId) => statusById.get(requiredId) === "mastered",
    );
    let status: SkillState["status"] = "locked";
    if ((item?.status === "mastered" || mastery >= 85) && skill.lessonIds.length > 0) {
      status = "mastered";
    } else if (
      item?.status === "review" ||
      targetItems.some((target) => target.status === "review")
    ) {
      status = "review";
    } else if (item || lessonItems.length > 0 || targetItems.length > 0) {
      status = "in-progress";
    } else if (skill.requiredSkillIds.length === 0 || requirementsMet) {
      status = "ready";
    }
    statusById.set(skill.id, status);
    return { ...skill, status, mastery: Math.round(mastery) };
  });
}

export function buildPracticePlanOptions(input: {
  settings: Pick<SettingsRow, "dailyPracticeTargetMinutes" | "goals" | "skillLevel">;
  chordBests: Record<string, ChordBest>;
  transitionBests: Record<string, TransitionBest>;
  progressItems: Record<string, ProgressItem>;
}): PracticePlanOption[] {
  const skills = buildSkillStates(input.progressItems);
  const nextSkill =
    skills.find((skill) => ["review", "in-progress", "ready"].includes(skill.status)) ?? skills[0]!;
  const weakChord = weakestChord(input.chordBests) ?? "G";
  const weakTransition = weakestTransition(input.transitionBests) ?? "G->C";
  const song =
    SONGS.find((candidate) =>
      candidate.requiredSkillIds.every((skillId) => {
        const state = skills.find((skill) => skill.id === skillId);
        return (
          state?.status === "mastered" ||
          state?.status === "in-progress" ||
          state?.status === "ready"
        );
      }),
    ) ?? SONGS[0]!;

  return [
    {
      minutes: 10,
      title: "Quick reset",
      tasks: [
        task(
          "tune",
          "Tune all strings",
          "tool",
          2,
          "/tools/tuner",
          "Every score improves when the guitar starts in tune.",
        ),
        task(
          "chord",
          `Clean up ${weakChord}`,
          "drill",
          5,
          `/chords/${weakChord}`,
          "This is the chord most likely to repay slow attention.",
          [weakChord],
        ),
        task(
          "next",
          nextSkill.title,
          "lesson",
          3,
          nextSkill.practiceRoute,
          "Move the next ready skill forward.",
          [nextSkill.id],
        ),
      ],
    },
    {
      minutes: 20,
      title: "Balanced practice",
      tasks: [
        task(
          "tune",
          "Tune and check input level",
          "tool",
          3,
          "/tools/tuner",
          "Stable input keeps feedback honest.",
        ),
        task(
          "transition",
          `${weakTransition} tempo ladder`,
          "drill",
          6,
          "/practice/chord-change",
          "Slow clean changes create speed later.",
          [weakTransition],
        ),
        task(
          "skill",
          nextSkill.title,
          "lesson",
          5,
          nextSkill.practiceRoute,
          "This is your next curriculum step.",
          [nextSkill.id],
        ),
        task(
          "song",
          `Song section: ${song.title}`,
          "song",
          6,
          `/songs/${song.id}`,
          "Apply the drill in music before stopping.",
          [song.id],
        ),
      ],
    },
    {
      minutes: 45,
      title: "Deep session",
      tasks: [
        task(
          "tune",
          "Tune, then calibrate listening space",
          "tool",
          5,
          "/tools/tuner",
          "Good setup prevents noisy false feedback.",
        ),
        task(
          "warmup",
          "Finger pressure and release",
          "technique",
          6,
          "/learn/lessons/barre-chord-prep",
          "Warm hands and lighter pressure support clean notes.",
        ),
        task(
          "drill",
          `${weakTransition} focused changes`,
          "drill",
          12,
          "/practice/chord-change",
          "Keep the BPM under your clean ceiling.",
          [weakTransition],
        ),
        task(
          "rhythm",
          "Timing and strumming",
          "drill",
          8,
          "/practice/strumming",
          "Rhythm progress carries every song.",
          ["strumming"],
        ),
        task(
          "song",
          `Loop ${song.title}`,
          "song",
          10,
          `/songs/${song.id}`,
          "Practice one section slowly, then one full pass.",
          [song.id],
        ),
        task(
          "review",
          "Journal best take and blocker",
          "review",
          4,
          "/history",
          "A short note gives tomorrow a better target.",
        ),
      ],
    },
  ];
}

export function buildProgressDashboard(input: {
  chordBests: Record<string, ChordBest>;
  transitionBests: Record<string, TransitionBest>;
  progressItems: Record<string, ProgressItem>;
  sessions: SessionSummary[];
}): ProgressDashboard {
  const skills = buildSkillStates(input.progressItems);
  const weakChords = Object.values(input.chordBests)
    .sort((a, b) => a.lastScore - b.lastScore)
    .slice(0, 4)
    .map((item) => item.chordId);
  const weakTransitions = Object.values(input.transitionBests)
    .sort((a, b) => a.averageScore - b.averageScore)
    .slice(0, 4)
    .map((item) => item.id);
  const practiceMinutes7d = practiceMinutes(input.sessions, 7);
  const practiceMinutes30d = practiceMinutes(input.sessions, 30);
  const masteredCount = skills.filter((skill) => skill.status === "mastered").length;
  const reviewCount = skills.filter((skill) => skill.status === "review").length;
  const readyCount = skills.filter((skill) => skill.status === "ready").length;
  const streakDays = calculateStreakDays(input.sessions);
  const blockers =
    weakChords.length > 0 || weakTransitions.length > 0
      ? [
          weakChords[0] ? `Chord to review: ${weakChords[0]}` : "",
          weakTransitions[0] ? `Transition to slow down: ${weakTransitions[0]}` : "",
        ].filter(Boolean)
      : ["No persistent blocker yet. Play a few scored drills to reveal one."];
  return {
    practiceMinutes7d,
    practiceMinutes30d,
    streakDays,
    masteredCount,
    reviewCount,
    readyCount,
    weakChords,
    weakTransitions,
    highlights: [
      input.sessions.length > 0
        ? `${input.sessions.length} saved practice sessions`
        : "First session will create your baseline.",
      masteredCount > 0 ? `${masteredCount} mastered skill nodes` : "No mastered skills yet.",
      streakDays > 0
        ? `${streakDays}-day local practice streak`
        : "No streak pressure; start with one focused session.",
    ],
    blockers,
    recommendations: [
      "Start with the Today plan.",
      "Only raise tempo after clean repetitions.",
      "Use consented recording when you want backend Solitito review; useful progress still works with consent off.",
    ],
    challenges: buildChallenges(input.progressItems, input.sessions, masteredCount, streakDays),
    recaps: {
      weekly: buildProgressRecap({
        title: "Weekly recap",
        periodDays: 7,
        sessions: input.sessions,
        progressItems: input.progressItems,
        weakChords,
        weakTransitions,
        skills,
      }),
      monthly: buildProgressRecap({
        title: "Monthly recap",
        periodDays: 30,
        sessions: input.sessions,
        progressItems: input.progressItems,
        weakChords,
        weakTransitions,
        skills,
      }),
    },
  };
}

const TARGET_PROGRESS_TYPES: ProgressItemType[] = [
  "chord",
  "transition",
  "rhythm",
  "technique",
  "scale",
  "theory",
  "song",
  "song-section",
  "ear-training",
  "fretboard",
  "challenge",
];

function targetProgressItems(
  progressItems: Record<string, ProgressItem>,
  targetId: string,
): ProgressItem[] {
  return TARGET_PROGRESS_TYPES.map(
    (itemType) => progressItems[progressItemId(itemType, targetId)],
  ).filter((item): item is ProgressItem => Boolean(item));
}

export function weakestChord(chordBests: Record<string, ChordBest>): string | null {
  const [candidate] = Object.values(chordBests).sort((a, b) => a.lastScore - b.lastScore);
  return candidate?.chordId ?? null;
}

export function weakestTransition(transitionBests: Record<string, TransitionBest>): string | null {
  const [candidate] = Object.values(transitionBests).sort(
    (a, b) => a.averageScore - b.averageScore,
  );
  return candidate?.id ?? null;
}

function task(
  id: string,
  title: string,
  kind: PracticePlanTask["kind"],
  minutes: number,
  route: string,
  reason: string,
  targetIds: string[] = [],
): PracticePlanTask {
  return { id, title, kind, minutes, route, reason, targetIds };
}

function practiceMinutes(sessions: SessionSummary[], days: number): number {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return sessions.reduce((total, session) => {
    if (new Date(session.startedAtIso).getTime() < cutoff) return total;
    const ms = new Date(session.endedAtIso).getTime() - new Date(session.startedAtIso).getTime();
    return total + Math.max(1, Math.round(ms / 60_000));
  }, 0);
}

function calculateStreakDays(sessions: SessionSummary[]): number {
  const days = new Set(sessions.map((session) => session.startedAtIso.slice(0, 10)));
  const today = startOfUtcDay(new Date());
  const yesterday = addUtcDays(today, -1);
  let current: Date | null = null;
  if (days.has(utcDayKey(today))) {
    current = today;
  } else if (days.has(utcDayKey(yesterday))) {
    current = yesterday;
  }
  if (!current) return 0;

  let streak = 0;
  while (current) {
    const key = utcDayKey(current);
    if (!days.has(key)) break;
    streak += 1;
    current = addUtcDays(current, -1);
  }
  return streak;
}

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addUtcDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}

function utcDayKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function buildProgressRecap(input: {
  title: string;
  periodDays: 7 | 30;
  sessions: SessionSummary[];
  progressItems: Record<string, ProgressItem>;
  weakChords: string[];
  weakTransitions: string[];
  skills: SkillState[];
}): ProgressRecap {
  const cutoff = Date.now() - input.periodDays * 24 * 60 * 60 * 1000;
  const sessions = input.sessions.filter(
    (session) => new Date(session.startedAtIso).getTime() >= cutoff,
  );
  const practiceMinutes = practiceMinutesForSessions(sessions);
  const practiceDays = new Set(sessions.map((session) => session.startedAtIso.slice(0, 10))).size;
  return {
    title: input.title,
    periodDays: input.periodDays,
    practiceDays,
    sessionCount: sessions.length,
    practiceMinutes,
    consistency: consistencySummary(practiceDays, input.periodDays),
    bestImprovement:
      bestProgressEvidence(input.progressItems, cutoff) ??
      bestSessionEvidence(sessions) ??
      "No measured improvement yet.",
    currentBlocker: currentBlocker(input.weakChords, input.weakTransitions, input.skills),
    suggestedFocus: suggestedFocus(input.weakChords, input.weakTransitions, input.skills),
  };
}

function practiceMinutesForSessions(sessions: SessionSummary[]): number {
  return sessions.reduce((total, session) => {
    const ms = new Date(session.endedAtIso).getTime() - new Date(session.startedAtIso).getTime();
    return total + Math.max(1, Math.round(ms / 60_000));
  }, 0);
}

function consistencySummary(practiceDays: number, periodDays: 7 | 30): string {
  if (practiceDays === 0) return "No practice days logged in this window.";
  const targetDays = periodDays === 7 ? 4 : 16;
  const pace = practiceDays >= targetDays ? "on pace" : "building";
  return `${practiceDays}/${periodDays} days practiced (${pace}).`;
}

function bestProgressEvidence(
  progressItems: Record<string, ProgressItem>,
  cutoff: number,
): string | null {
  const [candidate] = Object.values(progressItems)
    .filter((item) => {
      const practicedAt = item.lastPracticedIso ?? item.updatedAtIso;
      return new Date(practicedAt).getTime() >= cutoff && (item.attempts > 0 || item.mastery > 0);
    })
    .sort((a, b) => progressEvidenceScore(b) - progressEvidenceScore(a));
  if (!candidate) return null;
  return `${progressTypeLabel(candidate.itemType)} ${candidate.itemId}: ${Math.round(
    progressEvidenceScore(candidate),
  )}% evidence.`;
}

function progressEvidenceScore(item: ProgressItem): number {
  return item.lastScore ?? item.bestScore ?? item.mastery;
}

function bestSessionEvidence(sessions: SessionSummary[]): string | null {
  const [candidate] = sessions
    .filter((session) => session.events > 0 || session.averageScore > 0)
    .sort((a, b) => b.averageScore - a.averageScore);
  if (!candidate) return null;
  return `${drillTypeLabel(candidate.drillType)}: ${candidate.averageScore.toFixed(
    1,
  )}/10 across ${candidate.events || 1} event${(candidate.events || 1) === 1 ? "" : "s"}.`;
}

function currentBlocker(
  weakChords: string[],
  weakTransitions: string[],
  skills: SkillState[],
): string {
  if (weakChords[0]) return `Chord cleanliness: ${weakChords[0]}`;
  if (weakTransitions[0]) return `Transition control: ${weakTransitions[0]}`;
  const reviewSkill = skills.find((skill) => skill.status === "review");
  if (reviewSkill) return `Review skill: ${reviewSkill.title}`;
  return "No clear blocker yet.";
}

function suggestedFocus(
  weakChords: string[],
  weakTransitions: string[],
  skills: SkillState[],
): string {
  if (weakTransitions[0]) return `Slow tempo ladder for ${weakTransitions[0]}.`;
  if (weakChords[0]) return `Five clean checks of ${weakChords[0]} before speed work.`;
  const nextSkill = skills.find((skill) =>
    ["review", "in-progress", "ready"].includes(skill.status),
  );
  return nextSkill ? nextSkill.title : "Choose a song section and record a short review note.";
}

function progressTypeLabel(type: ProgressItemType): string {
  if (type === "song-section") return "Song section";
  if (type === "ear-training") return "Ear training";
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function drillTypeLabel(type: SessionSummary["drillType"]): string {
  return type
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildChallenges(
  progressItems: Record<string, ProgressItem>,
  sessions: SessionSummary[],
  masteredCount: number,
  streakDays: number,
): ProgressDashboard["challenges"] {
  const cleanChord = Object.values(progressItems).filter(
    (item) => item.itemType === "chord" && item.mastery >= 80,
  ).length;
  const songMastered = Object.values(progressItems).filter(
    (item) => item.itemType === "song" && item.mastery >= 85,
  ).length;
  return [
    {
      id: "first-clean-chord",
      title: "First clean chord",
      status: cleanChord > 0 ? "complete" : "active",
      progress: Math.min(1, cleanChord),
    },
    {
      id: "seven-day-transition",
      title: "7-day chord transition challenge",
      status: streakDays >= 7 ? "complete" : "active",
      progress: Math.min(1, streakDays / 7),
    },
    {
      id: "beginner-path",
      title: "30-day beginner path",
      status: masteredCount >= 6 || sessions.length >= 30 ? "complete" : "active",
      progress: Math.min(1, Math.max(masteredCount / 6, sessions.length / 30)),
    },
    {
      id: "first-song",
      title: "First complete song",
      status: songMastered > 0 ? "complete" : "active",
      progress: Math.min(1, songMastered),
    },
  ];
}
