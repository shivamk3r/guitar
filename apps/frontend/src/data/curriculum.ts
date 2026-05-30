import type { ProgressItem } from "@/storage/db";
import { progressItemId } from "@/storage/progress-store";

export type SkillArea =
  | "Foundations"
  | "Chords"
  | "Rhythm"
  | "Songs"
  | "Technique"
  | "Lead"
  | "Fretboard"
  | "Ear"
  | "Theory";

export type LessonKind = "concept" | "mic-free" | "practice-linked" | "ear-training" | "fretboard";

export interface SkillNode {
  id: string;
  title: string;
  area: SkillArea;
  level: "beginner" | "late-beginner" | "early-intermediate" | "intermediate";
  description: string;
  requiredSkillIds: string[];
  lessonIds: string[];
  practiceRoute: string;
  practiceLabel: string;
  targetIds: string[];
}

export interface LessonSection {
  heading: string;
  body: string;
  exercise: string;
}

export interface LessonLink {
  label: string;
  to: string;
}

export interface Lesson {
  id: string;
  title: string;
  area: SkillArea;
  kind: LessonKind;
  level: SkillNode["level"];
  estimatedMinutes: number;
  summary: string;
  outcomes: string[];
  sections: LessonSection[];
  links: LessonLink[];
}

export type SkillState = SkillNode & {
  status: "locked" | "ready" | "in-progress" | "review" | "mastered";
  mastery: number;
};

export const SKILL_TREE: SkillNode[] = [
  {
    id: "setup-tuning",
    title: "Tune and hold stable pitch",
    area: "Foundations",
    level: "beginner",
    description: "Use the tuner, read cents, and get all six strings stable.",
    requiredSkillIds: [],
    lessonIds: ["tuning-basics"],
    practiceRoute: "/tools/tuner",
    practiceLabel: "Open tuner",
    targetIds: ["tuning"],
  },
  {
    id: "read-chord-diagrams",
    title: "Read chord diagrams",
    area: "Foundations",
    level: "beginner",
    description: "Understand frets, fingers, open strings, muted strings, and chord notes.",
    requiredSkillIds: ["setup-tuning"],
    lessonIds: ["reading-chord-diagrams"],
    practiceRoute: "/chords",
    practiceLabel: "Open chord library",
    targetIds: ["fret", "string", "chord"],
  },
  {
    id: "first-open-chords",
    title: "First open chords",
    area: "Chords",
    level: "beginner",
    description: "Build clean G, C, D, Em, Am, A, and E shapes.",
    requiredSkillIds: ["read-chord-diagrams"],
    lessonIds: ["open-chords-1"],
    practiceRoute: "/practice/timed-chords",
    practiceLabel: "Timed chord practice",
    targetIds: ["G", "C", "D", "Em", "Am", "A", "E"],
  },
  {
    id: "clean-chord-changes",
    title: "Clean chord transitions",
    area: "Chords",
    level: "beginner",
    description: "Move between common open chords with less hesitation and fewer muted strings.",
    requiredSkillIds: ["first-open-chords"],
    lessonIds: ["chord-transition-basics"],
    practiceRoute: "/practice/chord-change",
    practiceLabel: "Chord-change drill",
    targetIds: ["G->C", "C->D", "G->D", "Am->C"],
  },
  {
    id: "steady-eighth-strums",
    title: "Steady strumming",
    area: "Rhythm",
    level: "beginner",
    description: "Count beats, play down/up eighth-note patterns, and stay with the click.",
    requiredSkillIds: ["setup-tuning"],
    lessonIds: ["rhythm-and-tempo", "strumming-foundations"],
    practiceRoute: "/practice/strumming",
    practiceLabel: "Strumming drill",
    targetIds: ["D-DU-UDU", "quarter-strums"],
  },
  {
    id: "first-song",
    title: "First complete song form",
    area: "Songs",
    level: "beginner",
    description: "Loop sections, slow the tempo, and play a whole open-chord song.",
    requiredSkillIds: ["clean-chord-changes", "steady-eighth-strums"],
    lessonIds: ["song-practice-basics"],
    practiceRoute: "/songs/open-road-study",
    practiceLabel: "Open Road Study",
    targetIds: ["open-road-study"],
  },
  {
    id: "barre-prep",
    title: "Barre chord preparation",
    area: "Technique",
    level: "late-beginner",
    description: "Build first-finger pressure, mini-F shapes, and clean partial barres.",
    requiredSkillIds: ["first-open-chords"],
    lessonIds: ["barre-chord-prep"],
    practiceRoute: "/practice/technique?target=barre-pressure",
    practiceLabel: "Barre prep",
    targetIds: ["F", "pressure", "muting"],
  },
  {
    id: "power-chords",
    title: "Power chords and muting",
    area: "Technique",
    level: "late-beginner",
    description: "Play E5, A5, and D5 while controlling unused strings.",
    requiredSkillIds: ["steady-eighth-strums"],
    lessonIds: ["power-chords-muting"],
    practiceRoute: "/chords?query=power",
    practiceLabel: "Power chords",
    targetIds: ["E5", "A5", "D5", "muting"],
  },
  {
    id: "pentatonic-scale",
    title: "Minor pentatonic scale",
    area: "Lead",
    level: "early-intermediate",
    description: "Learn the first-box pattern and simple call-and-response phrasing.",
    requiredSkillIds: ["power-chords"],
    lessonIds: ["pentatonic-scale"],
    practiceRoute: "/practice/technique?target=pentatonic-box",
    practiceLabel: "Scale practice",
    targetIds: ["A-minor-pentatonic"],
  },
  {
    id: "lead-techniques",
    title: "Lead techniques",
    area: "Lead",
    level: "early-intermediate",
    description: "Practice slides, hammer-ons, pull-offs, bends, and vibrato honestly.",
    requiredSkillIds: ["pentatonic-scale"],
    lessonIds: ["lead-techniques"],
    practiceRoute: "/practice/technique?target=lead-slide",
    practiceLabel: "Lead practice",
    targetIds: ["slide", "bend", "vibrato", "hammer-on", "pull-off"],
  },
  {
    id: "fingerstyle-basics",
    title: "Fingerstyle basics",
    area: "Technique",
    level: "early-intermediate",
    description: "Assign thumb and fingers, alternate bass, and play simple arpeggios.",
    requiredSkillIds: ["first-open-chords"],
    lessonIds: ["fingerstyle-intro"],
    practiceRoute: "/practice/technique?target=fingerstyle-alternating-bass",
    practiceLabel: "Fingerstyle practice",
    targetIds: ["PIMA", "alternating-bass"],
  },
  {
    id: "fretboard-notes",
    title: "Fretboard note knowledge",
    area: "Fretboard",
    level: "early-intermediate",
    description: "Find notes across all six strings, then connect octave shapes.",
    requiredSkillIds: ["read-chord-diagrams"],
    lessonIds: ["fretboard-notes"],
    practiceRoute: "/progress?focus=fretboard",
    practiceLabel: "Fretboard trainer",
    targetIds: [
      "low-e-notes",
      "a-string-notes",
      "d-string-notes",
      "g-string-notes",
      "b-string-notes",
      "high-e-notes",
      "octaves",
    ],
  },
  {
    id: "ear-training",
    title: "Ear training fundamentals",
    area: "Ear",
    level: "early-intermediate",
    description: "Hear intervals, chord qualities, and simple I-IV-V movement.",
    requiredSkillIds: ["first-open-chords"],
    lessonIds: ["ear-training-basics"],
    practiceRoute: "/progress?focus=ear",
    practiceLabel: "Ear trainer",
    targetIds: ["intervals", "major-minor", "chord-quality", "I-IV-V"],
  },
  {
    id: "theory-for-guitar",
    title: "Theory for guitarists",
    area: "Theory",
    level: "early-intermediate",
    description: "Connect keys, scale degrees, chord families, and common progressions.",
    requiredSkillIds: ["fretboard-notes", "ear-training"],
    lessonIds: ["music-theory-basics"],
    practiceRoute: "/practice/technique?target=theory-scale-degree",
    practiceLabel: "Theory practice",
    targetIds: ["key", "scale-degree", "progression"],
  },
];

export const LESSONS: Lesson[] = [
  lesson("tuning-basics", "Tuning basics", "Foundations", "concept", [
    "Tune each string to its target note.",
    "Use cents to decide whether to tighten or loosen.",
    "Stop chasing the needle once the pitch is stable.",
  ]),
  lesson("reading-chord-diagrams", "Reading chord diagrams", "Foundations", "mic-free", [
    "Map diagram strings to the guitar.",
    "Name open, muted, and fretted strings.",
    "Read finger numbers without guessing.",
  ]),
  lesson("open-chords-1", "Open chords: first set", "Chords", "practice-linked", [
    "Form G, C, D, Em, Am, A, and E.",
    "Check one chord at a time before changing.",
    "Use light pressure and curved fingers.",
  ]),
  lesson("chord-transition-basics", "Chord transition basics", "Chords", "practice-linked", [
    "Find anchor fingers and common shapes.",
    "Practice slow changes before raising tempo.",
    "Keep the strumming hand moving through small mistakes.",
  ]),
  lesson("rhythm-and-tempo", "Rhythm and tempo", "Rhythm", "concept", [
    "Count steady quarter notes and eighth notes.",
    "Use BPM as a repeatable practice setting.",
    "Separate pulse from the strumming pattern.",
  ]),
  lesson("strumming-foundations", "Strumming foundations", "Rhythm", "practice-linked", [
    "Play downstrokes and upstrokes with relaxed motion.",
    "Accent beat one without rushing.",
    "Practice missed strums as planned silences.",
  ]),
  lesson("song-practice-basics", "How to learn a song", "Songs", "practice-linked", [
    "Loop small sections before playing the full form.",
    "Start below performance tempo.",
    "Track the best take and one next fix.",
  ]),
  lesson("barre-chord-prep", "Barre chord preparation", "Technique", "practice-linked", [
    "Use the side of the first finger for pressure.",
    "Start with mini-F before full barre shapes.",
    "Release tension between repetitions.",
  ]),
  lesson("power-chords-muting", "Power chords and muting", "Technique", "practice-linked", [
    "Keep the chord compact and movable.",
    "Use unused fingers to touch silent strings.",
    "Listen for extra ringing before adding speed.",
  ]),
  lesson("pentatonic-scale", "Minor pentatonic scale", "Lead", "fretboard", [
    "Memorize the first box by string pairs.",
    "Alternate pick slowly with a metronome.",
    "Use two-note call-and-response ideas.",
  ]),
  lesson(
    "lead-techniques",
    "Slides, bends, hammer-ons, pull-offs, vibrato",
    "Lead",
    "practice-linked",
    [
      "Practice each technique as a controlled sound.",
      "Use conservative self-rating when tracking technique.",
      "Prefer clean pitch and timing over speed.",
    ],
  ),
  lesson("fingerstyle-intro", "Fingerstyle intro", "Technique", "practice-linked", [
    "Assign thumb to bass strings and fingers to treble strings.",
    "Practice alternating bass before full patterns.",
    "Keep hand motion small and even.",
  ]),
  lesson("fretboard-notes", "Fretboard notes", "Fretboard", "fretboard", [
    "Learn natural notes across all six strings.",
    "Use octave shapes to find repeated notes.",
    "Name notes out loud during slow practice.",
  ]),
  lesson("ear-training-basics", "Ear training basics", "Ear", "ear-training", [
    "Compare intervals as distances from a home note.",
    "Hear major versus minor chord quality.",
    "Recognize simple I-IV-V movement.",
  ]),
  lesson("music-theory-basics", "Music theory for guitarists", "Theory", "concept", [
    "Use keys to predict common chords.",
    "Read scale degrees as reusable numbers.",
    "Connect progressions to songs you practice.",
  ]),
];

export const LESSONS_BY_ID: Record<string, Lesson> = Object.fromEntries(
  LESSONS.map((lessonItem) => [lessonItem.id, lessonItem]),
);

export const SKILLS_BY_ID: Record<string, SkillNode> = Object.fromEntries(
  SKILL_TREE.map((skill) => [skill.id, skill]),
);

export function getLesson(id: string | undefined): Lesson | undefined {
  return id ? LESSONS_BY_ID[id] : undefined;
}

export function lessonProgress(
  progressItems: Record<string, ProgressItem>,
  lessonId: string,
): ProgressItem | undefined {
  return progressItems[progressItemId("lesson", lessonId)];
}

export function skillProgress(
  progressItems: Record<string, ProgressItem>,
  skillId: string,
): ProgressItem | undefined {
  return progressItems[progressItemId("skill", skillId)];
}

function lesson(
  id: string,
  title: string,
  area: SkillArea,
  kind: LessonKind,
  outcomes: string[],
): Lesson {
  return {
    id,
    title,
    area,
    kind,
    level:
      area === "Foundations" || area === "Chords" || area === "Rhythm"
        ? "beginner"
        : "early-intermediate",
    estimatedMinutes: kind === "concept" ? 6 : 10,
    summary: `${title} gives you a practical local lesson and a next action inside Guitar Coach.`,
    outcomes,
    sections: [
      {
        heading: "Learn",
        body: lessonBody(id, "learn"),
        exercise: "Read this once, then say the idea in your own words before touching the guitar.",
      },
      {
        heading: "Try",
        body: lessonBody(id, "try"),
        exercise: "Practice for two slow minutes. If the motion feels tense, stop and reset.",
      },
      {
        heading: "Measure",
        body: lessonBody(id, "measure"),
        exercise: "Use the linked tool or mark the lesson complete when you can repeat it calmly.",
      },
    ],
    links: lessonLinks(id),
  };
}

function lessonBody(id: string, stage: "learn" | "try" | "measure"): string {
  const base: Record<string, Record<typeof stage, string>> = {
    "tuning-basics": {
      learn:
        "A guitar lesson starts with stable open strings. The tuner shows pitch, cents, and the selected tuning target.",
      try: "Pluck one string at a time and wait for the pitch trace to settle before adjusting.",
      measure:
        "Count the strings you can hold within the center band. The tuner saves metadata even without recording consent.",
    },
    "reading-chord-diagrams": {
      learn:
        "Chord diagrams are maps: vertical lines are strings, horizontal lines are frets, dots are fingers, and X means avoid that string.",
      try: "Pick one first chord and place each finger slowly from low string to high string.",
      measure: "Use the chord library notes and muted/open string labels to confirm the shape.",
    },
    "open-chords-1": {
      learn:
        "First open chords use open strings as part of the sound, so clean fretting and avoiding muted strings matter more than force.",
      try: "Check G, C, D, Em, Am, A, and E one at a time. Let every string ring before trying speed.",
      measure: "A chord is ready when several checks land near 8/10 without extra tension.",
    },
    "chord-transition-basics": {
      learn: "Transitions improve when you see shared fingers and move both hands in time.",
      try: "Loop two chords for one minute at a tempo where you can breathe.",
      measure: "Raise BPM only after the average score stays comfortable.",
    },
    "rhythm-and-tempo": {
      learn: "Rhythm is the pattern over the beat. Tempo is the speed of that beat.",
      try: "Count one-two-three-four while tapping your foot, then add muted strums.",
      measure: "A useful tempo is one where your strums land close to the click without rushing.",
    },
    "strumming-foundations": {
      learn:
        "Relaxed strumming comes from steady arm motion and planned accents, not bigger effort.",
      try: "Play down-up eighths while accenting beat one.",
      measure: "Use the strumming drill to spot early, late, and missed strums.",
    },
    "song-practice-basics": {
      learn:
        "Songs are learned in sections. A slow clean loop is more useful than a full messy run.",
      try: "Pick one section, lower the tempo, and repeat the chord timeline.",
      measure: "Mark the section complete only when it survives a relaxed full pass.",
    },
    "barre-chord-prep": {
      learn: "Barres need alignment and patience. The goal is even pressure, not squeezing.",
      try: "Play mini-F shapes and release the hand after each repetition.",
      measure: "Use chord checks conservatively; uncertainty is a signal to slow down.",
    },
    "power-chords-muting": {
      learn: "Power chords are movable shapes with a root and fifth. Muting keeps them clean.",
      try: "Move E5, A5, and D5 slowly while touching unused strings.",
      measure: "Listen for extra ringing and track the cleanest tempo.",
    },
    "pentatonic-scale": {
      learn: "The minor pentatonic first box is a map for riffs, fills, and simple solos.",
      try: "Play two strings at a time with alternate picking.",
      measure: "Track whether notes are even and named, not just fast.",
    },
    "lead-techniques": {
      learn: "Lead techniques change how a note starts, moves, or sustains.",
      try: "Practice slides, hammer-ons, pull-offs, bends, and vibrato as separate sounds.",
      measure: "Mark progress only when the pitch target and timing are intentional.",
    },
    "fingerstyle-intro": {
      learn: "Fingerstyle assigns thumb and fingers so the picking hand can play bass and melody.",
      try: "Alternate thumb on bass strings while one finger plays a treble string.",
      measure: "Track steady volume and relaxed recovery between notes.",
    },
    "fretboard-notes": {
      learn: "Fretboard knowledge starts with natural notes across all six strings.",
      try: "Find C, D, E, F, G, A, and B in small string groups, then use octave shapes.",
      measure: "A note is learned when you can name it without counting every fret.",
    },
    "ear-training-basics": {
      learn: "Ear training connects what you hear to intervals, chord quality, and progressions.",
      try: "Compare a home note to a second note, then major and minor chord sounds.",
      measure: "Use honest guesses; wrong answers are useful signal.",
    },
    "music-theory-basics": {
      learn:
        "Theory turns patterns into reusable names: keys, scale degrees, chord families, and progressions.",
      try: "Name I, IV, V, and vi in G and C.",
      measure: "Connect one theory idea to a song section before moving on.",
    },
  };
  return base[id]?.[stage] ?? "Practice slowly, listen carefully, and save the evidence.";
}

function lessonLinks(id: string): LessonLink[] {
  if (id === "tuning-basics") return [{ label: "Open tuner", to: "/tools/tuner" }];
  if (id === "reading-chord-diagrams") return [{ label: "Open chord library", to: "/chords" }];
  if (id === "song-practice-basics") return [{ label: "Open songs", to: "/songs" }];
  if (id === "barre-chord-prep") {
    return [{ label: "Open technique practice", to: "/practice/technique?target=barre-pressure" }];
  }
  if (id === "power-chords-muting") {
    return [{ label: "Open technique practice", to: "/practice/technique?target=power-muting" }];
  }
  if (id === "pentatonic-scale") {
    return [{ label: "Open scale practice", to: "/practice/technique?target=pentatonic-box" }];
  }
  if (id === "lead-techniques") {
    return [{ label: "Open lead practice", to: "/practice/technique?target=lead-slide" }];
  }
  if (id === "fingerstyle-intro") {
    return [
      {
        label: "Open fingerstyle practice",
        to: "/practice/technique?target=fingerstyle-alternating-bass",
      },
    ];
  }
  if (id === "music-theory-basics") {
    return [
      { label: "Open theory practice", to: "/practice/technique?target=theory-scale-degree" },
    ];
  }
  if (id.includes("strumming") || id === "rhythm-and-tempo") {
    return [{ label: "Open strumming drill", to: "/practice/strumming" }];
  }
  if (id.includes("chord") || id === "open-chords-1") {
    return [{ label: "Open chord-change drill", to: "/practice/chord-change" }];
  }
  return [{ label: "Open Today", to: "/" }];
}
