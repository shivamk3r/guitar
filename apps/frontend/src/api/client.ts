export type ActivityType = "tuner" | "chord_check" | "practice_drill";

export interface LearnerProfile {
  id: string;
  anonymous_id: string;
}

export interface LearningSession {
  id: string;
  learner_id: string;
  activity_type: ActivityType;
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000").replace(
  /\/$/,
  "",
);

export function createAnonymousLearnerId(): string {
  return `anon-${crypto.randomUUID()}`;
}

export async function ensureLearnerProfile(input: {
  learnerId: string | null;
  anonymousLearnerId: string | null;
  onProfile(profile: { learnerId: string; anonymousLearnerId: string }): Promise<void>;
}): Promise<LearnerProfile> {
  const anonymousLearnerId = input.anonymousLearnerId ?? createAnonymousLearnerId();
  const profile = await postJson<LearnerProfile>("/v1/learners", {
    anonymous_id: anonymousLearnerId,
  });
  if (profile.id !== input.learnerId || profile.anonymous_id !== input.anonymousLearnerId) {
    await input.onProfile({ learnerId: profile.id, anonymousLearnerId: profile.anonymous_id });
  }
  return profile;
}

export async function saveRecordingConsent(input: {
  learnerId: string;
  granted: boolean;
  policyVersion: string;
  source?: string;
}): Promise<void> {
  await postJson("/v1/consents/recording", {
    learner_id: input.learnerId,
    granted: input.granted,
    policy_version: input.policyVersion,
    source: input.source ?? "settings",
  });
}

export async function startLearningSession(input: {
  learnerId: string;
  activityType: ActivityType;
  metadata?: Record<string, unknown>;
}): Promise<LearningSession> {
  return postJson<LearningSession>("/v1/sessions", {
    learner_id: input.learnerId,
    activity_type: input.activityType,
    client_metadata: input.metadata ?? {},
  });
}

export async function closeLearningSession(sessionId: string): Promise<void> {
  await patchJson(`/v1/sessions/${sessionId}`, {});
}

export async function uploadRecording(input: {
  sessionId: string;
  blob: Blob;
  capturedAtIso: string;
}): Promise<void> {
  const body = new FormData();
  body.append("file", input.blob, `session-${input.sessionId}.webm`);
  body.append("captured_at", input.capturedAtIso);
  const response = await fetch(`${API_BASE_URL}/v1/sessions/${input.sessionId}/recordings`, {
    method: "POST",
    body,
  });
  if (!response.ok) throw new Error(await responseError(response));
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await responseError(response));
  return response.json() as Promise<T>;
}

async function patchJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await responseError(response));
  return response.json() as Promise<T>;
}

async function responseError(response: Response): Promise<string> {
  const text = await response.text();
  return text || `${response.status} ${response.statusText}`;
}
