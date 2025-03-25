import uvicorn
import threading
import logging
import os
from honeypot.core.ssh_server import SSHHoneypot
from honeypot.core.telnet_server import TelnetHoneypot
from honeypot.core.ftp_server import FTPHoneypot
from honeypot.core.smtp_server import SMTPHoneypot
from honeypot.core.rdp_server import RDPHoneypot
from honeypot.core.sip_server import SIPHoneypot
from honeypot.core.mysql_server import MySQLHoneypot
from honeypot.database.models import init_db
from honeypot.web.app import app
from honeypot.core.config import (
    HOST, SSH_PORT, TELNET_PORT, FTP_PORT, SMTP_PORT, RDP_PORT, SIP_PORT, MYSQL_PORT, WEB_PORT, 
    LOG_LEVEL, LOG_FILE
)

# Set up logging
logger = logging.getLogger(__name__)

def setup_logging():
    """Configure logging for the application."""
    # Create log directory if it doesn't exist
    log_dir = os.path.dirname(LOG_FILE)
    if log_dir and not os.path.exists(log_dir):
        os.makedirs(log_dir)

    # Configure logging
    logging.basicConfig(
        level=getattr(logging, LOG_LEVEL),
        format='%(levelname)s: %(message)s',
        handlers=[
            logging.FileHandler(LOG_FILE),
            logging.StreamHandler()  # Also log to console
        ]
    )

def start_ssh_server():
    """Start the SSH honeypot server."""
    try:
        honeypot = SSHHoneypot()
        honeypot.start()
    except Exception as e:
        logger.error(f"SSH server failed: {str(e)}")

def start_telnet_server():
    """Start the Telnet honeypot server."""
    try:
        honeypot = TelnetHoneypot()
        honeypot.start()
    except Exception as e:
        logger.error(f"Telnet server failed: {str(e)}")

def start_ftp_server():
    """Start the FTP honeypot server."""
    try:
        honeypot = FTPHoneypot()
        honeypot.start()
    except Exception as e:
        logger.error(f"FTP server failed: {str(e)}")

def start_smtp_server():
    """Start the SMTP honeypot server."""
    try:
        honeypot = SMTPHoneypot()
        honeypot.start()
    except Exception as e:
        logger.error(f"SMTP server failed: {str(e)}")

def start_rdp_server():
    """Start the RDP honeypot server."""
    logger = logging.getLogger(__name__)
    try:
        honeypot = RDPHoneypot()
        honeypot.start()
    except Exception as e:
        logger.error(f"RDP server failed: {str(e)}")

def start_sip_server():
    """Start the SIP honeypot server."""
    try:
        honeypot = SIPHoneypot()
        honeypot.start()
    except Exception as e:
        logger.error(f"SIP server failed: {str(e)}")

def start_mysql_server():
    """Start the MySQL honeypot server."""
    try:
        honeypot = MySQLHoneypot()
        honeypot.start()
    except Exception as e:
        logger.error(f"MySQL server failed: {str(e)}")

def main():
    """Main entry point for the application."""
    try:
        # Set up logging first
        setup_logging()
        logger = logging.getLogger(__name__)
        
        # Initialize the database
        init_db()
        logger.info("Database initialized successfully")

        # Start SSH server in a separate thread
        ssh_thread = threading.Thread(target=start_ssh_server)
        ssh_thread.daemon = True
        ssh_thread.start()
        logger.info(f"SSH Honeypot thread started on port {SSH_PORT}")

        # Start Telnet server in a separate thread
        telnet_thread = threading.Thread(target=start_telnet_server)
        telnet_thread.daemon = True
        telnet_thread.start()
        logger.info(f"Telnet Honeypot thread started on port {TELNET_PORT}")

        # Start FTP server in a separate thread
        ftp_thread = threading.Thread(target=start_ftp_server)
        ftp_thread.daemon = True
        ftp_thread.start()
        logger.info(f"FTP Honeypot thread started on port {FTP_PORT}")

        # Start SMTP server in a separate thread
        smtp_thread = threading.Thread(target=start_smtp_server)
        smtp_thread.daemon = True
        smtp_thread.start()
        logger.info(f"SMTP Honeypot thread started on port {SMTP_PORT}")

        # Start RDP server in a separate thread
        rdp_thread = threading.Thread(target=start_rdp_server)
        rdp_thread.daemon = True
        rdp_thread.start()
        logger.info(f"RDP Honeypot thread started on port {RDP_PORT}")

        # Start SIP server in a separate thread
        sip_thread = threading.Thread(target=start_sip_server)
        sip_thread.daemon = True
        sip_thread.start()
        logger.info(f"SIP Honeypot thread started on port {SIP_PORT}")

        # Start MySQL server in a separate thread
        mysql_thread = threading.Thread(target=start_mysql_server)
        mysql_thread.daemon = True
        mysql_thread.start()
        logger.info(f"MySQL Honeypot thread started on port {MYSQL_PORT}")

        # Start the web application
        logger.info(f"Starting web interface on port {WEB_PORT}")
        uvicorn.run(
            app,
            host=HOST,
            port=WEB_PORT,
            log_level=LOG_LEVEL.lower(),
            access_log=False,  # Disable access logs to prevent duplication
            log_config={
                "version": 1,
                "disable_existing_loggers": True,  # Disable existing loggers to prevent duplication
                "formatters": {
                    "default": {
                        "format": "%(levelname)s: %(message)s",
                        "datefmt": "%Y-%m-%d %H:%M:%S"
                    }
                },
                "handlers": {
                    "default": {
                        "formatter": "default",
                        "class": "logging.StreamHandler",
                        "stream": "ext://sys.stderr"
                    }
                },
                "loggers": {
                    "uvicorn": {"handlers": ["default"], "level": LOG_LEVEL, "propagate": False},
                    "uvicorn.access": {"handlers": ["default"], "level": LOG_LEVEL, "propagate": False},
                    "uvicorn.asgi": {"handlers": ["default"], "level": LOG_LEVEL, "propagate": False}
                }
            }
        )

    except Exception as e:
        logger.error(f"Application failed to start: {str(e)}")
        raise

if __name__ == "__main__":
    main() 