#!/bin/sh
# Serve the game locally: http://localhost:8080
cd "$(dirname "$0")/.." && python3 -m http.server 8080
