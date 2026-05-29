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
import { startRawPcmRecorder } from "./rawPcmRecorder";

export interface ActiveRecordedSession {
  sessionId: string;
  recordingEnabled: boolean;
  stop(finalMetadata?: Record<string, unknown>): Promise<void>;
}

interface SessionRecorder {
  stop(): Promise<Blob>;
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

  const recordingRequested =
    input.settings.recordingConsentGranted &&
    !!input.engine.mediaStream &&
    (!!input.engine.ctx || typeof MediaRecorder !== "undefined");

  if (recordingRequested) {
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
  let recorder: SessionRecorder | null = null;
  if (recordingRequested && input.engine.mediaStream) {
    recorder = await startSessionRecorder(input.engine).catch((err) => {
      console.error("raw session recorder failed", err);
      return null;
    });
  }

  return {
    sessionId: session.id,
    recordingEnabled: recorder !== null,
    async stop(finalMetadata) {
      let uploadError: unknown = null;
      let blob: Blob | null = null;
      try {
        if (recorder) {
          blob = await recorder.stop();
        }
      } catch (err) {
        uploadError = err;
      }
      await closeLearningSession(session.id, finalMetadata);
      try {
        if (blob && blob.size > 0) {
          await uploadRecording({ sessionId: session.id, blob, capturedAtIso });
        }
      } catch (err) {
        uploadError = err;
      }
      if (uploadError) throw uploadError;
    },
  };
}

export const startRecordedSession = startActivitySession;

async function startSessionRecorder(engine: AudioEngine): Promise<SessionRecorder> {
  if (!engine.mediaStream) {
    throw new Error("No microphone stream is available for recording.");
  }

  if (engine.ctx) {
    try {
      return await startRawPcmRecorder({
        ctx: engine.ctx,
        mediaStream: engine.mediaStream,
      });
    } catch (err) {
      if (typeof MediaRecorder === "undefined") throw err;
      console.warn("Falling back to compressed MediaRecorder capture.", err);
    }
  }

  if (typeof MediaRecorder === "undefined") {
    throw new Error("Session recording is not supported in this browser.");
  }
  return startMediaRecorder(engine.mediaStream);
}

function startMediaRecorder(mediaStream: MediaStream): SessionRecorder {
  const chunks: BlobPart[] = [];
  const mimeType = supportedMimeType();
  const recorder = mimeType
    ? new MediaRecorder(mediaStream, { mimeType })
    : new MediaRecorder(mediaStream);
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.start(5000);
  return {
    stop: () => stopMediaRecorder(recorder, chunks),
  };
}

function supportedMimeType(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function stopMediaRecorder(recorder: MediaRecorder, chunks: BlobPart[]): Promise<Blob> {
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
