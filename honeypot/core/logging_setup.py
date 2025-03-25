"""Logging configuration for the honeypot."""
import logging
import os
from logging.handlers import RotatingFileHandler
from datetime import datetime
from honeypot.core.config import LOG_LEVEL, LOG_FILE

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
    
    logger = logging.getLogger(__name__)
    logger.info("Logging system initialized")
    
    return logger 