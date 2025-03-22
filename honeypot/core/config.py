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
WEB_PORT = int(os.getenv('WEB_PORT', 8080))

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