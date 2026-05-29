from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

ActivityType = Literal["tuner", "chord_check", "practice_drill"]


class LearnerCreate(BaseModel):
    anonymous_id: str = Field(min_length=8, max_length=128)


class LearnerOut(BaseModel):
    id: str
    anonymous_id: str
    created_at: datetime

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
    learner_id: str
    activity_type: ActivityType
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


class RecordingAnalysisSummaryOut(BaseModel):
    status: str
    result: str | None = None
    guidance: str | None = None
    target_chord_id: str | None = None
    predicted_chord_id: str | None = None
    confidence: float | None = None
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
