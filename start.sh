#!/usr/bin/env bash
set -e

PORT="${PORT:-8000}"
echo "Starting EcoWatch on port $PORT..."
exec uvicorn app.main:app --host 0.0.0.0 --port "$PORT" --app-dir backend
