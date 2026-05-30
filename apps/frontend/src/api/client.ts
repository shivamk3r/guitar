export type ActivityType =
  | "tuner"
  | "chord_check"
  | "practice_drill"
  | "lesson"
  | "song_practice"
  | "ear_training"
  | "fretboard_trainer"
  | "technique_drill";

export interface LearnerProfile {
  id: string;
  anonymous_id: string;
}

export interface LocalLearnerProfile {
  id: string;
  learner_id: string;
  display_name: string;
  skill_level: string;
  goals: string[];
  handedness: string;
  instrument_preference: string;
  daily_practice_target_minutes: number;
  preferred_genres: string[];
  recording_consent_granted: boolean;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface LearnerProfilePatch {
  display_name?: string;
  skill_level?: string;
  goals?: string[];
  handedness?: string;
  instrument_preference?: string;
  daily_practice_target_minutes?: number;
  preferred_genres?: string[];
  recording_consent_granted?: boolean;
  onboarding_completed?: boolean;
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
  score: PracticeScore | null;
  tuner_note: string | null;
  tuner_in_tune_rate: number | null;
  tuner_mean_abs_cents: number | null;
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

export interface PracticeScore {
  value: number;
  label: string;
  analysis_coverage: number | null;
  clarity: number | null;
  decisive_accuracy: number | null;
  accepted_rate: number | null;
  rejected_rate: number | null;
  uncertain_rate: number | null;
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
  tuner: TunerAnalysis | null;
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
  score: PracticeScore | null;
  average_confidence: number | null;
  attempts: PracticeAttemptAnalysis[];
}

export interface TunerAnalysis {
  tuning_id: string | null;
  tuning_name: string | null;
  frame_count: number;
  voiced_frame_count: number;
  stable_frame_count: number;
  in_tune_frame_rate: number;
  median_hz: number | null;
  median_note: string | null;
  median_cents: number | null;
  mean_abs_cents: number | null;
  cents_std_dev: number | null;
}

export interface ApiProgressItem {
  id: string;
  learner_id: string;
  item_type: string;
  item_id: string;
  status: string;
  mastery: number;
  attempts: number;
  minutes: number;
  best_score: number | null;
  last_score: number | null;
  bpm_ceiling: number | null;
  due_at: string | null;
  last_practiced_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ApiLearningPathSkill {
  id: string;
  title: string;
  area: string;
  level: string;
  description: string;
  required_skill_ids: string[];
  lesson_ids: string[];
  target_ids: string[];
  practice: Record<string, unknown>;
  status: string;
  mastery: number;
}

export interface ApiLearningPath {
  learner_id: string;
  generated_at: string;
  profile: LocalLearnerProfile;
  skills: ApiLearningPathSkill[];
  next_skill_ids: string[];
}

export interface ApiPracticePlanTask {
  id: string;
  title: string;
  kind: string;
  minutes: number;
  route: string;
  reason: string;
  target_ids: string[];
}

export interface ApiPracticePlanOption {
  minutes: number;
  title: string;
  tasks: ApiPracticePlanTask[];
}

export interface ApiPracticePlan {
  learner_id: string;
  generated_at: string;
  options: ApiPracticePlanOption[];
}

export interface ApiDashboardRecap {
  title: string;
  period_days: number;
  practice_days: number;
  session_count: number;
  practice_minutes: number;
  consistency: string;
  best_improvement: string;
  current_blocker: string;
  suggested_focus: string;
}

export interface ApiDashboard {
  learner_id: string;
  generated_at: string;
  practice_minutes_7d: number;
  practice_minutes_30d: number;
  streak_days: number;
  mastered_count: number;
  review_count: number;
  ready_count: number;
  weak_chords: string[];
  weak_transitions: string[];
  highlights: string[];
  blockers: string[];
  recommendations: string[];
  challenges: { id: string; title: string; status: string; progress: number }[];
  recaps: {
    weekly: ApiDashboardRecap;
    monthly: ApiDashboardRecap;
  };
}

export interface ApiSong {
  id: string;
  title: string;
  origin: string;
  difficulty: string;
  required_skill_ids: string[];
  chords: string[];
  tempo: number;
  strumming_pattern: string;
  sections: {
    id: string;
    name: string;
    bars: number;
    chords: string[];
    lyrics_hint: string | null;
  }[];
  recommendation: string;
  progress: ApiProgressItem | null;
}

export interface JournalEntry {
  id: string;
  learner_id: string;
  session_id: string | null;
  body: string;
  mood: string | null;
  focus: string | null;
  created_at: string;
  updated_at: string;
}

export interface LearnerExport {
  learner_id: string;
  generated_at: string;
  profile: LocalLearnerProfile;
  progress_items: ApiProgressItem[];
  sessions: SessionHistoryItem[];
  journal_entries: JournalEntry[];
  recording_count: number;
  deleted_recording_count: number;
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

export async function fetchLearnerProfile(learnerId: string): Promise<LocalLearnerProfile> {
  return getJson<LocalLearnerProfile>(`/v1/learners/${learnerId}/profile`);
}

export async function saveLearnerProfile(
  learnerId: string,
  patch: LearnerProfilePatch,
): Promise<LocalLearnerProfile> {
  return putJson<LocalLearnerProfile>(`/v1/learners/${learnerId}/profile`, patch);
}

export async function fetchLearningPath(learnerId: string): Promise<ApiLearningPath> {
  return getJson<ApiLearningPath>(`/v1/learners/${learnerId}/learning-path`);
}

export async function fetchPracticePlan(learnerId: string): Promise<ApiPracticePlan> {
  return getJson<ApiPracticePlan>(`/v1/learners/${learnerId}/practice-plan`);
}

export async function fetchProgressDashboard(learnerId: string): Promise<ApiDashboard> {
  return getJson<ApiDashboard>(`/v1/learners/${learnerId}/dashboard`);
}

export async function fetchLearnerExport(learnerId: string): Promise<LearnerExport> {
  return getJson<LearnerExport>(`/v1/learners/${learnerId}/export`);
}

export async function fetchSongs(learnerId: string): Promise<ApiSong[]> {
  return getJson<ApiSong[]>(`/v1/learners/${learnerId}/songs`);
}

export async function upsertBackendProgressItem(input: {
  learnerId: string;
  itemType: string;
  itemId: string;
  status: string;
  mastery: number;
  attempts?: number;
  minutes?: number;
  bestScore?: number | null;
  lastScore?: number | null;
  bpmCeiling?: number | null;
  metadata?: Record<string, unknown>;
}): Promise<ApiProgressItem> {
  return postJson<ApiProgressItem>(`/v1/learners/${input.learnerId}/progress-items`, {
    item_type: input.itemType,
    item_id: input.itemId,
    status: input.status.replaceAll("-", "_"),
    mastery: input.mastery,
    attempts: input.attempts ?? 0,
    minutes: input.minutes ?? 0,
    best_score: input.bestScore ?? null,
    last_score: input.lastScore ?? null,
    bpm_ceiling: input.bpmCeiling ?? null,
    metadata: input.metadata ?? {},
  });
}

export async function completeBackendLesson(input: {
  learnerId: string;
  lessonId: string;
  minutes: number;
  score?: number;
  notes?: string;
}): Promise<ApiProgressItem> {
  return postJson<ApiProgressItem>(
    `/v1/learners/${input.learnerId}/lessons/${input.lessonId}/complete`,
    {
      minutes: input.minutes,
      score: input.score ?? 100,
      notes: input.notes ?? null,
    },
  );
}

export async function updateBackendSongProgress(input: {
  learnerId: string;
  songId: string;
  status: string;
  mastery: number;
  minutes: number;
  completedSectionIds: string[];
  lastTempo: number;
}): Promise<ApiProgressItem> {
  return patchJson<ApiProgressItem>(`/v1/learners/${input.learnerId}/songs/${input.songId}`, {
    status: input.status.replaceAll("-", "_"),
    mastery: input.mastery,
    minutes: input.minutes,
    completed_section_ids: input.completedSectionIds,
    last_tempo: input.lastTempo,
  });
}

export async function startLearningSession(input: {
  id?: string;
  learnerId: string;
  activityType: ActivityType;
  startedAtIso?: string;
  metadata?: Record<string, unknown>;
}): Promise<LearningSession> {
  const body: Record<string, unknown> = {
    learner_id: input.learnerId,
    activity_type: input.activityType,
    client_metadata: input.metadata ?? {},
  };
  if (input.id) body.id = input.id;
  if (input.startedAtIso) body.started_at = input.startedAtIso;
  return postJson<LearningSession>("/v1/sessions", body);
}

export async function closeLearningSession(
  sessionId: string,
  metadata?: Record<string, unknown>,
  endedAtIso?: string,
): Promise<void> {
  const body: Record<string, unknown> = {
    client_metadata: metadata ?? {},
  };
  if (endedAtIso) body.ended_at = endedAtIso;
  await patchJson(`/v1/sessions/${sessionId}`, body);
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

export async function fetchSessionJournal(sessionId: string): Promise<JournalEntry[]> {
  return getJson<JournalEntry[]>(`/v1/sessions/${sessionId}/journal`);
}

export async function createSessionJournal(input: {
  sessionId: string;
  learnerId: string;
  body: string;
  mood?: string | null;
  focus?: string | null;
}): Promise<JournalEntry> {
  return postJson<JournalEntry>(`/v1/sessions/${input.sessionId}/journal`, {
    learner_id: input.learnerId,
    body: input.body,
    mood: input.mood ?? null,
    focus: input.focus ?? null,
  });
}

export async function fetchRecordingAnalysis(recordingId: string): Promise<RecordingAnalysis> {
  return getJson<RecordingAnalysis>(`/v1/recordings/${recordingId}/analysis`);
}

export async function markRecordingExported(recordingId: string): Promise<void> {
  await postJson(`/v1/recordings/${recordingId}/export`, {});
}

export async function deleteRecording(recordingId: string, reason?: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/v1/recordings/${recordingId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason: reason ?? null }),
  });
  if (!response.ok) throw new Error(await responseError(response));
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

async function putJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "PUT",
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
