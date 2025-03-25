"""Configuration management for the SSH Honeypot."""
import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Base directory
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# Server settings
HOST = os.getenv('HOST', '0.0.0.0')
SSH_PORT = int(os.getenv('SSH_PORT', 22))
TELNET_PORT = int(os.getenv('TELNET_PORT', 23))
FTP_PORT = int(os.getenv('FTP_PORT', 21))
SMTP_PORT = int(os.getenv('SMTP_PORT', 25))
RDP_PORT = int(os.getenv('RDP_PORT', 3389))  # Default RDP port
SIP_PORT = int(os.getenv('SIP_PORT', 5060))  # Default SIP port
MYSQL_PORT = int(os.getenv('MYSQL_PORT', 3306))  # Default MySQL port
WEB_PORT = int(os.getenv('WEB_PORT', 8080))

# Thread management settings
MAX_THREADS = int(os.getenv('MAX_THREADS', 50))  # Maximum worker threads
MAX_CONNECTIONS_PER_IP = int(os.getenv('MAX_CONNECTIONS_PER_IP', 5))  # Max connections from a single IP
CONNECTION_TIMEOUT = int(os.getenv('CONNECTION_TIMEOUT', 15))  # Timeout in seconds for inactive connections
MAX_QUEUED_CONNECTIONS = int(os.getenv('MAX_QUEUED_CONNECTIONS', 100))  # Max queued connections

# Database settings
DATABASE_URL = os.getenv('DATABASE_URL', f'sqlite:///{BASE_DIR}/honeypot.db')

# Logging settings
LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')
LOG_FILE = os.getenv('LOG_FILE', str(BASE_DIR / 'honeypot.log'))

# Web interface settings
TEMPLATE_DIR = BASE_DIR / 'honeypot' / 'templates'
STATIC_DIR = BASE_DIR / 'honeypot' / 'static'

# Ensure directories exist
TEMPLATE_DIR.mkdir(parents=True, exist_ok=True)
STATIC_DIR.mkdir(parents=True, exist_ok=True) 