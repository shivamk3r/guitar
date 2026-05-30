from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

ActivityType = Literal[
    "tuner",
    "chord_check",
    "practice_drill",
    "lesson",
    "song_practice",
    "ear_training",
    "fretboard_trainer",
    "technique_drill",
]

MasteryStatus = Literal["locked", "ready", "in_progress", "review", "mastered"]


class LearnerCreate(BaseModel):
    anonymous_id: str = Field(min_length=8, max_length=128)


class LearnerOut(BaseModel):
    id: str
    anonymous_id: str
    created_at: datetime

    model_config = {"from_attributes": True}


class LearnerProfileUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=80)
    skill_level: str | None = Field(default=None, max_length=32)
    goals: list[str] | None = None
    handedness: str | None = Field(default=None, max_length=16)
    instrument_preference: str | None = Field(default=None, max_length=32)
    daily_practice_target_minutes: int | None = Field(default=None, ge=5, le=180)
    preferred_genres: list[str] | None = None
    recording_consent_granted: bool | None = None
    onboarding_completed: bool | None = None


class LearnerProfileOut(BaseModel):
    id: str
    learner_id: str
    display_name: str
    skill_level: str
    goals: list[str]
    handedness: str
    instrument_preference: str
    daily_practice_target_minutes: int
    preferred_genres: list[str]
    recording_consent_granted: bool
    onboarding_completed: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class RecordingConsentCreate(BaseModel):
    learner_id: str
    granted: bool
    policy_version: str = "recording-v1"
    source: str = "settings"


class RecordingConsentOut(BaseModel):
    id: str
    learner_id: str
    granted: bool
    policy_version: str
    source: str
    created_at: datetime

    model_config = {"from_attributes": True}


class SessionCreate(BaseModel):
    id: str | None = Field(default=None, min_length=36, max_length=36)
    learner_id: str
    activity_type: ActivityType
    started_at: datetime | None = None
    client_metadata: dict = Field(default_factory=dict)


class SessionClose(BaseModel):
    ended_at: datetime | None = None
    client_metadata: dict = Field(default_factory=dict)


class SessionOut(BaseModel):
    id: str
    learner_id: str
    activity_type: str
    started_at: datetime
    ended_at: datetime | None
    client_metadata: dict

    model_config = {"from_attributes": True}


class ProgressItemUpsert(BaseModel):
    item_type: str = Field(min_length=1, max_length=48)
    item_id: str = Field(min_length=1, max_length=128)
    status: str = "ready"
    mastery: float = Field(default=0, ge=0, le=100)
    attempts: int = Field(default=0, ge=0)
    minutes: int = Field(default=0, ge=0)
    best_score: float | None = Field(default=None, ge=0, le=100)
    last_score: float | None = Field(default=None, ge=0, le=100)
    bpm_ceiling: int | None = Field(default=None, ge=0, le=400)
    due_at: datetime | None = None
    last_practiced_at: datetime | None = None
    metadata: dict = Field(default_factory=dict)


class ProgressItemOut(BaseModel):
    id: str
    learner_id: str
    item_type: str
    item_id: str
    status: str
    mastery: float
    attempts: int
    minutes: int
    best_score: float | None
    last_score: float | None
    bpm_ceiling: int | None
    due_at: datetime | None
    last_practiced_at: datetime | None
    metadata: dict
    created_at: datetime
    updated_at: datetime


class LessonCompleteIn(BaseModel):
    minutes: int = Field(default=5, ge=0, le=240)
    score: float | None = Field(default=None, ge=0, le=100)
    notes: str | None = Field(default=None, max_length=1000)


class RecordingOut(BaseModel):
    id: str
    session_id: str
    learner_id: str
    object_key: str
    bucket: str
    content_type: str
    size_bytes: int
    captured_at: datetime
    created_at: datetime

    model_config = {"from_attributes": True}


class PracticeScoreOut(BaseModel):
    value: float
    label: str
    analysis_coverage: float | None = None
    clarity: float | None = None
    decisive_accuracy: float | None = None
    accepted_rate: float | None = None
    rejected_rate: float | None = None
    uncertain_rate: float | None = None


class RecordingAnalysisSummaryOut(BaseModel):
    status: str
    result: str | None = None
    guidance: str | None = None
    score: PracticeScoreOut | None = None
    tuner_note: str | None = None
    tuner_in_tune_rate: float | None = None
    tuner_mean_abs_cents: float | None = None
    target_chord_id: str | None = None
    predicted_chord_id: str | None = None
    confidence: float | None = None
    attempt_count: int | None = None
    analyzed_attempt_count: int | None = None
    accepted_count: int | None = None
    rejected_count: int | None = None
    uncertain_count: int | None = None
    completed_at: datetime | None = None


class RecordingSummaryOut(BaseModel):
    id: str
    session_id: str
    content_type: str
    size_bytes: int
    captured_at: datetime
    created_at: datetime
    analysis: RecordingAnalysisSummaryOut

    model_config = {"from_attributes": True}


class AnalysisDetectorOut(BaseModel):
    name: str
    model_id: str | None = None
    model_revision: str | None = None
    model_filename: str | None = None


class AnalysisTargetOut(BaseModel):
    chord_id: str | None = None


class AnalysisTopPredictionOut(BaseModel):
    chord_id: str | None = None
    confidence: float
    root: str | None = None
    quality: str | None = None


class AnalysisPredictionOut(BaseModel):
    chord_id: str | None = None
    verifier_status: str | None = None
    confidence: float | None = None
    expected_similarity: float | None = None
    best_alternative_chord_id: str | None = None
    alternative_similarity: float | None = None
    margin: float | None = None
    top_predictions: list[AnalysisTopPredictionOut] = Field(default_factory=list)


class AnalysisCaptureOut(BaseModel):
    has_signal: bool | None = None
    duration_sec: float | None = None
    raw_root: str | None = None
    raw_quality: str | None = None
    root_confidence: float | None = None
    quality_confidence: float | None = None
    frame_count: int | None = None
    frames_used: int | None = None
    capture_start_sec: float | None = None
    capture_end_sec: float | None = None


class PracticeAttemptAnalysisOut(BaseModel):
    id: str | None = None
    expected_index: int | None = None
    expected_chord_id: str
    frontend_detected_chord_id: str | None = None
    backend_predicted_chord_id: str | None = None
    verifier_status: str
    confidence: float | None = None
    expected_similarity: float | None = None
    best_alternative_chord_id: str | None = None
    alternative_similarity: float | None = None
    margin: float | None = None
    frontend_score: float | None = None
    detected_at_beat: float | None = None
    timing_delta_ms: float | None = None
    capture_start_sec: float
    capture_end_sec: float
    raw_root: str | None = None
    raw_quality: str | None = None
    frames_used: int | None = None
    top_predictions: list[AnalysisTopPredictionOut] = Field(default_factory=list)


class PracticeAnalysisOut(BaseModel):
    mode: str | None = None
    bpm: float | None = None
    beats_per_chord: float | None = None
    count_in_beats: float | None = None
    attempt_count: int
    analyzed_attempt_count: int
    accepted_count: int
    rejected_count: int
    uncertain_count: int
    skipped_count: int
    score: PracticeScoreOut | None = None
    average_confidence: float | None = None
    attempts: list[PracticeAttemptAnalysisOut] = Field(default_factory=list)


class TunerAnalysisOut(BaseModel):
    tuning_id: str | None = None
    tuning_name: str | None = None
    frame_count: int
    voiced_frame_count: int
    stable_frame_count: int
    in_tune_frame_rate: float
    median_hz: float | None = None
    median_note: str | None = None
    median_cents: float | None = None
    mean_abs_cents: float | None = None
    cents_std_dev: float | None = None


class RecordingAnalysisOut(BaseModel):
    status: str
    recording_id: str
    activity_type: str
    created_at: datetime | None = None
    completed_at: datetime | None = None
    detector: AnalysisDetectorOut | None = None
    target: AnalysisTargetOut
    prediction: AnalysisPredictionOut | None = None
    capture: AnalysisCaptureOut | None = None
    practice: PracticeAnalysisOut | None = None
    tuner: TunerAnalysisOut | None = None
    guidance: str | None = None
    error: str | None = None


class SessionHistoryOut(SessionOut):
    duration_seconds: int | None
    completion_status: str
    score: float | None
    result_summary: str | None
    recording_available: bool
    recordings: list[RecordingSummaryOut]


class ProgressOut(BaseModel):
    learner_id: str
    summary: str
    recent_sessions: int
    pending_analysis_jobs: int
    practice_minutes_30d: int = 0
    streak_days: int = 0
    recommendations: list[str] = Field(default_factory=list)


class LearningPathSkillOut(BaseModel):
    id: str
    title: str
    area: str
    level: str
    description: str
    required_skill_ids: list[str]
    lesson_ids: list[str]
    target_ids: list[str] = Field(default_factory=list)
    practice: dict
    status: MasteryStatus
    mastery: float


class LearningPathOut(BaseModel):
    learner_id: str
    generated_at: datetime
    profile: LearnerProfileOut
    skills: list[LearningPathSkillOut]
    next_skill_ids: list[str]


class PracticePlanTaskOut(BaseModel):
    id: str
    title: str
    kind: str
    minutes: int
    route: str
    reason: str
    target_ids: list[str] = Field(default_factory=list)


class PracticePlanOptionOut(BaseModel):
    minutes: int
    title: str
    tasks: list[PracticePlanTaskOut]


class PracticePlanOut(BaseModel):
    learner_id: str
    generated_at: datetime
    options: list[PracticePlanOptionOut]


class SongSectionOut(BaseModel):
    id: str
    name: str
    bars: int
    chords: list[str]
    lyrics_hint: str | None = None


class SongOut(BaseModel):
    id: str
    title: str
    origin: str
    difficulty: str
    required_skill_ids: list[str]
    chords: list[str]
    tempo: int
    strumming_pattern: str
    sections: list[SongSectionOut]
    recommendation: str
    progress: ProgressItemOut | None = None


class SongProgressUpdate(BaseModel):
    status: str = "in_progress"
    mastery: float = Field(default=0, ge=0, le=100)
    minutes: int = Field(default=0, ge=0)
    completed_section_ids: list[str] = Field(default_factory=list)
    last_tempo: int | None = Field(default=None, ge=20, le=260)


class DashboardRecapOut(BaseModel):
    title: str
    period_days: int
    practice_days: int
    session_count: int
    practice_minutes: int
    consistency: str
    best_improvement: str
    current_blocker: str
    suggested_focus: str


class DashboardOut(BaseModel):
    learner_id: str
    generated_at: datetime
    practice_minutes_7d: int
    practice_minutes_30d: int
    streak_days: int
    mastered_count: int
    review_count: int
    ready_count: int
    weak_chords: list[str]
    weak_transitions: list[str]
    highlights: list[str]
    blockers: list[str]
    recommendations: list[str]
    challenges: list[dict]
    recaps: dict[str, DashboardRecapOut]


class JournalEntryCreate(BaseModel):
    learner_id: str
    body: str = Field(min_length=1, max_length=5000)
    mood: str | None = Field(default=None, max_length=32)
    focus: str | None = Field(default=None, max_length=80)


class JournalEntryOut(BaseModel):
    id: str
    learner_id: str
    session_id: str | None
    body: str
    mood: str | None
    focus: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class LearnerExportOut(BaseModel):
    learner_id: str
    generated_at: datetime
    profile: LearnerProfileOut
    progress_items: list[ProgressItemOut]
    sessions: list[SessionHistoryOut]
    journal_entries: list[JournalEntryOut]
    recording_count: int
    deleted_recording_count: int


class RecordingDeleteIn(BaseModel):
    reason: str | None = Field(default=None, max_length=1000)


class RecordingExportOut(BaseModel):
    recording_id: str
    media_url: str
    export_count: int
    exported_at: datetime
