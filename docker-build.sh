#!/bin/bash

# Exit on error
set -e

echo "Building SSH Honeypot Docker image..."

# Build the Docker image
docker build -t ssh-honeypot .

echo "Build completed successfully!"
echo "To run the container, use: ./docker-run.sh" 