import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import {
  DEFAULT_TIMED_PRACTICE_COUNT_IN_BEATS,
  type TimedPracticeCountInBeats,
} from "./preferences";

export interface SettingsRow {
  id: "singleton";
  tuningId: string;
  audioInputDeviceId: string | null;
  metronomeAudible: boolean;
  metronomeMode: "normal" | "accented" | "silent-bars" | "groove";
  metronomeVolume: number;
  timedPracticeCountInBeats: TimedPracticeCountInBeats;
  lastCalibrationQuality: "silent" | "quiet" | "good" | "clipping" | null;
  sessionsThisWeek: number;
  lastSessionIso: string | null;
  learnerId: string | null;
  anonymousLearnerId: string | null;
  displayName: string;
  skillLevel: "new" | "beginner" | "late-beginner" | "early-intermediate" | "intermediate";
  goals: string[];
  handedness: "right" | "left";
  instrumentPreference: "acoustic" | "electric" | "both";
  dailyPracticeTargetMinutes: number;
  preferredGenres: string[];
  onboardingCompleted: boolean;
  profileUpdatedIso: string | null;
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
  drillType:
    | "tuner"
    | "chord-change"
    | "progression"
    | "strumming"
    | "chord-check"
    | "timed-chord"
    | "lesson"
    | "song-practice"
    | "ear-training"
    | "fretboard"
    | "technique";
  chords: string[];
  targetBpm: number | null;
  averageScore: number;
  events: number;
  completionStatus?: string;
  resultSummary?: string | null;
}

export interface LocalJournalEntry {
  id: string;
  backendId: string | null;
  learnerId: string | null;
  sessionId: string | null;
  body: string;
  mood: string | null;
  focus: string | null;
  createdAtIso: string;
  updatedAtIso: string;
  backendSyncedAtIso: string | null;
}

export type PendingBackendActivityType =
  | "tuner"
  | "chord_check"
  | "practice_drill"
  | "lesson"
  | "song_practice"
  | "ear_training"
  | "fretboard_trainer"
  | "technique_drill";

export interface PendingLearningSessionSyncPayload {
  sessionId: string;
  activityType: PendingBackendActivityType;
  startedAtIso: string;
  endedAtIso: string;
  metadata: Record<string, unknown>;
  songProgress?: {
    songId: string;
    status: string;
    mastery: number;
    minutes: number;
    completedSectionIds: string[];
    lastTempo: number;
  };
}

export interface PendingProfileSyncPayload {
  displayName: string;
  skillLevel: SettingsRow["skillLevel"];
  goals: string[];
  handedness: SettingsRow["handedness"];
  instrumentPreference: SettingsRow["instrumentPreference"];
  dailyPracticeTargetMinutes: number;
  preferredGenres: string[];
  recordingConsentGranted: boolean;
  onboardingCompleted: boolean;
  consentChanged: boolean;
  consentPolicyVersion: string;
  consentSource: "onboarding" | "settings" | "startup-restore";
}

export interface PendingBackendSync {
  id: string;
  kind: "learning-session" | "profile";
  payload: PendingLearningSessionSyncPayload | PendingProfileSyncPayload;
  attempts: number;
  lastError: string | null;
  createdAtIso: string;
  updatedAtIso: string;
}

export type ProgressItemType =
  | "skill"
  | "lesson"
  | "chord"
  | "transition"
  | "rhythm"
  | "technique"
  | "scale"
  | "theory"
  | "song"
  | "song-section"
  | "ear-training"
  | "fretboard"
  | "challenge";

export type MasteryStatus = "locked" | "ready" | "in-progress" | "review" | "mastered";

export interface ProgressItem {
  /** `${itemType}:${itemId}` */
  id: string;
  itemType: ProgressItemType;
  itemId: string;
  status: Exclude<MasteryStatus, "locked">;
  mastery: number;
  attempts: number;
  minutes: number;
  bestScore: number | null;
  lastScore: number | null;
  bpmCeiling: number | null;
  dueAtIso: string | null;
  lastPracticedIso: string | null;
  updatedAtIso: string;
  metadata: Record<string, unknown>;
}

interface GuitarDB extends DBSchema {
  settings: { key: string; value: SettingsRow };
  chordBests: { key: string; value: ChordBest };
  transitionBests: { key: string; value: TransitionBest };
  progressItems: { key: string; value: ProgressItem; indexes: { "by-type": string } };
  sessions: {
    key: string;
    value: SessionSummary;
    indexes: { "by-startedAt": string };
  };
  journalEntries: {
    key: string;
    value: LocalJournalEntry;
    indexes: { "by-session": string; "by-createdAt": string };
  };
  pendingBackendSync: {
    key: string;
    value: PendingBackendSync;
    indexes: { "by-updatedAt": string };
  };
}

const DB_NAME = "guitar-coach";
const DB_VERSION = 5;

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
        if (!db.objectStoreNames.contains("progressItems")) {
          const store = db.createObjectStore("progressItems", { keyPath: "id" });
          store.createIndex("by-type", "itemType");
        }
        if (!db.objectStoreNames.contains("sessions")) {
          const store = db.createObjectStore("sessions", { keyPath: "id" });
          store.createIndex("by-startedAt", "startedAtIso");
        }
        if (!db.objectStoreNames.contains("journalEntries")) {
          const store = db.createObjectStore("journalEntries", { keyPath: "id" });
          store.createIndex("by-session", "sessionId");
          store.createIndex("by-createdAt", "createdAtIso");
        }
        if (!db.objectStoreNames.contains("pendingBackendSync")) {
          const store = db.createObjectStore("pendingBackendSync", { keyPath: "id" });
          store.createIndex("by-updatedAt", "updatedAtIso");
        }
      },
    });
  }
  return dbPromise;
}

export const DEFAULT_SETTINGS: SettingsRow = {
  id: "singleton",
  tuningId: "standard",
  audioInputDeviceId: null,
  metronomeAudible: false,
  metronomeMode: "accented",
  metronomeVolume: 0.3,
  timedPracticeCountInBeats: DEFAULT_TIMED_PRACTICE_COUNT_IN_BEATS,
  lastCalibrationQuality: null,
  sessionsThisWeek: 0,
  lastSessionIso: null,
  learnerId: null,
  anonymousLearnerId: null,
  displayName: "Local Learner",
  skillLevel: "new",
  goals: ["Build a complete beginner foundation"],
  handedness: "right",
  instrumentPreference: "acoustic",
  dailyPracticeTargetMinutes: 20,
  preferredGenres: ["folk", "rock"],
  onboardingCompleted: false,
  profileUpdatedIso: null,
  recordingConsentGranted: false,
  recordingConsentPolicyVersion: "recording-v1",
  recordingConsentUpdatedIso: null,
};
