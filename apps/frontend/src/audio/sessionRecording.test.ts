import {
  closeLearningSession,
  ensureLearnerProfile,
  saveRecordingConsent,
  startLearningSession,
  uploadRecording,
} from "@/api/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AudioEngine } from "./engine";
import { startActivitySession } from "./sessionRecording";

vi.mock("@/api/client", () => ({
  closeLearningSession: vi.fn(async () => {}),
  ensureLearnerProfile: vi.fn(async () => ({
    id: "learner-1",
    anonymous_id: "anon-1",
  })),
  saveRecordingConsent: vi.fn(async () => {}),
  startLearningSession: vi.fn(async () => ({
    id: "session-1",
    learner_id: "learner-1",
    activity_type: "tuner",
    started_at: "2026-05-28T12:00:00.000Z",
    ended_at: null,
    client_metadata: {},
  })),
  uploadRecording: vi.fn(async () => {}),
}));

describe("activity session capture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves and closes session metadata even when recording consent is off", async () => {
    const updateSettings = vi.fn(async () => {});

    const session = await startActivitySession({
      engine: { mediaStream: null } as AudioEngine,
      activityType: "tuner",
      settings: {
        learnerId: null,
        anonymousLearnerId: null,
        recordingConsentGranted: false,
        recordingConsentPolicyVersion: "recording-v1",
      },
      updateSettings,
      metadata: { tuningId: "standard" },
    });

    expect(ensureLearnerProfile).toHaveBeenCalledTimes(1);
    expect(saveRecordingConsent).not.toHaveBeenCalled();
    expect(startLearningSession).toHaveBeenCalledWith({
      learnerId: "learner-1",
      activityType: "tuner",
      metadata: {
        recordingConsentGranted: false,
        consentPolicyVersion: "recording-v1",
        tuningId: "standard",
      },
    });
    expect(session?.recordingEnabled).toBe(false);

    await session?.stop({ completionStatus: "completed", resultSummary: "6/6 strings in tune" });

    expect(uploadRecording).not.toHaveBeenCalled();
    expect(closeLearningSession).toHaveBeenCalledWith("session-1", {
      completionStatus: "completed",
      resultSummary: "6/6 strings in tune",
    });
  });
});
