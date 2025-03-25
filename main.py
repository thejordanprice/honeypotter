import uvicorn
import threading
import logging
import os
import time
from logging.handlers import RotatingFileHandler
from datetime import datetime
from honeypot.core.ssh_server import SSHHoneypot
from honeypot.core.telnet_server import TelnetHoneypot
from honeypot.core.ftp_server import FTPHoneypot
from honeypot.core.smtp_server import SMTPHoneypot
from honeypot.core.rdp_server import RDPHoneypot
from honeypot.core.sip_server import SIPHoneypot
from honeypot.core.mysql_server import MySQLHoneypot
from honeypot.database.models import init_db, start_connection_monitor, get_db, get_connection_stats, SessionLocal
from honeypot.web.app import app
from honeypot.core.config import (
    HOST, SSH_PORT, TELNET_PORT, FTP_PORT, SMTP_PORT, RDP_PORT, SIP_PORT, MYSQL_PORT, WEB_PORT, 
    LOG_LEVEL, LOG_FILE
)

# Set up logging
logger = logging.getLogger(__name__)

class TimestampedRotatingFileHandler(RotatingFileHandler):
    """Custom rotating file handler that adds timestamps to backup filenames."""
    
    def doRollover(self):
        """Override the rollover method to add timestamps to backup filenames."""
        if self.stream:
            self.stream.close()
            self.stream = None
        
        # Get the root filename
        root, ext = os.path.splitext(self.baseFilename)
        
        # Add timestamp to the backup filename
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        backup_filename = f"{root}.{timestamp}{ext}"
        
        # If the backup file already exists, delete it
        if os.path.exists(backup_filename):
            os.remove(backup_filename)
            
        # Rename the current log file to the backup filename
        if os.path.exists(self.baseFilename):
            os.rename(self.baseFilename, backup_filename)
            
        # Create a new empty log file
        open(self.baseFilename, 'w').close()
        
        if self.encoding:
            self.stream = open(self.baseFilename, 'w', encoding=self.encoding)
        else:
            self.stream = open(self.baseFilename, 'w')
            
        # Reset the current file size counter
        self.maxBytes = self.maxBytes

def setup_logging():
    """Configure logging for the application."""
    # Create log directory if it doesn't exist
    log_dir = os.path.dirname(LOG_FILE)
    if log_dir and not os.path.exists(log_dir):
        os.makedirs(log_dir)

    # Configure root logger with a formatter
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, LOG_LEVEL))
    
    # Create formatter for all handlers
    formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(name)s - %(message)s', 
                                 datefmt='%Y-%m-%d %H:%M:%S')
    
    # Set up rotating file handler (5MB per file)
    # 5MB = 5 * 1024 * 1024 = 5242880 bytes
    file_handler = TimestampedRotatingFileHandler(
        LOG_FILE,
        maxBytes=5242880,  # 5MB
        backupCount=10     # Keep 10 backup files max
    )
    file_handler.setFormatter(formatter)
    
    # Console handler
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    
    # Add handlers to root logger
    root_logger.handlers = []  # Clear any existing handlers
    root_logger.addHandler(file_handler)
    root_logger.addHandler(console_handler)
    
    # Reduce verbosity for some common noisy loggers
    logging.getLogger("paramiko").setLevel(logging.WARNING)
    logging.getLogger("uvicorn").setLevel(logging.WARNING)

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

def periodic_db_health_check():
    """Run a periodic database health check to ensure connections are working properly."""
    logger = logging.getLogger(__name__)
    
    while True:
        try:
            # Sleep first to allow the system to start up
            time.sleep(60)  # Check every minute
            
            # Get connection stats
            stats = get_connection_stats()
            logger.info(f"DB health check: {stats['active_connections']} active, "
                       f"{stats['pool_checked_out']} checked out, {stats['pool_checkedin']} checked in")
            
            # Check for potential connection leaks
            if stats['potential_leaks']:
                logger.warning(f"Potential DB connection leaks detected: {len(stats['potential_leaks'])} connections")
                
                if len(stats['potential_leaks']) > 10:
                    logger.error("Critical: Large number of potential DB connection leaks")
                    
                    # Force a session cleanup in extreme cases
                    try:
                        logger.warning("Attempting to force session registry cleanup")
                        SessionLocal.remove()
                        logger.info("Forced session registry cleanup completed")
                    except Exception as e:
                        logger.error(f"Failed to force session cleanup: {str(e)}")
            
            # Verify database is actually responsive
            try:
                db = next(get_db())
                # Execute a simple query to verify the connection works
                db.execute("SELECT 1").scalar()
                db.close()
                logger.debug("Database connection verified healthy")
            except Exception as e:
                logger.error(f"Database health check failed: {str(e)}")
                
                # Attempt recovery for serious database problems
                try:
                    logger.warning("Attempting connection pool reset")
                    # Force a session registry cleanup
                    SessionLocal.remove()
                    # Let the connection pool recycle its connections
                    time.sleep(1)
                    logger.info("Connection pool reset completed")
                except Exception as recovery_err:
                    logger.error(f"Failed to reset connection pool: {str(recovery_err)}")
                
        except Exception as e:
            logger.error(f"Error in DB health check thread: {str(e)}")

def main():
    """Main entry point for the application."""
    try:
        # Set up logging first
        setup_logging()
        logger = logging.getLogger(__name__)
        
        # Initialize the database
        init_db()
        logger.info("Database initialized successfully")
        
        # Start the database connection monitor
        start_connection_monitor()
        logger.info("Database connection monitoring started")
        
        # Start the database health check
        health_check_thread = threading.Thread(target=periodic_db_health_check, daemon=True)
        health_check_thread.name = "DB-Health-Check"
        health_check_thread.start()
        logger.info("Database health check thread started")

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
            log_config=None  # Use our configured logging instead of uvicorn's
        )

    except Exception as e:
        logger.error(f"Application failed to start: {str(e)}")
        raise

if __name__ == "__main__":
    main() 