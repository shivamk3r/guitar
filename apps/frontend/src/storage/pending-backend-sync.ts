import {
  closeLearningSession,
  ensureLearnerProfile,
  saveLearnerProfile,
  saveRecordingConsent,
  startLearningSession,
  updateBackendSongProgress,
} from "@/api/client";
import {
  type PendingBackendSync,
  type PendingLearningSessionSyncPayload,
  type PendingProfileSyncPayload,
  type SettingsRow,
  getDb,
} from "./db";

export interface SyncSettings {
  learnerId: string | null;
  anonymousLearnerId: string | null;
  update(patch: Partial<SettingsRow>): Promise<void>;
}

export interface PendingSyncDrainResult {
  synced: number;
  failed: number;
}

export function pendingLearningSessionSyncId(sessionId: string): string {
  return `learning-session:${sessionId}`;
}

export function pendingProfileSyncId(): string {
  return "profile:singleton";
}

export function profileSyncPayloadFromSettings(
  settings: Pick<
    SettingsRow,
    | "displayName"
    | "skillLevel"
    | "goals"
    | "handedness"
    | "instrumentPreference"
    | "dailyPracticeTargetMinutes"
    | "preferredGenres"
    | "recordingConsentGranted"
    | "onboardingCompleted"
    | "recordingConsentPolicyVersion"
  >,
  options?: {
    consentChanged?: boolean;
    consentSource?: PendingProfileSyncPayload["consentSource"];
  },
): PendingProfileSyncPayload {
  return {
    displayName: settings.displayName,
    skillLevel: settings.skillLevel,
    goals: settings.goals,
    handedness: settings.handedness,
    instrumentPreference: settings.instrumentPreference,
    dailyPracticeTargetMinutes: settings.dailyPracticeTargetMinutes,
    preferredGenres: settings.preferredGenres,
    recordingConsentGranted: settings.recordingConsentGranted,
    onboardingCompleted: settings.onboardingCompleted,
    consentChanged: options?.consentChanged ?? false,
    consentPolicyVersion: settings.recordingConsentPolicyVersion,
    consentSource: options?.consentSource ?? "settings",
  };
}

export function pendingLearningSessionRecord(input: {
  payload: PendingLearningSessionSyncPayload;
  existing?: PendingBackendSync;
  error?: unknown;
  nowIso?: string;
}): PendingBackendSync {
  const nowIso = input.nowIso ?? new Date().toISOString();
  return {
    id: pendingLearningSessionSyncId(input.payload.sessionId),
    kind: "learning-session",
    payload: input.payload,
    attempts: input.existing?.attempts ?? 0,
    lastError:
      input.error == null ? (input.existing?.lastError ?? null) : errorMessage(input.error),
    createdAtIso: input.existing?.createdAtIso ?? nowIso,
    updatedAtIso: nowIso,
  };
}

export function pendingProfileSyncRecord(input: {
  payload: PendingProfileSyncPayload;
  existing?: PendingBackendSync;
  error?: unknown;
  nowIso?: string;
}): PendingBackendSync {
  const nowIso = input.nowIso ?? new Date().toISOString();
  return {
    id: pendingProfileSyncId(),
    kind: "profile",
    payload: input.payload,
    attempts: input.existing?.attempts ?? 0,
    lastError:
      input.error == null ? (input.existing?.lastError ?? null) : errorMessage(input.error),
    createdAtIso: input.existing?.createdAtIso ?? nowIso,
    updatedAtIso: nowIso,
  };
}

export async function enqueuePendingLearningSessionSync(
  payload: PendingLearningSessionSyncPayload,
  error?: unknown,
): Promise<PendingBackendSync> {
  const db = await getDb();
  const id = pendingLearningSessionSyncId(payload.sessionId);
  const existing = await db.get("pendingBackendSync", id);
  const record = pendingLearningSessionRecord({ payload, existing, error });
  await db.put("pendingBackendSync", record);
  return record;
}

export async function enqueuePendingProfileSync(
  payload: PendingProfileSyncPayload,
  error?: unknown,
): Promise<PendingBackendSync> {
  const db = await getDb();
  const existing = await db.get("pendingBackendSync", pendingProfileSyncId());
  const record = pendingProfileSyncRecord({ payload, existing, error });
  await db.put("pendingBackendSync", record);
  return record;
}

export async function syncLearningSessionOrQueue(
  payload: PendingLearningSessionSyncPayload,
  settings: SyncSettings,
): Promise<{ synced: boolean; queued: boolean; error: string | null }> {
  try {
    await syncLearningSession(payload, settings);
    await removePendingLearningSessionSync(payload.sessionId);
    return { synced: true, queued: false, error: null };
  } catch (err) {
    await enqueuePendingLearningSessionSync(payload, err);
    return { synced: false, queued: true, error: errorMessage(err) };
  }
}

export async function syncProfileOrQueue(
  payload: PendingProfileSyncPayload,
  settings: SyncSettings,
): Promise<{ synced: boolean; queued: boolean; error: string | null }> {
  try {
    await syncProfile(payload, settings);
    await removePendingProfileSync();
    return { synced: true, queued: false, error: null };
  } catch (err) {
    await enqueuePendingProfileSync(payload, err);
    return { synced: false, queued: true, error: errorMessage(err) };
  }
}

export async function drainPendingBackendSync(
  settings: SyncSettings,
): Promise<PendingSyncDrainResult> {
  const db = await getDb();
  const records = (await db.getAll("pendingBackendSync")).sort((a, b) =>
    a.createdAtIso.localeCompare(b.createdAtIso),
  );
  let synced = 0;
  let failed = 0;

  for (const record of records) {
    try {
      if (record.kind === "profile") {
        await syncProfile(record.payload as PendingProfileSyncPayload, settings);
      } else {
        await syncLearningSession(record.payload as PendingLearningSessionSyncPayload, settings);
      }
      await db.delete("pendingBackendSync", record.id);
      synced += 1;
    } catch (err) {
      failed += 1;
      await db.put("pendingBackendSync", {
        ...record,
        attempts: record.attempts + 1,
        lastError: errorMessage(err),
        updatedAtIso: new Date().toISOString(),
      });
    }
  }

  return { synced, failed };
}

export async function removePendingLearningSessionSync(sessionId: string): Promise<void> {
  const db = await getDb();
  await db.delete("pendingBackendSync", pendingLearningSessionSyncId(sessionId));
}

export async function removePendingProfileSync(): Promise<void> {
  const db = await getDb();
  await db.delete("pendingBackendSync", pendingProfileSyncId());
}

export async function getPendingBackendSyncRecords(): Promise<PendingBackendSync[]> {
  const db = await getDb();
  return (await db.getAll("pendingBackendSync")).sort((a, b) =>
    a.createdAtIso.localeCompare(b.createdAtIso),
  );
}

async function syncProfile(
  payload: PendingProfileSyncPayload,
  settings: SyncSettings,
): Promise<void> {
  const learner = await ensureLearnerProfile({
    learnerId: settings.learnerId,
    anonymousLearnerId: settings.anonymousLearnerId,
    onProfile: settings.update,
  });
  await saveLearnerProfile(learner.id, {
    display_name: payload.displayName,
    skill_level: payload.skillLevel,
    goals: payload.goals,
    handedness: payload.handedness,
    instrument_preference: payload.instrumentPreference,
    daily_practice_target_minutes: payload.dailyPracticeTargetMinutes,
    preferred_genres: payload.preferredGenres,
    recording_consent_granted: payload.recordingConsentGranted,
    onboarding_completed: payload.onboardingCompleted,
  });
  if (payload.consentChanged) {
    await saveRecordingConsent({
      learnerId: learner.id,
      granted: payload.recordingConsentGranted,
      policyVersion: payload.consentPolicyVersion,
      source: payload.consentSource,
    });
  }
}

async function syncLearningSession(
  payload: PendingLearningSessionSyncPayload,
  settings: SyncSettings,
): Promise<void> {
  const learner = await ensureLearnerProfile({
    learnerId: settings.learnerId,
    anonymousLearnerId: settings.anonymousLearnerId,
    onProfile: settings.update,
  });
  await startLearningSession({
    id: payload.sessionId,
    learnerId: learner.id,
    activityType: payload.activityType,
    startedAtIso: payload.startedAtIso,
    metadata: payload.metadata,
  });
  await closeLearningSession(payload.sessionId, payload.metadata, payload.endedAtIso);

  if (payload.songProgress) {
    await updateBackendSongProgress({
      learnerId: learner.id,
      songId: payload.songProgress.songId,
      status: payload.songProgress.status,
      mastery: payload.songProgress.mastery,
      minutes: payload.songProgress.minutes,
      completedSectionIds: payload.songProgress.completedSectionIds,
      lastTempo: payload.songProgress.lastTempo,
    });
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Backend sync failed.";
}
