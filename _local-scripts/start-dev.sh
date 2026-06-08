#!/usr/bin/env bash
# Start the development server for the project.
# Usage: ./start-dev.sh
# Check if the development server is already running
if lsof -i :4173 -t >/dev/null ; then
    echo "Development server is already running on port 4173."
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
# Start the development server and expose it to the local network
echo "Starting the development server with hot reload..."
npm run dev -- --host 0.0.0.0 --port 4173