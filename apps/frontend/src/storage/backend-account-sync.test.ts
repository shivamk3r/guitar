import type { LearnerProfile, LocalLearnerProfile } from "@/api/client";
import { describe, expect, it } from "vitest";
import { profileToSettingsPatch } from "./backend-account-sync";

describe("backend account restore mapping", () => {
  it("maps the durable backend profile into local settings fields", () => {
    const learner: LearnerProfile = {
      id: "learner-1",
      anonymous_id: "anonymous-existing",
    };
    const profile: LocalLearnerProfile = {
      id: "profile-1",
      learner_id: "learner-1",
      display_name: "Maya",
      skill_level: "late-beginner",
      goals: ["Play full songs"],
      handedness: "left",
      instrument_preference: "electric",
      daily_practice_target_minutes: 25,
      preferred_genres: ["rock"],
      recording_consent_granted: true,
      onboarding_completed: true,
      created_at: "2026-05-30T09:00:00Z",
      updated_at: "2026-05-30T10:00:00Z",
    };

    expect(profileToSettingsPatch(profile, learner)).toMatchObject({
      learnerId: "learner-1",
      anonymousLearnerId: "anonymous-existing",
      displayName: "Maya",
      skillLevel: "late-beginner",
      handedness: "left",
      instrumentPreference: "electric",
      onboardingCompleted: true,
      recordingConsentGranted: true,
    });
  });
});
