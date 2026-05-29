export type ActivityType = "tuner" | "chord_check" | "practice_drill";

export interface LearnerProfile {
  id: string;
  anonymous_id: string;
}

export interface LearningSession {
  id: string;
  learner_id: string;
  activity_type: ActivityType;
  started_at: string;
  ended_at: string | null;
  client_metadata: Record<string, unknown>;
}

export interface RecordingSummary {
  id: string;
  session_id: string;
  content_type: string;
  size_bytes: number;
  captured_at: string;
  created_at: string;
  analysis: RecordingAnalysisSummary;
}

export interface SessionHistoryItem extends LearningSession {
  duration_seconds: number | null;
  completion_status: string;
  score: number | null;
  result_summary: string | null;
  recording_available: boolean;
  recordings: RecordingSummary[];
}

export interface RecordingAnalysisSummary {
  status: string;
  result: string | null;
  guidance: string | null;
  target_chord_id: string | null;
  predicted_chord_id: string | null;
  confidence: number | null;
  attempt_count: number | null;
  analyzed_attempt_count: number | null;
  accepted_count: number | null;
  rejected_count: number | null;
  uncertain_count: number | null;
  completed_at: string | null;
}

export interface RecordingAnalysis {
  status: string;
  recording_id: string;
  activity_type: ActivityType;
  created_at: string | null;
  completed_at: string | null;
  detector: AnalysisDetector | null;
  target: AnalysisTarget;
  prediction: AnalysisPrediction | null;
  capture: AnalysisCapture | null;
  practice: PracticeAnalysis | null;
  guidance: string | null;
  error: string | null;
}

export interface AnalysisDetector {
  name: string;
  model_id: string | null;
  model_revision: string | null;
  model_filename: string | null;
}

export interface AnalysisTarget {
  chord_id: string | null;
}

export interface AnalysisPrediction {
  chord_id: string | null;
  verifier_status: string | null;
  confidence: number | null;
  expected_similarity: number | null;
  best_alternative_chord_id: string | null;
  alternative_similarity: number | null;
  margin: number | null;
  top_predictions: AnalysisTopPrediction[];
}

export interface AnalysisTopPrediction {
  chord_id: string | null;
  confidence: number;
  root: string | null;
  quality: string | null;
}

export interface AnalysisCapture {
  has_signal: boolean | null;
  duration_sec: number | null;
  raw_root: string | null;
  raw_quality: string | null;
  root_confidence: number | null;
  quality_confidence: number | null;
  frame_count: number | null;
  frames_used: number | null;
  capture_start_sec: number | null;
  capture_end_sec: number | null;
}

export interface PracticeAnalysis {
  mode: string | null;
  bpm: number | null;
  beats_per_chord: number | null;
  count_in_beats: number | null;
  attempt_count: number;
  analyzed_attempt_count: number;
  accepted_count: number;
  rejected_count: number;
  uncertain_count: number;
  skipped_count: number;
  average_confidence: number | null;
  attempts: PracticeAttemptAnalysis[];
}

export interface PracticeAttemptAnalysis {
  id: string | null;
  expected_index: number | null;
  expected_chord_id: string;
  frontend_detected_chord_id: string | null;
  backend_predicted_chord_id: string | null;
  verifier_status: string;
  confidence: number | null;
  expected_similarity: number | null;
  best_alternative_chord_id: string | null;
  alternative_similarity: number | null;
  margin: number | null;
  frontend_score: number | null;
  detected_at_beat: number | null;
  timing_delta_ms: number | null;
  capture_start_sec: number;
  capture_end_sec: number;
  raw_root: string | null;
  raw_quality: string | null;
  frames_used: number | null;
  top_predictions: AnalysisTopPrediction[];
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:7654").replace(
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

export async function closeLearningSession(
  sessionId: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await patchJson(`/v1/sessions/${sessionId}`, {
    client_metadata: metadata ?? {},
  });
}

export async function uploadRecording(input: {
  sessionId: string;
  blob: Blob;
  capturedAtIso: string;
}): Promise<void> {
  const body = new FormData();
  body.append(
    "file",
    input.blob,
    `session-${input.sessionId}.${recordingExtension(input.blob.type)}`,
  );
  body.append("captured_at", input.capturedAtIso);
  const response = await fetch(`${API_BASE_URL}/v1/sessions/${input.sessionId}/recordings`, {
    method: "POST",
    body,
  });
  if (!response.ok) throw new Error(await responseError(response));
}

export async function fetchLearnerHistory(learnerId: string): Promise<SessionHistoryItem[]> {
  return getJson<SessionHistoryItem[]>(`/v1/learners/${learnerId}/history`);
}

export async function fetchSessionDetail(sessionId: string): Promise<SessionHistoryItem> {
  return getJson<SessionHistoryItem>(`/v1/sessions/${sessionId}`);
}

export async function fetchRecordingAnalysis(recordingId: string): Promise<RecordingAnalysis> {
  return getJson<RecordingAnalysis>(`/v1/recordings/${recordingId}/analysis`);
}

export function recordingMediaUrl(recordingId: string): string {
  return `${API_BASE_URL}/v1/recordings/${recordingId}/media`;
}

function recordingExtension(contentType: string): string {
  const normalized = contentType.split(";")[0]?.trim().toLowerCase();
  if (normalized === "audio/wav" || normalized === "audio/wave" || normalized === "audio/x-wav") {
    return "wav";
  }
  if (normalized === "audio/mp4") return "mp4";
  return "webm";
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);
  if (!response.ok) throw new Error(await responseError(response));
  return response.json() as Promise<T>;
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
