"""Database models for the SSH Honeypot."""
from datetime import datetime
from zoneinfo import ZoneInfo  # Built-in module, no installation needed
from sqlalchemy import Column, Integer, String, DateTime, Float, create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from honeypot.core.config import DATABASE_URL

Base = declarative_base()

class LoginAttempt(Base):
    """Model for storing SSH login attempts."""
    __tablename__ = 'login_attempts'

    id = Column(Integer, primary_key=True)
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

# Create database engine and session factory
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

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