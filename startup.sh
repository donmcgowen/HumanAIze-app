#!/bin/bash
# Azure App Service startup script
# Installs poppler-utils (provides pdftoppm for PDF-to-image conversion)
# then starts the Node.js app

set -e

echo "[startup] Installing poppler-utils..."
apt-get update -qq && apt-get install -y -qq poppler-utils 2>/dev/null || {
  echo "[startup] apt-get failed, trying without update..."
  apt-get install -y -qq poppler-utils 2>/dev/null || echo "[startup] poppler-utils install failed, PDF vision will use fallback"
}

# Verify pdftoppm is available
if command -v pdftoppm &> /dev/null; then
  echo "[startup] pdftoppm available: $(pdftoppm -v 2>&1 | head -1)"
else
  echo "[startup] WARNING: pdftoppm not available"
fi

echo "[startup] Starting Node.js app..."
exec node dist/index.js
