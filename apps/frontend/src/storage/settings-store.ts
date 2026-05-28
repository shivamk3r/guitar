import { create } from "zustand";
import { DEFAULT_SETTINGS, type SettingsRow, getDb } from "./db";
import { normalizeTimedPracticeCountInBeats } from "./preferences";

interface SettingsState extends SettingsRow {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  update: (patch: Partial<SettingsRow>) => Promise<void>;
}

export const useSettings = create<SettingsState>()((set, get) => ({
  ...DEFAULT_SETTINGS,
  hydrated: false,
  async hydrate() {
    const db = await getDb();
    const existing = await db.get("settings", "singleton");
    if (existing) {
      const next = {
        ...DEFAULT_SETTINGS,
        ...existing,
        timedPracticeCountInBeats: normalizeTimedPracticeCountInBeats(
          existing.timedPracticeCountInBeats,
        ),
      };
      set({ ...next, hydrated: true });
    } else {
      await db.put("settings", DEFAULT_SETTINGS);
      set({ ...DEFAULT_SETTINGS, hydrated: true });
    }
  },
  async update(patch) {
    const current = get();
    const previous: SettingsRow = {
      id: "singleton",
      tuningId: current.tuningId,
      audioInputDeviceId: current.audioInputDeviceId,
      metronomeAudible: current.metronomeAudible,
      metronomeVolume: current.metronomeVolume,
      timedPracticeCountInBeats: current.timedPracticeCountInBeats,
      lastCalibrationQuality: current.lastCalibrationQuality,
      sessionsThisWeek: current.sessionsThisWeek,
      lastSessionIso: current.lastSessionIso,
      learnerId: current.learnerId,
      anonymousLearnerId: current.anonymousLearnerId,
      recordingConsentGranted: current.recordingConsentGranted,
      recordingConsentPolicyVersion: current.recordingConsentPolicyVersion,
      recordingConsentUpdatedIso: current.recordingConsentUpdatedIso,
    };
    const next: SettingsRow = {
      id: "singleton",
      tuningId: current.tuningId,
      audioInputDeviceId: current.audioInputDeviceId,
      metronomeAudible: current.metronomeAudible,
      metronomeVolume: current.metronomeVolume,
      timedPracticeCountInBeats: current.timedPracticeCountInBeats,
      lastCalibrationQuality: current.lastCalibrationQuality,
      sessionsThisWeek: current.sessionsThisWeek,
      lastSessionIso: current.lastSessionIso,
      learnerId: current.learnerId,
      anonymousLearnerId: current.anonymousLearnerId,
      recordingConsentGranted: current.recordingConsentGranted,
      recordingConsentPolicyVersion: current.recordingConsentPolicyVersion,
      recordingConsentUpdatedIso: current.recordingConsentUpdatedIso,
      ...patch,
    };
    next.timedPracticeCountInBeats = normalizeTimedPracticeCountInBeats(
      next.timedPracticeCountInBeats,
    );
    set(next);
    try {
      const db = await getDb();
      await db.put("settings", next);
    } catch (err) {
      set(previous);
      throw err;
    }
  },
}));
