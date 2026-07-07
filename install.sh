#!/usr/bin/env bash
# ==================================================
# AUTOMATIC DEPLOYMENT INSTALLER: install.sh
# AWS Student Management System (EC2 Ubuntu)
# ==================================================

# Exit immediately if a command exits with a non-zero status
set -e

echo "[START] Updating system libraries..."
sudo apt-get update -y

echo "[INSTALL] Installing core dependencies (Python3, Nginx)..."
sudo apt-get install -y python3 python3-pip python3-venv nginx git

# Define app path
APP_DIR="/home/ubuntu/student-management"

if [ ! -d "$APP_DIR" ]; then
    echo "[ERROR] Directory $APP_DIR does not exist. Please place files in this folder."
    exit 1
fi

echo "[VENV] Creating Python virtual environment..."
python3 -m venv "$APP_DIR/venv"

echo "[DEPENDENCIES] Installing python libraries..."
"$APP_DIR/venv/bin/pip" install --upgrade pip
"$APP_DIR/venv/bin/pip" install -r "$APP_DIR/backend/requirements.txt"

echo "[CONFIG] Setup uploads folder..."
mkdir -p "$APP_DIR/uploads"
sudo chown -R ubuntu:www-data "$APP_DIR/uploads"
chmod -R 775 "$APP_DIR/uploads"

echo "[SUCCESS] Installation complete! Run 'run.sh' to start the application."
