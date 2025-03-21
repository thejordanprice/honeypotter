"""FTP Honeypot server implementation."""
import socket
import threading
import logging
import asyncio
from datetime import datetime
from sqlalchemy.orm import Session
from typing import Optional, Tuple
from honeypot.database.models import LoginAttempt, get_db, Protocol
from honeypot.web.app import broadcast_attempt
from honeypot.core.config import HOST, FTP_PORT, LOG_LEVEL
from honeypot.core.geolocation import geolocation_service

# Configure logging
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class FTPHoneypot:
    """Main FTP Honeypot server class."""
    
    def __init__(self, host: str = HOST, port: int = FTP_PORT):
        self.host = host
        self.port = port
        self.server_socket = None

    def start(self):
        """Start the FTP Honeypot server."""
        try:
            self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.server_socket.bind((self.host, self.port))
            self.server_socket.listen(100)
            
            logger.info(f"FTP Honeypot listening on {self.host}:{self.port}")
            
            while True:
                client_socket, client_address = self.server_socket.accept()
                threading.Thread(
                    target=self._handle_client,
                    args=(client_socket, client_address[0])
                ).start()
                
        except Exception as e:
            logger.error(f"Failed to start FTP Honeypot: {str(e)}")
            if self.server_socket:
                self.server_socket.close()
            raise

    def _handle_client(self, client_socket: socket.socket, client_ip: str):
        """Handle an individual client connection."""
        try:
            # Send welcome message
            client_socket.send(b'220 Welcome to FTP server\r\n')
            
            # Initialize state
            username = None
            password = None
            
            while True:
                # Read command
                command = self._read_line(client_socket).decode('ascii', errors='ignore').strip()
                if not command:
                    break
                    
                # Parse command and arguments
                cmd, *args = command.split(' ', 1)
                cmd = cmd.upper()
                arg = args[0] if args else None
                
                # Handle different commands
                if cmd == 'USER':
                    username = arg
                    client_socket.send(b'331 Please specify the password.\r\n')
                elif cmd == 'PASS':
                    password = arg
                    # Log the attempt
                    logger.info(f"FTP login attempt from {client_ip}: Username: {username}, Password: {password}")
                    
                    # Get geolocation data
                    location = geolocation_service.get_location(client_ip)
                    
                    # Log to database
                    try:
                        db = next(get_db())
                        attempt = LoginAttempt(
                            protocol=Protocol.FTP,
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
                    
                    # Send error message
                    client_socket.send(b'530 Login incorrect.\r\n')
                    break
                elif cmd == 'QUIT':
                    client_socket.send(b'221 Goodbye.\r\n')
                    break
                elif cmd in ['SYST', 'FEAT', 'PWD', 'TYPE', 'PASV', 'PORT']:
                    # Handle common FTP commands
                    if cmd == 'SYST':
                        client_socket.send(b'215 UNIX Type: L8\r\n')
                    elif cmd == 'FEAT':
                        client_socket.send(b'211-Features:\r\n PASV\r\n211 End\r\n')
                    elif cmd == 'PWD':
                        client_socket.send(b'257 "/" is current directory.\r\n')
                    elif cmd == 'TYPE':
                        client_socket.send(b'200 Switching to ASCII mode.\r\n')
                    elif cmd == 'PASV':
                        client_socket.send(b'227 Entering Passive Mode (127,0,0,1,0,0).\r\n')
                    elif cmd == 'PORT':
                        client_socket.send(b'200 PORT command successful.\r\n')
                else:
                    # Unknown command
                    client_socket.send(b'500 Unknown command.\r\n')
            
        except Exception as e:
            logger.error(f"Error handling client {client_ip}: {str(e)}")
        finally:
            client_socket.close()

    def _read_line(self, sock: socket.socket) -> bytes:
        """Read a line from the socket."""
        buffer = bytearray()
        while True:
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
                
        return bytes(buffer) 