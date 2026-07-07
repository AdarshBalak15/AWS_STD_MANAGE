#!/usr/bin/env bash
# ==================================================
# DEPLOYMENT CONTROL SCRIPT: run.sh
# AWS Student Management System
# ==================================================

set -e

# Run the Flask app using Gunicorn on port 5000
APP_DIR="/home/ubuntu/student-management"

echo "[RUN] Starting application with Gunicorn on port 5000..."
"$APP_DIR/venv/bin/gunicorn" --bind 0.0.0.0:5000 "backend.app:create_app()"
