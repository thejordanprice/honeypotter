"""Database models for the SSH Honeypot."""
from datetime import datetime
from zoneinfo import ZoneInfo  # Built-in module, no installation needed
from sqlalchemy import Column, Integer, String, DateTime, Float, create_engine, Enum
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, scoped_session
from sqlalchemy.pool import QueuePool
from honeypot.core.config import DATABASE_URL
import enum

Base = declarative_base()

class Protocol(enum.Enum):
    """Enum for supported protocols."""
    SSH = "ssh"
    TELNET = "telnet"
    FTP = "ftp"
    SMTP = "smtp"
    RDP = "rdp"
    SIP = "sip"

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

# Create database engine with thread-safe connection pool
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},  # Allow cross-thread usage
    poolclass=QueuePool,  # Use QueuePool for connection pooling
    pool_size=20,  # Increase from default of 5
    max_overflow=30,  # Increase from default of 10
    pool_timeout=60,  # Increase timeout to 60 seconds
    pool_pre_ping=True  # Enable connection health checks
)

# Create thread-safe session factory
SessionLocal = scoped_session(
    sessionmaker(autocommit=False, autoflush=False, bind=engine)
)

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