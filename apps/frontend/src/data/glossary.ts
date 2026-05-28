export type GlossaryCategory = "Sound" | "Guitar" | "Timing" | "Harmony" | "Notation";

export type GlossaryTermId =
  | "pitch"
  | "fret"
  | "cent"
  | "beat"
  | "semitone"
  | "sharp"
  | "flat"
  | "note"
  | "chord"
  | "tempo"
  | "rhythm"
  | "tuning"
  | "string";

export type GlossaryVisualKind =
  | "pitch"
  | "fret"
  | "cent"
  | "beat"
  | "semitone"
  | "accidental"
  | "note"
  | "chord"
  | "tempo"
  | "rhythm"
  | "tuning"
  | "string";

export type GlossaryAudioExample =
  | {
      id: string;
      label: string;
      kind: "notes";
      midi: readonly number[];
      cents?: readonly number[];
      noteSeconds?: number;
      gapSeconds?: number;
    }
  | {
      id: string;
      label: string;
      kind: "strum";
      midi: readonly number[];
    }
  | {
      id: string;
      label: string;
      kind: "metronome";
      bpm: number;
      beats: number;
      accentFirst?: boolean;
    }
  | {
      id: string;
      label: string;
      kind: "rhythm";
      bpm: number;
      pattern: readonly boolean[];
    };

export interface GlossaryTerm {
  id: GlossaryTermId;
  term: string;
  category: GlossaryCategory;
  shortDefinition: string;
  detail: readonly string[];
  encounter: string;
  visualKind: GlossaryVisualKind;
  audioExamples: readonly GlossaryAudioExample[];
  relatedTermIds: readonly GlossaryTermId[];
  tags: readonly string[];
}

export const GLOSSARY_CATEGORIES: readonly GlossaryCategory[] = [
  "Sound",
  "Guitar",
  "Timing",
  "Harmony",
  "Notation",
];

export const GLOSSARY_TERMS: readonly GlossaryTerm[] = [
  {
    id: "pitch",
    term: "Pitch",
    category: "Sound",
    shortDefinition: "How high or low a sound is.",
    detail: [
      "Pitch is the musical height of a sound. A thick, loose string makes a lower pitch, while a thinner or tighter string makes a higher pitch.",
      "When a guitar string vibrates faster, the pitch goes up. When it vibrates slower, the pitch goes down.",
    ],
    encounter:
      "The tuner listens for pitch, names the nearest note, and shows whether that pitch is above or below the target string.",
    visualKind: "pitch",
    audioExamples: [
      { id: "low-high", label: "Low then high", kind: "notes", midi: [40, 64] },
      { id: "same-note-octaves", label: "Same note, two octaves", kind: "notes", midi: [52, 64] },
    ],
    relatedTermIds: ["note", "cent", "string"],
    tags: ["frequency", "high", "low", "hz", "tuner"],
  },
  {
    id: "fret",
    term: "Fret",
    category: "Guitar",
    shortDefinition: "A metal strip that raises a string's pitch when you press behind it.",
    detail: [
      "Frets divide the guitar neck into small pitch steps. Pressing a string just behind a fret shortens the vibrating part of the string.",
      "Each fret is one semitone higher than the fret before it, so moving from the open string to fret 1 raises the pitch by one semitone.",
    ],
    encounter:
      "Chord diagrams show which fret each finger should press, and practice feedback can point to a string that is muted or sounding the wrong pitch.",
    visualKind: "fret",
    audioExamples: [
      { id: "open-to-fret", label: "Open, fret 1, fret 2", kind: "notes", midi: [40, 41, 42] },
      { id: "higher-frets", label: "Frets 3 to 5", kind: "notes", midi: [43, 44, 45] },
    ],
    relatedTermIds: ["semitone", "string", "pitch"],
    tags: ["neck", "finger", "fretboard", "diagram"],
  },
  {
    id: "cent",
    term: "Cent",
    category: "Sound",
    shortDefinition: "A tiny pitch measurement used for tuning.",
    detail: [
      "A cent is one hundredth of a semitone. Guitar tuners use cents because tuning changes are smaller than full notes.",
      "If the tuner says -12 cents, the string is a little flat. If it says +12 cents, the string is a little sharp.",
    ],
    encounter:
      "The tuner needle and pitch trace measure how many cents away you are from the target, with the green center band marking in-tune playing.",
    visualKind: "cent",
    audioExamples: [
      {
        id: "flat-in-sharp",
        label: "Flat, in tune, sharp",
        kind: "notes",
        midi: [64, 64, 64],
        cents: [-20, 0, 20],
      },
      {
        id: "small-difference",
        label: "Five-cent difference",
        kind: "notes",
        midi: [64, 64],
        cents: [0, 5],
      },
    ],
    relatedTermIds: ["pitch", "tuning", "sharp", "flat"],
    tags: ["tuner", "needle", "in tune", "deviation"],
  },
  {
    id: "beat",
    term: "Beat",
    category: "Timing",
    shortDefinition: "The steady pulse you count or tap along with.",
    detail: [
      "A beat is the regular pulse underneath music. When you count one, two, three, four, those counts are beats.",
      "In practice, landing on the beat means your strum happens close to the pulse instead of drifting early or late.",
    ],
    encounter:
      "Practice drills use a metronome beat to decide when each chord change or strum should happen.",
    visualKind: "beat",
    audioExamples: [
      { id: "four-beats", label: "Four steady beats", kind: "metronome", bpm: 80, beats: 4 },
      {
        id: "accented-bar",
        label: "Count of four",
        kind: "metronome",
        bpm: 80,
        beats: 8,
        accentFirst: true,
      },
    ],
    relatedTermIds: ["tempo", "rhythm"],
    tags: ["metronome", "pulse", "count", "timing"],
  },
  {
    id: "semitone",
    term: "Semitone",
    category: "Sound",
    shortDefinition: "The smallest pitch step in the common Western note system.",
    detail: [
      "A semitone is the distance from one fret to the next on guitar. E to F is one semitone, and F to F sharp is another.",
      "Twelve semitones make an octave, where the note name repeats at a higher or lower pitch.",
    ],
    encounter:
      "Fretboard diagrams, chord shapes, and tuner targets all rely on semitone steps across the neck.",
    visualKind: "semitone",
    audioExamples: [
      { id: "one-step", label: "One semitone up", kind: "notes", midi: [64, 65] },
      { id: "three-steps", label: "Three semitones", kind: "notes", midi: [64, 65, 66, 67] },
    ],
    relatedTermIds: ["fret", "sharp", "flat", "note"],
    tags: ["half step", "interval", "fret"],
  },
  {
    id: "sharp",
    term: "Sharp",
    category: "Notation",
    shortDefinition: "A note raised by one semitone.",
    detail: [
      "A sharp sign means the note is one semitone higher. F sharp is one fret above F.",
      "Tuners also use sharp in plain language: if a string is sharp, it is a little too high and needs to be loosened.",
    ],
    encounter:
      "The tuner can show a pitch above the target, and chord note names may include sharp notes such as F#.",
    visualKind: "accidental",
    audioExamples: [
      { id: "f-to-f-sharp", label: "F to F sharp", kind: "notes", midi: [65, 66] },
      { id: "sharp-then-natural", label: "Sharp then natural", kind: "notes", midi: [66, 65] },
    ],
    relatedTermIds: ["flat", "semitone", "cent", "note"],
    tags: ["accidental", "#", "higher", "tuner"],
  },
  {
    id: "flat",
    term: "Flat",
    category: "Notation",
    shortDefinition: "A note lowered by one semitone.",
    detail: [
      "A flat sign means the note is one semitone lower. B flat is one fret below B.",
      "Tuners also use flat in everyday feedback: if a string is flat, it is too low and needs to be tightened.",
    ],
    encounter:
      "The tuner can show a pitch below the target, and alternate tunings may use flat note names.",
    visualKind: "accidental",
    audioExamples: [
      { id: "b-to-b-flat", label: "B to B flat", kind: "notes", midi: [71, 70] },
      { id: "flat-then-natural", label: "Flat then natural", kind: "notes", midi: [70, 71] },
    ],
    relatedTermIds: ["sharp", "semitone", "cent", "note"],
    tags: ["accidental", "b", "lower", "tuner"],
  },
  {
    id: "note",
    term: "Note",
    category: "Sound",
    shortDefinition: "A named pitch, such as E, A, D, G, B, or C.",
    detail: [
      "A note is a musical pitch with a name. Guitar strings, fretted positions, melodies, and chords are all built from notes.",
      "The musical alphabet uses A through G, then repeats. Sharps and flats name the notes between many of those letters.",
    ],
    encounter:
      "The tuner displays the nearest note, chord pages list chord notes, and drills compare the notes you play to the expected chord.",
    visualKind: "note",
    audioExamples: [
      { id: "c-major-notes", label: "C, D, E", kind: "notes", midi: [60, 62, 64] },
      {
        id: "open-strings",
        label: "Open string notes",
        kind: "notes",
        midi: [40, 45, 50, 55, 59, 64],
      },
    ],
    relatedTermIds: ["pitch", "sharp", "flat", "chord"],
    tags: ["name", "letter", "melody", "tuner"],
  },
  {
    id: "chord",
    term: "Chord",
    category: "Harmony",
    shortDefinition: "Two or more notes played together.",
    detail: [
      "A chord is a stack of notes that sound at the same time. Beginner guitar often starts with open chords like G, C, D, Em, and Am.",
      "A chord shape tells your fingers which strings to press, which strings to leave open, and which strings to avoid.",
    ],
    encounter:
      "The chord library teaches shapes, the chord checker listens for the expected chord, and practice drills score chord changes.",
    visualKind: "chord",
    audioExamples: [
      { id: "c-major-strum", label: "C major chord", kind: "strum", midi: [48, 52, 55, 60, 64] },
      {
        id: "g-major-strum",
        label: "G major chord",
        kind: "strum",
        midi: [43, 47, 50, 55, 59, 67],
      },
    ],
    relatedTermIds: ["note", "string", "rhythm"],
    tags: ["harmony", "shape", "strum", "progression"],
  },
  {
    id: "tempo",
    term: "Tempo",
    category: "Timing",
    shortDefinition: "The speed of the beat, usually measured in BPM.",
    detail: [
      "Tempo tells you how fast the music moves. BPM means beats per minute, so 60 BPM is one beat every second.",
      "A slower tempo gives your hands more time. A faster tempo makes chord changes and rhythm feel more demanding.",
    ],
    encounter:
      "Practice screens let you set BPM, and adaptive suggestions may ask you to slow down or try a faster tempo.",
    visualKind: "tempo",
    audioExamples: [
      { id: "slow-tempo", label: "70 BPM", kind: "metronome", bpm: 70, beats: 4 },
      { id: "fast-tempo", label: "120 BPM", kind: "metronome", bpm: 120, beats: 4 },
    ],
    relatedTermIds: ["beat", "rhythm"],
    tags: ["bpm", "speed", "metronome", "practice"],
  },
  {
    id: "rhythm",
    term: "Rhythm",
    category: "Timing",
    shortDefinition: "The pattern of sounds and silences over the beat.",
    detail: [
      "Rhythm is how notes, strums, and rests are arranged in time. Two songs can share the same chords but feel different because the rhythm is different.",
      "Good rhythm means your strums line up with the beat and with the pattern you meant to play.",
    ],
    encounter:
      "The strumming drill shows downstrokes, upstrokes, and rests as a rhythm pattern, then scores timing against that pattern.",
    visualKind: "rhythm",
    audioExamples: [
      {
        id: "quarters",
        label: "Quarter-note strums",
        kind: "rhythm",
        bpm: 85,
        pattern: [true, false, true, false, true, false, true, false],
      },
      {
        id: "folk-pattern",
        label: "D D U U D U feel",
        kind: "rhythm",
        bpm: 85,
        pattern: [true, false, true, true, false, true, true, true],
      },
    ],
    relatedTermIds: ["beat", "tempo", "chord"],
    tags: ["strumming", "pattern", "timing", "rest"],
  },
  {
    id: "tuning",
    term: "Tuning",
    category: "Guitar",
    shortDefinition: "Setting each string to the pitch it should start on.",
    detail: [
      "Tuning makes the open strings match a chosen set of target notes. Standard guitar tuning from low to high is E, A, D, G, B, E.",
      "Alternate tunings change one or more target notes so the guitar has a different sound or easier shapes for certain songs.",
    ],
    encounter:
      "The tuner uses your selected tuning to decide which target string you are closest to and whether that string is in tune.",
    visualKind: "tuning",
    audioExamples: [
      {
        id: "standard-tuning",
        label: "Standard tuning",
        kind: "notes",
        midi: [40, 45, 50, 55, 59, 64],
      },
      { id: "drop-d", label: "Drop D start", kind: "notes", midi: [38, 45, 50] },
    ],
    relatedTermIds: ["string", "pitch", "cent"],
    tags: ["standard", "drop d", "target", "open strings"],
  },
  {
    id: "string",
    term: "String",
    category: "Guitar",
    shortDefinition: "One of the six vibrating wires on a guitar.",
    detail: [
      "A standard guitar has six strings. From thickest to thinnest in standard tuning, they are low E, A, D, G, B, and high E.",
      "A string can ring open, be pressed behind a fret, or be muted so it does not sound.",
    ],
    encounter:
      "The tuner locks onto one string at a time, chord diagrams show per-string instructions, and feedback can name a string that sounds muted or wrong.",
    visualKind: "string",
    audioExamples: [
      {
        id: "low-to-high",
        label: "Low to high strings",
        kind: "notes",
        midi: [40, 45, 50, 55, 59, 64],
      },
      {
        id: "high-to-low",
        label: "High to low strings",
        kind: "notes",
        midi: [64, 59, 55, 50, 45, 40],
      },
    ],
    relatedTermIds: ["tuning", "fret", "chord"],
    tags: ["low e", "high e", "open", "muted"],
  },
];

const GLOSSARY_TERM_BY_ID = Object.fromEntries(
  GLOSSARY_TERMS.map((term) => [term.id, term]),
) as Record<GlossaryTermId, GlossaryTerm>;

export function getGlossaryTerm(id: string | undefined): GlossaryTerm | undefined {
  if (!id) return undefined;
  return GLOSSARY_TERM_BY_ID[id as GlossaryTermId];
}

export function getRelatedGlossaryTerms(term: GlossaryTerm): GlossaryTerm[] {
  return term.relatedTermIds.map((id) => GLOSSARY_TERM_BY_ID[id]);
}

export function filterGlossaryTerms({
  query,
  category,
}: {
  query: string;
  category: GlossaryCategory | "All";
}): GlossaryTerm[] {
  const q = query.trim().toLowerCase();
  return GLOSSARY_TERMS.filter((term) => {
    const matchesCategory = category === "All" || term.category === category;
    if (!matchesCategory) return false;
    if (!q) return true;
    const searchable = [
      term.term,
      term.category,
      term.shortDefinition,
      term.encounter,
      ...term.tags,
      ...term.detail,
    ]
      .join(" ")
      .toLowerCase();
    return searchable.includes(q);
  });
}
