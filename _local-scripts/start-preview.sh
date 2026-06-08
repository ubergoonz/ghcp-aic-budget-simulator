#!/usr/bin/env bash
# Build and start the Vite preview server exposed to the local network.
# Usage: ./start-preview.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Check if the preview server is already running.
if lsof -i :4173 -t >/dev/null; then
    echo "Preview server is already running on port 4173."
   # ask if like to stop the server or just exit?
    read -p "Do you want to stop the server? (y/n) " answer
    if [[ "$answer" == "y" ]]; then
        echo "Stopping the development server..."
        lsof -i :4173 -t | xargs kill -9
        echo "Development server stopped."
    else
        echo "Exiting without stopping the server."
        exit 0
    fi
fi

echo "Building the project..."
cd "${PROJECT_ROOT}"
npm run build

echo "Starting preview server on 0.0.0.0:4173..."
npm run preview -- --host 0.0.0.0 --port 4173
