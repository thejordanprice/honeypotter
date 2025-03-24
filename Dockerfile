# Use Debian as base image
FROM debian:bullseye-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Create and set working directory
WORKDIR /app

# Copy requirements first to leverage Docker cache
COPY requirements.txt .

# Install Python dependencies
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy the rest of the application
COPY . .

# Create necessary directories
RUN mkdir -p /app/logs

# Expose all the ports used by the honeypot
EXPOSE 22 23 21 25 3389 5060 3306 8080

# Set environment variables from .env.example
ENV HOST=0.0.0.0 \
    SSH_PORT=22 \
    TELNET_PORT=23 \
    FTP_PORT=21 \
    SMTP_PORT=25 \
    RDP_PORT=3389 \
    SIP_PORT=5060 \
    MYSQL_PORT=3306 \
    WEB_PORT=8080 \
    DATABASE_URL=sqlite:///honeypot.db \
    LOG_LEVEL=INFO \
    LOG_FILE=/app/logs/honeypot.log

# Run the application
CMD ["python3", "main.py"] 