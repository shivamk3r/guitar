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


class RecordingSummaryOut(BaseModel):
    id: str
    session_id: str
    content_type: str
    size_bytes: int
    captured_at: datetime
    created_at: datetime

    model_config = {"from_attributes": True}


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
