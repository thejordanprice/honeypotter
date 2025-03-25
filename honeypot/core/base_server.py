"""Base Honeypot server implementation."""
import socket
import threading
import logging
import asyncio
from abc import ABC, abstractmethod
from typing import Optional, Dict
from honeypot.database.models import LoginAttempt, get_db, Protocol
from honeypot.web.app import broadcast_attempt
from honeypot.core.geolocation import geolocation_service
from honeypot.core.thread_manager import ThreadManager
from honeypot.core.config import (
    MAX_THREADS, MAX_CONNECTIONS_PER_IP, CONNECTION_TIMEOUT, MAX_QUEUED_CONNECTIONS
)

logger = logging.getLogger(__name__)

class BaseHoneypot(ABC):
    """Abstract base class for honeypot servers."""
    
    # Create a shared thread manager for all honeypot instances
    thread_manager = ThreadManager(
        max_workers=MAX_THREADS,
        max_connections_per_ip=MAX_CONNECTIONS_PER_IP,
        connection_timeout=CONNECTION_TIMEOUT,
        max_queued_connections=MAX_QUEUED_CONNECTIONS
    )
    
    def __init__(self, host: str, port: int, protocol: Protocol):
        """Initialize the honeypot server.
        
        Args:
            host: The host address to bind to
            port: The port to listen on
            protocol: The protocol this honeypot implements
        """
        self.host = host
        self.port = port
        self.protocol = protocol
        self.server_socket = None
        logger.debug(f"Initialized {self.__class__.__name__} on {host}:{port}")

    def start(self):
        """Start the honeypot server."""
        try:
            self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.server_socket.bind((self.host, self.port))
            self.server_socket.listen(100)
            
            logger.info(f"{self.protocol.value.upper()} Honeypot listening on {self.host}:{self.port}")
            
            while True:
                try:
                    # Set a timeout on accept to periodically check for shutdown
                    self.server_socket.settimeout(1.0)
                    client_socket, client_address = self.server_socket.accept()
                    client_socket.settimeout(CONNECTION_TIMEOUT)  # Set timeout on client socket
                    
                    # Prefetch geolocation data for the client as soon as they connect
                    # This triggers an async lookup that will be ready when we need it
                    geolocation_service.prefetch_location(client_address[0])
                    
                    # Submit the connection to the thread manager instead of creating a new thread
                    if not self.thread_manager.submit_connection(
                        self._handle_client, client_address[0], client_socket, client_address[0]
                    ):
                        # If connection was rejected (e.g., too many connections from this IP)
                        try:
                            client_socket.close()
                        except Exception:
                            pass
                            
                except socket.timeout:
                    # This is expected due to the timeout we set
                    continue
                except Exception as e:
                    logger.error(f"Error accepting connection: {str(e)}")
                
        except Exception as e:
            logger.error(f"Failed to start {self.protocol.value.upper()} Honeypot: {str(e)}")
            if self.server_socket:
                self.server_socket.close()
            raise

    @abstractmethod
    def _handle_client(self, client_socket: socket.socket, client_ip: str):
        """Handle an individual client connection.
        
        This method must be implemented by subclasses to handle the specific
        protocol implementation.
        
        Args:
            client_socket: The client's socket connection
            client_ip: The client's IP address
        """
        pass

    def _log_attempt(self, username: str, password: str, client_ip: str):
        """Log a login attempt to the database and broadcast to WebSocket clients.
        
        Args:
            username: The attempted username
            password: The attempted password
            client_ip: The client's IP address
        """
        # Update activity timestamp to prevent timeout
        self.thread_manager.update_activity(client_ip)
        
        logger.info(f"{self.protocol.value.upper()} login attempt from {client_ip}: "
                   f"Username: {username}, Password: {password}")
        
        # Get geolocation data - should be cached by now due to prefetching
        location = geolocation_service.get_location(client_ip)
        
        db = None
        try:
            # Get a database session
            db_generator = get_db()
            db = next(db_generator)
            
            attempt = LoginAttempt(
                protocol=self.protocol,
                username=username,
                password=password,
                client_ip=client_ip,
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
            # Rollback transaction in case of error
            if db:
                try:
                    db.rollback()
                except Exception as rollback_err:
                    logger.error(f"Failed to rollback transaction: {str(rollback_err)}")
        finally:
            # Always ensure the session is closed and removed from registry
            if db:
                try:
                    db.close()
                    # Note: SessionLocal.remove() is called in get_db()'s finally clause
                except Exception as close_err:
                    logger.error(f"Failed to close database session: {str(close_err)}")

    def _read_line(self, sock: socket.socket) -> bytes:
        """Read a line from the socket.
        
        Args:
            sock: The socket to read from
            
        Returns:
            The line read from the socket as bytes
        """
        # Update activity timestamp to prevent timeout
        client_ip = sock.getpeername()[0]
        self.thread_manager.update_activity(client_ip)
        
        buffer = bytearray()
        while True:
            try:
                data = sock.recv(1)
                if not data:
                    break
                    
                # Handle line endings
                if data == b'\r':
                    next_char = sock.recv(1)
                    if next_char == b'\n':
                        return bytes(buffer)
                    else:
                        buffer.extend(data)
                        if next_char:
                            buffer.extend(next_char)
                elif data == b'\n':
                    return bytes(buffer)
                else:
                    buffer.extend(data)
            except socket.timeout:
                # Socket timeout - this could be a legitimate timeout
                logger.debug(f"Socket timeout while reading from {client_ip}")
                break
                
        return bytes(buffer) 