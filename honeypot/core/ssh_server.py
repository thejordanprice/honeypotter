"""SSH Honeypot server implementation."""
import paramiko
import socket
import threading
import logging
import asyncio
from datetime import datetime
from sqlalchemy.orm import Session
from typing import Optional
from honeypot.database.models import LoginAttempt, get_db
from honeypot.web.app import broadcast_attempt
from honeypot.core.config import HOST, SSH_PORT, LOG_LEVEL
from honeypot.core.geolocation import geolocation_service

# Configure logging
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class HoneypotServer(paramiko.ServerInterface):
    """SSH Honeypot server interface implementation."""
    
    def __init__(self, client_ip: str):
        self.client_ip = client_ip
        self.username: Optional[str] = None
        self.password: Optional[str] = None
        super().__init__()

    def check_auth_password(self, username: str, password: str) -> int:
        """Log the authentication attempt and always return success."""
        self.username = username
        self.password = password
        
        logger.info(f"Login attempt from {self.client_ip}: Username: {username}, Password: {password}")
        
        # Get geolocation data
        location = geolocation_service.get_location(self.client_ip)
        
        # Log to database
        try:
            db = next(get_db())
            attempt = LoginAttempt(
                username=username,
                password=password,
                client_ip=self.client_ip,
                latitude=location['latitude'] if location else None,
                longitude=location['longitude'] if location else None,
                country=location['country'] if location else None,
                city=location['city'] if location else None,
                region=location['region'] if location else None
            )
            db.add(attempt)
            db.commit()
            
            # Broadcast to WebSocket clients
            attempt_dict = attempt.to_dict()
            threading.Thread(target=lambda: asyncio.run(broadcast_attempt(attempt_dict))).start()
            
        except Exception as e:
            logger.error(f"Failed to log login attempt: {str(e)}")
        
        return paramiko.AUTH_SUCCESSFUL

    def get_allowed_auths(self, username: str) -> str:
        """Return allowed authentication methods."""
        return 'password'

class SSHHoneypot:
    """Main SSH Honeypot server class."""
    
    def __init__(self, host: str = HOST, port: int = SSH_PORT):
        self.host = host
        self.port = port
        self.server_socket = None
        self.host_key = paramiko.RSAKey.generate(2048)
        logger.info(f"Generated RSA host key: {self.host_key.get_fingerprint().hex()}")

    def start(self):
        """Start the SSH Honeypot server."""
        try:
            self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.server_socket.bind((self.host, self.port))
            self.server_socket.listen(100)
            
            logger.info(f"SSH Honeypot listening on {self.host}:{self.port}")
            
            while True:
                client_socket, client_address = self.server_socket.accept()
                threading.Thread(
                    target=self._handle_client,
                    args=(client_socket, client_address[0])
                ).start()
                
        except Exception as e:
            logger.error(f"Failed to start SSH Honeypot: {str(e)}")
            if self.server_socket:
                self.server_socket.close()
            raise

    def _handle_client(self, client_socket: socket.socket, client_ip: str):
        """Handle an individual client connection."""
        transport = None
        try:
            transport = paramiko.Transport(client_socket)
            transport.add_server_key(self.host_key)
            
            server = HoneypotServer(client_ip)
            transport.start_server(server=server)
            
            channel = transport.accept(20)
            if channel is not None:
                channel.close()
                
        except paramiko.SSHException as e:
            logger.warning(f"SSH exception from {client_ip}: {str(e)}")
        except Exception as e:
            logger.error(f"Error handling client {client_ip}: {str(e)}")
        finally:
            if transport:
                transport.close()
            client_socket.close() 