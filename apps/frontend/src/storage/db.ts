import { type DBSchema, type IDBPDatabase, openDB } from "idb";

export interface SettingsRow {
  id: "singleton";
  tuningId: string;
  metronomeAudible: boolean;
  metronomeVolume: number;
  lastCalibrationQuality: "silent" | "quiet" | "good" | "clipping" | null;
  sessionsThisWeek: number;
  lastSessionIso: string | null;
  learnerId: string | null;
  anonymousLearnerId: string | null;
  recordingConsentGranted: boolean;
  recordingConsentPolicyVersion: string;
  recordingConsentUpdatedIso: string | null;
}

export interface ChordBest {
  chordId: string;
  bestScore: number;
  lastScore: number;
  attempts: number;
  lastPlayedIso: string;
}

export interface TransitionBest {
  /** `${fromChordId}->${toChordId}` */
  id: string;
  fromChordId: string;
  toChordId: string;
  /** Highest BPM at which rolling-avg score ≥ 8 */
  bpmCeiling: number;
  averageScore: number;
  attempts: number;
  lastPlayedIso: string;
}

export interface SessionSummary {
  id: string;
  startedAtIso: string;
  endedAtIso: string;
  drillType: "chord-change" | "progression" | "strumming" | "chord-check";
  chords: string[];
  targetBpm: number | null;
  averageScore: number;
  events: number;
}

interface GuitarDB extends DBSchema {
  settings: { key: string; value: SettingsRow };
  chordBests: { key: string; value: ChordBest };
  transitionBests: { key: string; value: TransitionBest };
  sessions: {
    key: string;
    value: SessionSummary;
    indexes: { "by-startedAt": string };
  };
}

const DB_NAME = "guitar-coach";
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<GuitarDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<GuitarDB>> {
  if (!dbPromise) {
    dbPromise = openDB<GuitarDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("chordBests")) {
          db.createObjectStore("chordBests", { keyPath: "chordId" });
        }
        if (!db.objectStoreNames.contains("transitionBests")) {
          db.createObjectStore("transitionBests", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("sessions")) {
          const store = db.createObjectStore("sessions", { keyPath: "id" });
          store.createIndex("by-startedAt", "startedAtIso");
        }
      },
    });
  }
  return dbPromise;
}

export const DEFAULT_SETTINGS: SettingsRow = {
  id: "singleton",
  tuningId: "standard",
  metronomeAudible: false,
  metronomeVolume: 0.3,
  lastCalibrationQuality: null,
  sessionsThisWeek: 0,
  lastSessionIso: null,
  learnerId: null,
  anonymousLearnerId: null,
  recordingConsentGranted: false,
  recordingConsentPolicyVersion: "recording-v1",
  recordingConsentUpdatedIso: null,
};
