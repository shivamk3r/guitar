import json

import boto3

from .config import Settings, get_settings


class AnalysisQueue:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self.queue_url = self.settings.sqs_queue_url
        self.client = boto3.client(
            "sqs",
            endpoint_url=self.settings.aws_endpoint_url,
            region_name=self.settings.aws_region,
            aws_access_key_id=self.settings.aws_access_key_id,
            aws_secret_access_key=self.settings.aws_secret_access_key,
        )

    def enqueue(self, job_id: str, recording_id: str) -> None:
        self.client.send_message(
            QueueUrl=self.queue_url,
            MessageBody=json.dumps({"job_id": job_id, "recording_id": recording_id}),
        )


def get_analysis_queue() -> AnalysisQueue:
    return AnalysisQueue()
