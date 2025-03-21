"""Telnet Honeypot server implementation."""
import socket
import threading
import logging
import asyncio
from datetime import datetime
from sqlalchemy.orm import Session
from typing import Optional
from honeypot.database.models import LoginAttempt, get_db, Protocol
from honeypot.web.app import broadcast_attempt
from honeypot.core.config import HOST, TELNET_PORT, LOG_LEVEL
from honeypot.core.geolocation import geolocation_service

# Configure logging
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Telnet protocol constants
IAC = bytes([255])
DONT = bytes([254])
DO = bytes([253])
WONT = bytes([252])
WILL = bytes([251])
SB = bytes([250])
SE = bytes([240])
ECHO = bytes([1])
SUPPRESS_GO_AHEAD = bytes([3])
LINEMODE = bytes([34])

class TelnetHoneypot:
    """Main Telnet Honeypot server class."""
    
    def __init__(self, host: str = HOST, port: int = TELNET_PORT):
        self.host = host
        self.port = port
        self.server_socket = None

    def start(self):
        """Start the Telnet Honeypot server."""
        try:
            self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.server_socket.bind((self.host, self.port))
            self.server_socket.listen(100)
            
            logger.info(f"Telnet Honeypot listening on {self.host}:{self.port}")
            
            while True:
                client_socket, client_address = self.server_socket.accept()
                threading.Thread(
                    target=self._handle_client,
                    args=(client_socket, client_address[0])
                ).start()
                
        except Exception as e:
            logger.error(f"Failed to start Telnet Honeypot: {str(e)}")
            if self.server_socket:
                self.server_socket.close()
            raise

    def _handle_client(self, client_socket: socket.socket, client_ip: str):
        """Handle an individual client connection."""
        try:
            # Initial telnet negotiation
            client_socket.send(IAC + DO + ECHO)
            client_socket.send(IAC + DO + SUPPRESS_GO_AHEAD)
            client_socket.send(IAC + WILL + ECHO)
            client_socket.send(IAC + WILL + SUPPRESS_GO_AHEAD)
            
            # Send login prompt
            client_socket.send(b'login: ')
            
            # Read username
            username = self._read_line(client_socket).decode('ascii', errors='ignore').strip()
            
            # Send password prompt
            client_socket.send(b'Password: ')
            
            # Read password
            password = self._read_line(client_socket).decode('ascii', errors='ignore').strip()
            
            # Log the attempt
            logger.info(f"Telnet login attempt from {client_ip}: Username: {username}, Password: {password}")
            
            # Get geolocation data
            location = geolocation_service.get_location(client_ip)
            
            # Log to database
            try:
                db = next(get_db())
                attempt = LoginAttempt(
                    protocol=Protocol.TELNET,
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
            
            # Send login failure message
            client_socket.send(b'Login incorrect\r\n')
            
        except Exception as e:
            logger.error(f"Error handling client {client_ip}: {str(e)}")
        finally:
            client_socket.close()

    def _read_line(self, sock: socket.socket) -> bytes:
        """Read a line from the socket, handling telnet protocol negotiations."""
        buffer = bytearray()
        while True:
            data = sock.recv(1)
            if not data:
                break
                
            # Handle telnet protocol negotiations
            if data == IAC:
                cmd = sock.recv(1)
                if cmd == DO or cmd == DONT:
                    opt = sock.recv(1)
                    if cmd == DO:
                        # Respond with WONT for most options
                        sock.send(IAC + WONT + opt)
                    continue
                elif cmd == WILL or cmd == WONT:
                    opt = sock.recv(1)
                    if cmd == WILL:
                        # Respond with DONT for most options
                        sock.send(IAC + DONT + opt)
                    continue
                elif cmd == SB:
                    # Skip subnegotiation
                    while True:
                        subopt = sock.recv(1)
                        if subopt == IAC:
                            if sock.recv(1) == SE:
                                break
                    continue
            
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
                
        return bytes(buffer) 