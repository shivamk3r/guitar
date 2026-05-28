from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://guitar:guitar@postgres:5432/guitar"
    cors_allowed_origins: str = "http://localhost:7653"

    aws_region: str = "us-east-1"
    aws_access_key_id: str = "test"
    aws_secret_access_key: str = "test"
    aws_endpoint_url: str = "http://localstack:4566"
    sqs_queue_url: str = "http://localstack:4566/000000000000/guitar-analysis"

    object_storage_endpoint_url: str = "http://minio:9000"
    object_storage_access_key: str = "minioadmin"
    object_storage_secret_key: str = "minioadmin"
    object_storage_bucket: str = "guitar-recordings"

    worker_poll_seconds: int = Field(default=5, ge=1)

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_allowed_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
