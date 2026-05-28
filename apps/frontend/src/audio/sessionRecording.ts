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
  sessionId: string;
  recordingEnabled: boolean;
  stop(finalMetadata?: Record<string, unknown>): Promise<void>;
}

export async function startActivitySession(input: {
  engine: AudioEngine;
  activityType: ActivityType;
  settings: Pick<
    SettingsRow,
    "learnerId" | "anonymousLearnerId" | "recordingConsentGranted" | "recordingConsentPolicyVersion"
  >;
  updateSettings(patch: Partial<SettingsRow>): Promise<void>;
  metadata?: Record<string, unknown>;
}): Promise<ActiveRecordedSession | null> {
  const learner = await ensureLearnerProfile({
    learnerId: input.settings.learnerId,
    anonymousLearnerId: input.settings.anonymousLearnerId,
    onProfile: (profile) => input.updateSettings(profile),
  });

  const recordingEnabled =
    input.settings.recordingConsentGranted &&
    !!input.engine.mediaStream &&
    typeof MediaRecorder !== "undefined";

  if (recordingEnabled) {
    await saveRecordingConsent({
      learnerId: learner.id,
      granted: true,
      policyVersion: input.settings.recordingConsentPolicyVersion,
      source: "session-start",
    });
  }

  const session = await startLearningSession({
    learnerId: learner.id,
    activityType: input.activityType,
    metadata: {
      recordingConsentGranted: input.settings.recordingConsentGranted,
      consentPolicyVersion: input.settings.recordingConsentPolicyVersion,
      ...input.metadata,
    },
  });

  const capturedAtIso = new Date().toISOString();
  const chunks: BlobPart[] = [];
  let recorder: MediaRecorder | null = null;
  if (recordingEnabled && input.engine.mediaStream) {
    const mimeType = supportedMimeType();
    recorder = mimeType
      ? new MediaRecorder(input.engine.mediaStream, { mimeType })
      : new MediaRecorder(input.engine.mediaStream);
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.start(5000);
  }

  return {
    sessionId: session.id,
    recordingEnabled,
    async stop(finalMetadata) {
      let uploadError: unknown = null;
      try {
        if (recorder) {
          const blob = await stopRecorder(recorder, chunks);
          if (blob.size > 0) {
            await uploadRecording({ sessionId: session.id, blob, capturedAtIso });
          }
        }
      } catch (err) {
        uploadError = err;
      }
      await closeLearningSession(session.id, finalMetadata);
      if (uploadError) throw uploadError;
    },
  };
}

export const startRecordedSession = startActivitySession;

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
