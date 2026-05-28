from pathlib import Path

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app import models
from app.database import Base
from app.worker import complete_job


def test_complete_job_writes_placeholder_result(tmp_path: Path) -> None:
    engine = create_engine(f"sqlite+pysqlite:///{tmp_path / 'worker.db'}")
    Base.metadata.create_all(bind=engine)
    session_local = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)

    with session_local() as db:
        learner = models.Learner(anonymous_id="anonymous-worker-test")
        db.add(learner)
        db.flush()
        session = models.LearningSession(learner_id=learner.id, activity_type="practice_drill")
        db.add(session)
        db.flush()
        recording = models.AudioRecording(
            session_id=session.id,
            learner_id=learner.id,
            object_key="recordings/test.webm",
            bucket="test-recordings",
            content_type="audio/webm",
            size_bytes=12,
        )
        db.add(recording)
        db.flush()
        job = models.AnalysisJob(recording_id=recording.id, status="queued")
        db.add(job)
        db.commit()

        complete_job(db, job.id, recording.id)

        completed_job = db.get(models.AnalysisJob, job.id)
        result = db.scalar(select(models.AnalysisResult).where(models.AnalysisResult.job_id == job.id))

    assert completed_job is not None
    assert completed_job.status == "completed"
    assert completed_job.completed_at is not None
    assert result is not None
    assert result.metrics["placeholder"] is True
    assert result.metrics["activity"] == "practice_drill"
