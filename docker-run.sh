#!/bin/bash

# Exit on error
set -e

# Create logs directory if it doesn't exist
mkdir -p logs

echo "Starting SSH Honeypot container..."

# Check if container already exists
if docker ps -a --format '{{.Names}}' | grep -q "^ssh-honeypot$"; then
    echo "Container already exists. Removing old container..."
    docker rm -f ssh-honeypot
fi

# Run the container
docker run -d \
    --name ssh-honeypot \
    -p 22:22 \
    -p 23:23 \
    -p 21:21 \
    -p 25:25 \
    -p 3389:3389 \
    -p 5060:5060 \
    -p 3306:3306 \
    -p 8080:8080 \
    -v "$(pwd)/logs:/app/logs" \
    -v "$(pwd)/honeypot.db:/app/honeypot.db" \
    ssh-honeypot

echo "Container started successfully!"
echo "To view logs: docker logs -f ssh-honeypot"
echo "To stop container: docker stop ssh-honeypot" 