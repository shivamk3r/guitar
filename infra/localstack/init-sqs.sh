#!/usr/bin/env bash
set -euo pipefail

awslocal sqs create-queue --queue-name guitar-analysis >/dev/null
