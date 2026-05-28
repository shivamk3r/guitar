import { create } from "zustand";
import { DEFAULT_SETTINGS, type SettingsRow, getDb } from "./db";

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
    if (existing) set({ ...DEFAULT_SETTINGS, ...existing, hydrated: true });
    else {
      await db.put("settings", DEFAULT_SETTINGS);
      set({ ...DEFAULT_SETTINGS, hydrated: true });
    }
  },
  async update(patch) {
    const current = get();
    const previous: SettingsRow = {
      id: "singleton",
      tuningId: current.tuningId,
      metronomeAudible: current.metronomeAudible,
      metronomeVolume: current.metronomeVolume,
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
      metronomeAudible: current.metronomeAudible,
      metronomeVolume: current.metronomeVolume,
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
