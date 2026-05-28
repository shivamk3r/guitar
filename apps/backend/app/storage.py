from typing import BinaryIO

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

from .config import Settings, get_settings


class ObjectStorage:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self.bucket = self.settings.object_storage_bucket
        self.client = boto3.client(
            "s3",
            endpoint_url=self.settings.object_storage_endpoint_url,
            aws_access_key_id=self.settings.object_storage_access_key,
            aws_secret_access_key=self.settings.object_storage_secret_key,
            region_name=self.settings.aws_region,
            config=Config(signature_version="s3v4"),
        )

    def ensure_bucket(self) -> None:
        try:
            self.client.head_bucket(Bucket=self.bucket)
        except ClientError:
            self.client.create_bucket(Bucket=self.bucket)

    def put_recording(
        self,
        learner_id: str,
        session_id: str,
        recording_id: str,
        file_obj: BinaryIO,
        content_type: str,
    ) -> tuple[str, int]:
        extension = recording_file_extension(content_type)
        object_key = f"learners/{learner_id}/sessions/{session_id}/recordings/{recording_id}.{extension}"
        current = file_obj.tell()
        file_obj.seek(0, 2)
        size_bytes = file_obj.tell()
        file_obj.seek(current)
        self.client.upload_fileobj(
            file_obj,
            self.bucket,
            object_key,
            ExtraArgs={"ContentType": content_type},
        )
        return object_key, size_bytes

    def get_recording(self, object_key: str) -> bytes:
        response = self.client.get_object(Bucket=self.bucket, Key=object_key)
        return response["Body"].read()


def get_object_storage() -> ObjectStorage:
    return ObjectStorage()


def recording_file_extension(content_type: str) -> str:
    normalized = content_type.split(";")[0].strip().lower()
    if normalized in {"audio/wav", "audio/wave", "audio/x-wav"}:
        return "wav"
    if normalized == "audio/mp4":
        return "mp4"
    if normalized == "audio/webm":
        return "webm"
    return "bin"
