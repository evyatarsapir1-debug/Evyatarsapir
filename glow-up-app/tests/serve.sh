#!/bin/sh
# Serve GLOW UP locally: http://localhost:8090
cd "$(dirname "$0")/.." && python3 -m http.server 8090
