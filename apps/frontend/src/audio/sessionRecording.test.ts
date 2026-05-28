import {
  closeLearningSession,
  ensureLearnerProfile,
  saveRecordingConsent,
  startLearningSession,
  uploadRecording,
} from "@/api/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AudioEngine } from "./engine";
import { startRawPcmRecorder } from "./rawPcmRecorder";
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

vi.mock("./rawPcmRecorder", () => ({
  startRawPcmRecorder: vi.fn(),
}));

const rawStop = vi.fn();

describe("activity session capture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rawStop.mockResolvedValue(new Blob(["raw-audio"], { type: "audio/wav" }));
    vi.mocked(startRawPcmRecorder).mockResolvedValue({ stop: rawStop });
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

  it("records consented sessions as raw wav audio before uploading", async () => {
    const updateSettings = vi.fn(async () => {});
    const ctx = { sampleRate: 48000 } as AudioContext;
    const mediaStream = {
      getAudioTracks: () => [{ getSettings: () => ({ channelCount: 1 }) }],
    } as unknown as MediaStream;

    const session = await startActivitySession({
      engine: { ctx, mediaStream } as AudioEngine,
      activityType: "tuner",
      settings: {
        learnerId: "learner-1",
        anonymousLearnerId: "anon-1",
        recordingConsentGranted: true,
        recordingConsentPolicyVersion: "recording-v1",
      },
      updateSettings,
      metadata: { tuningId: "standard" },
    });

    expect(saveRecordingConsent).toHaveBeenCalledWith({
      learnerId: "learner-1",
      granted: true,
      policyVersion: "recording-v1",
      source: "session-start",
    });
    expect(startRawPcmRecorder).toHaveBeenCalledWith({ ctx, mediaStream });
    expect(session?.recordingEnabled).toBe(true);

    await session?.stop({ completionStatus: "completed" });

    const upload = vi.mocked(uploadRecording).mock.calls[0]?.[0];
    expect(upload).toBeDefined();
    if (!upload) throw new Error("expected recording upload");
    expect(upload.sessionId).toBe("session-1");
    expect(upload.blob.type).toBe("audio/wav");
    await expect(readBlobAsText(upload.blob)).resolves.toBe("raw-audio");
    expect(closeLearningSession).toHaveBeenCalledWith("session-1", {
      completionStatus: "completed",
    });
  });
});

function readBlobAsText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read blob"));
    reader.readAsText(blob);
  });
}
