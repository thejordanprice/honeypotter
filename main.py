import uvicorn
import logging
import signal
import sys

# Import components for honeypot setup
from honeypot.core.server_registry import registry
from honeypot.web.app import app
from honeypot.core.base_server import BaseHoneypot

# Import server implementations
# All server types need to be imported to ensure they get registered
from honeypot.core.ssh_server import SSHHoneypot
from honeypot.core.telnet_server import TelnetHoneypot
from honeypot.core.ftp_server import FTPHoneypot
from honeypot.core.smtp_server import SMTPHoneypot
from honeypot.core.rdp_server import RDPHoneypot
from honeypot.core.sip_server import SIPHoneypot
from honeypot.core.mysql_server import MySQLHoneypot

# Import database components
from honeypot.database.models import init_db, start_connection_monitor

# Import system utilities
from honeypot.core.system_monitor import start_monitoring_threads
from honeypot.core.logging_setup import setup_logging

# Import configuration settings
from honeypot.core.config import (
    HOST, SSH_PORT, TELNET_PORT, FTP_PORT, SMTP_PORT, 
    RDP_PORT, SIP_PORT, MYSQL_PORT, WEB_PORT, 
    LOG_LEVEL, MAX_THREADS, 
    MAX_CONNECTIONS_PER_IP, CONNECTION_TIMEOUT
)

def signal_handler(sig, frame):
    """Handle termination signals gracefully."""
    logger.info("Received shutdown signal, shutting down...")
    
    # Shutdown the thread manager
    try:
        BaseHoneypot.thread_manager.shutdown()
        logger.info("Thread manager shutdown complete")
    except Exception as e:
        logger.error(f"Error shutting down thread manager: {str(e)}")
    
    # Exit
    sys.exit(0)

def main():
    """Main entry point for the application."""
    try:
        # === Setup Phase ===
        # Set up logging first
        global logger
        logger = setup_logging()
        
        # Register signal handlers for graceful shutdown
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
        
        # === Initialization Phase ===
        # Initialize the database
        init_db()
        logger.info("Database initialized successfully")
        
        # Start the database connection monitor
        start_connection_monitor()
        logger.info("Database connection monitoring started")
        
        # Start all monitoring threads
        start_monitoring_threads()
        
        # Log thread management configuration
        logger.info(f"Thread management: max_threads={MAX_THREADS}, "
                   f"max_connections_per_ip={MAX_CONNECTIONS_PER_IP}, "
                   f"connection_timeout={CONNECTION_TIMEOUT}s")

        # === Service Startup Phase ===
        # Start all registered honeypot servers
        registry.start_servers()
        
        # Display all active ports for debugging
        server_types = registry.get_server_types()
        logger.info(f"Started {len(server_types)} honeypot servers")

        # Start the web application (this is a blocking call)
        logger.info(f"Starting web interface on port {WEB_PORT}")
        uvicorn.run(
            app,
            host=HOST,
            port=WEB_PORT,
            log_level=LOG_LEVEL.lower(),
            access_log=False,  # Disable access logs to prevent duplication
            log_config=None  # Use our configured logging instead of uvicorn's
        )

    except Exception as e:
        logger.error(f"Application failed to start: {str(e)}")
        raise

if __name__ == "__main__":
    main() 