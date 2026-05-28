FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY apps/backend/pyproject.toml ./
COPY apps/backend/app app
COPY apps/backend/tests tests

RUN pip install --no-cache-dir -e ".[dev]"

EXPOSE 7654

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7654"]
