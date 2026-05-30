import {
  type LearnerProfile,
  type LocalLearnerProfile,
  ensureLearnerProfile,
  fetchLearnerExport,
  saveLearnerProfile,
  saveRecordingConsent,
} from "@/api/client";
import type { SettingsRow } from "./db";
import { restoreBackendJournalEntries, syncUnsyncedLocalJournalEntries } from "./journal-store";
import { drainPendingBackendSync } from "./pending-backend-sync";
import { useProgress } from "./progress-store";
import { useSettings } from "./settings-store";

export async function restoreBackendAccount(): Promise<boolean> {
  const settings = useSettings.getState();
  const learner = await ensureLearnerProfile({
    learnerId: settings.learnerId,
    anonymousLearnerId: settings.anonymousLearnerId,
    onProfile: settings.update,
  });
  await drainPendingBackendSync(useSettings.getState());
  await syncUnsyncedLocalJournalEntries(useSettings.getState());
  const exported = await fetchLearnerExport(learner.id);
  const profile =
    settings.onboardingCompleted && !exported.profile.onboarding_completed
      ? await pushLocalProfileToBackend(learner.id, settings)
      : exported.profile;

  await useSettings.getState().update(profileToSettingsPatch(profile, learner));
  await useProgress.getState().restoreBackendSnapshot({
    progressItems: exported.progress_items,
    sessions: exported.sessions,
  });
  await restoreBackendJournalEntries(exported.journal_entries);
  return true;
}

export function profileToSettingsPatch(
  profile: LocalLearnerProfile,
  learner: LearnerProfile,
): Partial<SettingsRow> {
  return {
    learnerId: learner.id,
    anonymousLearnerId: learner.anonymous_id,
    displayName: profile.display_name,
    skillLevel: normalizeSkillLevel(profile.skill_level),
    goals: profile.goals,
    handedness: profile.handedness === "left" ? "left" : "right",
    instrumentPreference: normalizeInstrument(profile.instrument_preference),
    dailyPracticeTargetMinutes: profile.daily_practice_target_minutes,
    preferredGenres: profile.preferred_genres,
    onboardingCompleted: profile.onboarding_completed,
    profileUpdatedIso: profile.updated_at,
    recordingConsentGranted: profile.recording_consent_granted,
    recordingConsentUpdatedIso: profile.updated_at,
  };
}

async function pushLocalProfileToBackend(
  learnerId: string,
  settings: SettingsRow,
): Promise<LocalLearnerProfile> {
  const profile = await saveLearnerProfile(learnerId, {
    display_name: settings.displayName,
    skill_level: settings.skillLevel,
    goals: settings.goals,
    handedness: settings.handedness,
    instrument_preference: settings.instrumentPreference,
    daily_practice_target_minutes: settings.dailyPracticeTargetMinutes,
    preferred_genres: settings.preferredGenres,
    recording_consent_granted: settings.recordingConsentGranted,
    onboarding_completed: settings.onboardingCompleted,
  });
  if (settings.recordingConsentGranted) {
    await saveRecordingConsent({
      learnerId,
      granted: true,
      policyVersion: settings.recordingConsentPolicyVersion,
      source: "startup-restore",
    });
  }
  return profile;
}

function normalizeSkillLevel(value: string): SettingsRow["skillLevel"] {
  if (
    value === "new" ||
    value === "beginner" ||
    value === "late-beginner" ||
    value === "early-intermediate" ||
    value === "intermediate"
  ) {
    return value;
  }
  return "new";
}

function normalizeInstrument(value: string): SettingsRow["instrumentPreference"] {
  if (value === "electric" || value === "both") return value;
  return "acoustic";
}
