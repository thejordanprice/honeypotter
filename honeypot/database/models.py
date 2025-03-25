"""Database models for the SSH Honeypot."""
from datetime import datetime
from zoneinfo import ZoneInfo  # Built-in module, no installation needed
from sqlalchemy import Column, Integer, String, DateTime, Float, create_engine, Enum
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, scoped_session
from sqlalchemy.pool import QueuePool
from honeypot.core.config import DATABASE_URL
import enum
import logging
import threading
import time

logger = logging.getLogger(__name__)

# Global lock for database monitoring
db_monitor_lock = threading.Lock()
# Track active connections for monitoring
active_connections = {}
# Track connection creation time to detect long-lived connections
connection_timestamps = {}

Base = declarative_base()

class Protocol(enum.Enum):
    """Enum for supported protocols."""
    SSH = "ssh"
    TELNET = "telnet"
    FTP = "ftp"
    SMTP = "smtp"
    RDP = "rdp"
    SIP = "sip"
    MYSQL = "mysql"

class LoginAttempt(Base):
    """Model for storing SSH login attempts."""
    __tablename__ = 'login_attempts'

    id = Column(Integer, primary_key=True)
    protocol = Column(Enum(Protocol), nullable=False)
    username = Column(String, nullable=False)
    password = Column(String, nullable=False)
    client_ip = Column(String, nullable=False)
    timestamp = Column(DateTime(timezone=True), 
                      default=lambda: datetime.now(ZoneInfo("UTC")))
    
    # Geolocation fields
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    country = Column(String, nullable=True)
    city = Column(String, nullable=True)
    region = Column(String, nullable=True)

    def to_dict(self):
        """Convert the model instance to a dictionary."""
        return {
            'id': self.id,
            'protocol': self.protocol.value,
            'username': self.username,
            'password': self.password,
            'client_ip': self.client_ip,
            'timestamp': self.timestamp.isoformat(),
            'latitude': self.latitude,
            'longitude': self.longitude,
            'country': self.country,
            'city': self.city,
            'region': self.region
        }

# Listener functions for the connection pool events
def connection_checkout(dbapi_connection, connection_record, connection_proxy):
    """Track when a connection is checked out from the pool."""
    connection_id = id(dbapi_connection)
    with db_monitor_lock:
        active_connections[connection_id] = {
            'timestamp': time.time(),
            'thread_id': threading.get_ident(),
        }
        connection_timestamps[connection_id] = time.time()
    logger.debug(f"Connection checked out: {connection_id}, active connections: {len(active_connections)}")

def connection_checkin(dbapi_connection, connection_record):
    """Track when a connection is returned to the pool."""
    connection_id = id(dbapi_connection)
    with db_monitor_lock:
        if connection_id in active_connections:
            duration = time.time() - active_connections[connection_id]['timestamp']
            del active_connections[connection_id]
            if connection_id in connection_timestamps:
                # Track total lifetime for connection leak detection
                total_lifetime = time.time() - connection_timestamps[connection_id]
                if total_lifetime > 300:  # 5 minutes
                    logger.warning(f"Connection {connection_id} was active for {total_lifetime:.2f} seconds before return to pool")
                del connection_timestamps[connection_id]
            logger.debug(f"Connection checked in: {connection_id}, held for {duration:.2f}s, remaining: {len(active_connections)}")

# Create database engine with thread-safe connection pool and monitoring
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},  # Allow cross-thread usage
    poolclass=QueuePool,  # Use QueuePool for connection pooling
    pool_size=20,  # Increase from default of 5
    max_overflow=30,  # Increase from default of 10
    pool_timeout=60,  # Increase timeout to 60 seconds
    pool_pre_ping=True,  # Enable connection health checks
    pool_recycle=3600,  # Recycle connections after 1 hour
    echo_pool=False  # Set to True for detailed connection pool logging
)

# Create thread-safe session factory
SessionLocal = scoped_session(
    sessionmaker(autocommit=False, autoflush=False, bind=engine)
)

# Register event listeners for connection monitoring
from sqlalchemy import event
event.listen(engine, 'checkout', connection_checkout)
event.listen(engine, 'checkin', connection_checkin)

def init_db():
    """Initialize the database by creating all tables."""
    Base.metadata.create_all(bind=engine)

def get_db():
    """Get a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
        SessionLocal.remove()

def get_connection_stats():
    """Get statistics about the database connection pool."""
    stats = {
        'active_connections': len(active_connections),
        'pool_size': engine.pool.size(),
        'pool_overflow': engine.pool.overflow(),
        'pool_checked_out': engine.pool.checkedout(),
        'pool_checkedin': engine.pool.checkedin(),
    }
    
    # Find connections that may be leaking
    with db_monitor_lock:
        current_time = time.time()
        long_running = [
            {'connection_id': conn_id, 'duration': current_time - info['timestamp'], 'thread_id': info['thread_id']}
            for conn_id, info in active_connections.items()
            if current_time - info['timestamp'] > 60  # Connections held for > 60 seconds
        ]
        stats['potential_leaks'] = long_running
    
    return stats

def db_connection_monitor():
    """Background task to monitor database connections."""
    while True:
        try:
            stats = get_connection_stats()
            logger.info(f"DB Connection stats: active={stats['active_connections']}, "
                        f"checkedout={stats['pool_checked_out']}, "
                        f"checkedin={stats['pool_checkedin']}")
            
            # Log warnings for potential leaks
            if stats['potential_leaks']:
                logger.warning(f"Potential DB connection leaks detected: {len(stats['potential_leaks'])} connections held for >60s")
                for leak in stats['potential_leaks']:
                    logger.warning(f"Leak: conn_id={leak['connection_id']}, duration={leak['duration']:.2f}s, thread={leak['thread_id']}")
        
        except Exception as e:
            logger.error(f"Error in DB connection monitor: {str(e)}")
        
        # Check every 30 seconds
        time.sleep(30)

# Start the connection monitor in a background thread
def start_connection_monitor():
    """Start the database connection monitoring thread."""
    monitor_thread = threading.Thread(target=db_connection_monitor, daemon=True)
    monitor_thread.name = "DB-Connection-Monitor"
    monitor_thread.start()
    logger.info("Database connection monitoring started") 