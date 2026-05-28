import {
  type ActivityType,
  closeLearningSession,
  ensureLearnerProfile,
  saveRecordingConsent,
  startLearningSession,
  uploadRecording,
} from "@/api/client";
import type { SettingsRow } from "@/storage/db";
import type { AudioEngine } from "./engine";

export interface ActiveRecordedSession {
  stop(): Promise<void>;
}

export async function startRecordedSession(input: {
  engine: AudioEngine;
  activityType: ActivityType;
  settings: Pick<
    SettingsRow,
    "learnerId" | "anonymousLearnerId" | "recordingConsentGranted" | "recordingConsentPolicyVersion"
  >;
  updateSettings(patch: Partial<SettingsRow>): Promise<void>;
  metadata?: Record<string, unknown>;
}): Promise<ActiveRecordedSession | null> {
  if (!input.settings.recordingConsentGranted) return null;
  if (!input.engine.mediaStream || typeof MediaRecorder === "undefined") return null;

  const learner = await ensureLearnerProfile({
    learnerId: input.settings.learnerId,
    anonymousLearnerId: input.settings.anonymousLearnerId,
    onProfile: (profile) => input.updateSettings(profile),
  });
  await saveRecordingConsent({
    learnerId: learner.id,
    granted: true,
    policyVersion: input.settings.recordingConsentPolicyVersion,
    source: "session-start",
  });
  const session = await startLearningSession({
    learnerId: learner.id,
    activityType: input.activityType,
    metadata: {
      consentPolicyVersion: input.settings.recordingConsentPolicyVersion,
      ...input.metadata,
    },
  });

  const capturedAtIso = new Date().toISOString();
  const chunks: BlobPart[] = [];
  const mimeType = supportedMimeType();
  const recorder = mimeType
    ? new MediaRecorder(input.engine.mediaStream, { mimeType })
    : new MediaRecorder(input.engine.mediaStream);
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.start(5000);

  return {
    async stop() {
      const blob = await stopRecorder(recorder, chunks);
      try {
        if (blob.size > 0) await uploadRecording({ sessionId: session.id, blob, capturedAtIso });
      } finally {
        await closeLearningSession(session.id);
      }
    },
  };
}

function supportedMimeType(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function stopRecorder(recorder: MediaRecorder, chunks: BlobPart[]): Promise<Blob> {
  return new Promise((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
    if (recorder.state === "inactive") {
      resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
      return;
    }
    recorder.requestData();
    recorder.stop();
  });
}
