import { CHORDS } from "../../src/data/chords";

export const SUPPORTED_CHORD_IDS = new Set(CHORDS.map((chord) => chord.id));
export const SUPPORTED_CHORD_ID_LIST = [...SUPPORTED_CHORD_IDS].sort();

const ROOT_ALIASES: Record<string, string> = {
  "B#": "C",
  "C#": "C#",
  Db: "C#",
  "D#": "D#",
  Eb: "D#",
  Fb: "E",
  "E#": "F",
  "F#": "F#",
  Gb: "F#",
  "G#": "G#",
  Ab: "G#",
  "A#": "A#",
  Bb: "A#",
  Cb: "B",
};

export function normalizeChordLabel(rawLabel: string): string | null {
  const raw = rawLabel.trim();
  if (!raw || raw.toUpperCase() === "N" || raw.toLowerCase() === "noise") return null;
  const withoutBass = raw.split("/")[0] ?? raw;
  const [rootPart, qualityPart] = withoutBass.includes(":")
    ? splitHarteLabel(withoutBass)
    : splitCompactLabel(withoutBass);
  const root = normalizeRoot(rootPart);
  if (!root) return null;
  const suffix = normalizeQuality(qualityPart);
  if (suffix == null) return null;
  const chordId = `${root}${suffix}`;
  return SUPPORTED_CHORD_IDS.has(chordId) ? chordId : null;
}

function splitHarteLabel(label: string): [string, string] {
  const [root = "", quality = "maj"] = label.split(":", 2);
  return [root, quality];
}

function splitCompactLabel(label: string): [string, string] {
  const match = /^([A-G](?:#|b)?)(.*)$/.exec(label);
  if (!match) return [label, ""];
  return [match[1] ?? "", match[2] ?? ""];
}

function normalizeRoot(root: string): string | null {
  if (!root) return null;
  const normalized = root[0]?.toUpperCase() + root.slice(1);
  return ROOT_ALIASES[normalized] ?? normalized;
}

function normalizeQuality(quality: string): string | null {
  const q = quality.trim();
  if (q === "" || q === "maj" || q === "major") return "";
  if (q === "m" || q === "min" || q === "minor") return "m";
  if (q === "7" || q === "dom7") return "7";
  if (q === "5" || q === "power") return "5";
  return null;
}
