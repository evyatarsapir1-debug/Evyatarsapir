#!/bin/sh
# Serve the game locally: http://localhost:8090
cd "$(dirname "$0")/.." && python3 -m http.server "${PORT:-8090}"
