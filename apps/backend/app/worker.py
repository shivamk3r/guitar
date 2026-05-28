import json
import logging
import time
from typing import Any

from sqlalchemy.orm import Session

from . import models
from .config import get_settings
from .database import SessionLocal, init_db
from .queue import AnalysisQueue
from .storage import ObjectStorage

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("guitar.worker")


def complete_job(db: Session, job_id: str, recording_id: str) -> None:
    job = db.get(models.AnalysisJob, job_id)
    recording = db.get(models.AudioRecording, recording_id)
    if job is None or recording is None:
        logger.warning("Skipping unknown analysis job=%s recording=%s", job_id, recording_id)
        return

    job.status = "running"
    job.started_at = models.utcnow()
    db.commit()

    result = models.AnalysisResult(
        job_id=job.id,
        recording_id=recording.id,
        metrics={
            "placeholder": True,
            "activity": recording.session.activity_type,
            "size_bytes": recording.size_bytes,
        },
        guidance="Recording captured. Detailed skill analysis will be added in a later milestone.",
    )
    db.add(result)
    job.status = "completed"
    job.completed_at = models.utcnow()
    db.commit()


def handle_message(message: dict[str, Any], queue: AnalysisQueue) -> None:
    payload = json.loads(message["Body"])
    with SessionLocal() as db:
        complete_job(db, job_id=payload["job_id"], recording_id=payload["recording_id"])
    queue.client.delete_message(QueueUrl=queue.queue_url, ReceiptHandle=message["ReceiptHandle"])


def run_forever() -> None:
    settings = get_settings()
    init_db()
    ObjectStorage(settings).ensure_bucket()
    queue = AnalysisQueue(settings)
    logger.info("Worker polling %s", queue.queue_url)
    while True:
        response = queue.client.receive_message(
            QueueUrl=queue.queue_url,
            MaxNumberOfMessages=5,
            WaitTimeSeconds=settings.worker_poll_seconds,
        )
        for message in response.get("Messages", []):
            try:
                handle_message(message, queue)
            except Exception:
                logger.exception("Failed to process analysis message")
        time.sleep(0.2)


if __name__ == "__main__":
    run_forever()
