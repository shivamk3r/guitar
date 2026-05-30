import {
  pendingLearningSessionRecord,
  pendingLearningSessionSyncId,
  pendingProfileSyncId,
  pendingProfileSyncRecord,
  profileSyncPayloadFromSettings,
} from "./pending-backend-sync";

describe("pending backend sync records", () => {
  it("builds stable ids and preserves retry state when a failed session is requeued", () => {
    const payload = {
      sessionId: "session-1",
      activityType: "lesson" as const,
      startedAtIso: "2026-05-30T10:00:00.000Z",
      endedAtIso: "2026-05-30T10:05:00.000Z",
      metadata: { lessonId: "tuning-basics" },
    };
    const first = pendingLearningSessionRecord({
      payload,
      error: new Error("offline"),
      nowIso: "2026-05-30T10:06:00.000Z",
    });
    const second = pendingLearningSessionRecord({
      payload: { ...payload, metadata: { lessonId: "tuning-basics", score: 10 } },
      existing: { ...first, attempts: 2 },
      error: new Error("still offline"),
      nowIso: "2026-05-30T10:07:00.000Z",
    });

    expect(pendingLearningSessionSyncId("session-1")).toBe("learning-session:session-1");
    expect(second).toMatchObject({
      id: "learning-session:session-1",
      attempts: 2,
      lastError: "still offline",
      createdAtIso: "2026-05-30T10:06:00.000Z",
      updatedAtIso: "2026-05-30T10:07:00.000Z",
      payload: {
        metadata: { lessonId: "tuning-basics", score: 10 },
      },
    });
  });

  it("captures local profile and consent state for retryable backend sync", () => {
    const payload = profileSyncPayloadFromSettings(
      {
        displayName: "Maya",
        skillLevel: "late-beginner",
        goals: ["Play full songs"],
        handedness: "left",
        instrumentPreference: "electric",
        dailyPracticeTargetMinutes: 25,
        preferredGenres: ["rock"],
        recordingConsentGranted: true,
        onboardingCompleted: true,
        recordingConsentPolicyVersion: "recording-v1",
      },
      { consentChanged: true, consentSource: "onboarding" },
    );
    const record = pendingProfileSyncRecord({
      payload,
      error: new Error("offline"),
      nowIso: "2026-05-30T11:00:00.000Z",
    });

    expect(pendingProfileSyncId()).toBe("profile:singleton");
    expect(record).toMatchObject({
      id: "profile:singleton",
      kind: "profile",
      attempts: 0,
      lastError: "offline",
      payload: {
        displayName: "Maya",
        recordingConsentGranted: true,
        consentChanged: true,
        consentSource: "onboarding",
      },
    });
  });
});
