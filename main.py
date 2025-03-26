import uvicorn
import threading
import logging
import os
import time
import signal
import sys
import re
import unicodedata
from logging.handlers import RotatingFileHandler
from datetime import datetime
from honeypot.core.server_registry import registry
# Import all server types to ensure they get registered
from honeypot.core.ssh_server import SSHHoneypot
from honeypot.core.telnet_server import TelnetHoneypot
from honeypot.core.ftp_server import FTPHoneypot
from honeypot.core.smtp_server import SMTPHoneypot
from honeypot.core.rdp_server import RDPHoneypot
from honeypot.core.sip_server import SIPHoneypot
from honeypot.core.mysql_server import MySQLHoneypot
from honeypot.database.models import init_db, start_connection_monitor, get_db, get_connection_stats, SessionLocal
from honeypot.web.app import app
from honeypot.core.base_server import BaseHoneypot
from honeypot.core.config import (
    HOST, SSH_PORT, TELNET_PORT, FTP_PORT, SMTP_PORT, RDP_PORT, SIP_PORT, MYSQL_PORT, WEB_PORT, 
    LOG_LEVEL, LOG_FILE, MAX_THREADS, MAX_CONNECTIONS_PER_IP, CONNECTION_TIMEOUT
)

# Set up logging
logger = logging.getLogger(__name__)

class SafeLogFormatter(logging.Formatter):
    """Custom formatter that sanitizes log messages to prevent control character attacks."""
    
    def __init__(self, fmt=None, datefmt=None, style='%', validate=True):
        super().__init__(fmt, datefmt, style, validate)
    
    def format(self, record):
        # Sanitize the message before formatting
        if record.msg and isinstance(record.msg, str):
            # Sanitize the message part first
            record.msg = self._sanitize_text(record.msg)
        
        # Sanitize args if they're strings
        if record.args:
            args = list(record.args)
            for i, arg in enumerate(args):
                if isinstance(arg, str):
                    args[i] = self._sanitize_text(arg)
            record.args = tuple(args)
        
        # Format with parent formatter
        formatted = super().format(record)
        
        # Double-check the formatted string is also sanitized
        return self._sanitize_text(formatted)
    
    def _sanitize_text(self, text):
        """Sanitize a string to remove control and non-printable characters."""
        if not isinstance(text, str):
            return text
            
        # Only replace control characters (0-31) and DEL (127)
        # This preserves normal punctuation, spaces, etc.
        sanitized = re.sub(r'[\x00-\x1F\x7F]', '.', text)
        
        # Replace only specific problematic Unicode categories
        # C = Control, Cf = Format, Cc = Control, Cn = Not assigned
        # This preserves normal characters including punctuation
        result = ''
        for c in sanitized:
            cat = unicodedata.category(c)
            if cat.startswith('C') and cat not in ('Cs', 'Co'):  # Exclude surrogate and private use
                result += '.'
            else:
                result += c
        
        return result

class SafeLogFilter(logging.Filter):
    """Filter that can block potentially malicious log entries."""
    
    def filter(self, record):
        # Check if this is a string message
        if not hasattr(record, 'msg') or not isinstance(record.msg, str):
            return True
            
        # Filter out extremely long messages that might be attacks
        if len(record.msg) > 4000:  # Allow longer legitimate messages
            return False
            
        # Check for high concentrations of control characters
        if isinstance(record.msg, str):
            # Count control characters
            control_chars = sum(1 for c in record.msg if ord(c) < 32 or ord(c) == 127)
            if len(record.msg) > 0 and control_chars / len(record.msg) > 0.3:  # 30% threshold
                return False
        
        return True

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
    
    # Create safe log filter
    safe_filter = SafeLogFilter()
    
    # Create formatter for all handlers
    formatter = SafeLogFormatter('%(asctime)s - %(levelname)s - %(name)s - %(message)s', 
                               datefmt='%Y-%m-%d %H:%M:%S')
    
    # Set up rotating file handler (5MB per file)
    # 5MB = 5 * 1024 * 1024 = 5242880 bytes
    file_handler = TimestampedRotatingFileHandler(
        LOG_FILE,
        maxBytes=5242880,  # 5MB
        backupCount=10     # Keep 10 backup files max
    )
    file_handler.setFormatter(formatter)
    file_handler.addFilter(safe_filter)
    
    # Console handler
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    console_handler.addFilter(safe_filter)
    
    # Add handlers to root logger
    root_logger.handlers = []  # Clear any existing handlers
    root_logger.addHandler(file_handler)
    root_logger.addHandler(console_handler)
    
    # Reduce verbosity for some common noisy loggers
    logging.getLogger("paramiko").setLevel(logging.WARNING)
    logging.getLogger("uvicorn").setLevel(logging.WARNING)

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

def periodic_thread_stats():
    """Periodically log thread and connection statistics."""
    logger = logging.getLogger(__name__)
    
    while True:
        try:
            # Sleep first to allow the system to start up
            time.sleep(30)  # Check every 30 seconds
            
            # Log thread pool stats
            thread_manager = BaseHoneypot.thread_manager
            active_connections = sum(thread_manager.connections.values())
            
            # Count active threads
            active_threads = len(threading.enumerate())
            
            logger.info(f"Thread stats: {active_connections} active connections, "
                       f"{len(thread_manager.connections)} unique IPs, "
                       f"{active_threads} total threads")
            
            # Add more detailed stats at debug level
            if LOG_LEVEL == 'DEBUG':
                # Log the busiest IPs
                if thread_manager.connections:
                    busiest_ips = sorted(
                        thread_manager.connections.items(), 
                        key=lambda x: x[1], 
                        reverse=True
                    )[:10]  # Top 10 IPs
                    
                    logger.debug("Busiest IPs:")
                    for ip, count in busiest_ips:
                        logger.debug(f"  {ip}: {count} connections")
                
                # Log thread names for debugging
                logger.debug("Active threads:")
                for thread in threading.enumerate():
                    logger.debug(f"  {thread.name}")
                
        except Exception as e:
            logger.error(f"Error in thread stats monitor: {str(e)}")

def signal_handler(sig, frame):
    """Handle termination signals gracefully."""
    logger.info("Received shutdown signal, shutting down...")
    
    # Shutdown the thread manager
    try:
        BaseHoneypot.thread_manager.shutdown()
        logger.info("Thread manager shutdown complete")
    except Exception as e:
        logger.error(f"Error shutting down thread manager: {str(e)}")
    
    # Additional cleanup if needed
    
    # Exit
    sys.exit(0)

def main():
    """Main entry point for the application."""
    try:
        # Set up logging first
        setup_logging()
        logger = logging.getLogger(__name__)
        
        # Register signal handlers for graceful shutdown
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
        
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
        
        # Start the thread statistics monitor
        thread_stats_thread = threading.Thread(target=periodic_thread_stats, daemon=True)
        thread_stats_thread.name = "Thread-Stats-Monitor"
        thread_stats_thread.start()
        logger.info("Thread statistics monitor started")

        # Log thread management configuration
        logger.info(f"Thread management: max_threads={MAX_THREADS}, "
                   f"max_connections_per_ip={MAX_CONNECTIONS_PER_IP}, "
                   f"connection_timeout={CONNECTION_TIMEOUT}s")

        # Start all registered honeypot servers
        registry.start_servers()
        
        # Display all active ports for debugging
        server_types = registry.get_server_types()
        logger.info(f"Started {len(server_types)} honeypot servers")

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