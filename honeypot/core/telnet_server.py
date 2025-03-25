"""Telnet Honeypot server implementation."""
import socket
import logging
import threading
from honeypot.core.base_server import BaseHoneypot
from honeypot.database.models import Protocol
from honeypot.core.config import HOST, TELNET_PORT
from honeypot.core.server_registry import register_server

logger = logging.getLogger(__name__)

# Telnet protocol constants
IAC = bytes([255])  # Interpret As Command
DONT = bytes([254])
DO = bytes([253])
WONT = bytes([252])
WILL = bytes([251])
SB = bytes([250])  # Subnegotiation Begin
SE = bytes([240])  # Subnegotiation End
ECHO = bytes([1])
SUPPRESS_GO_AHEAD = bytes([3])
LINEMODE = bytes([34])

@register_server
class TelnetHoneypot(BaseHoneypot):
    """Telnet Honeypot server implementation."""
    
    def __init__(self, host: str = HOST, port: int = TELNET_PORT):
        """Initialize the Telnet honeypot server."""
        super().__init__(host, port, Protocol.TELNET)

    def _handle_client(self, client_socket: socket.socket, client_ip: str):
        """Handle an individual Telnet client connection."""
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
            
            # Log the attempt and broadcast
            self._log_attempt(username, password, client_ip)
            
            # Send login failure message
            client_socket.send(b'Login incorrect\r\n')
            
        except Exception as e:
            logger.error(f"Error handling client {client_ip}: {str(e)}")
        finally:
            client_socket.close()

    def _read_line(self, sock: socket.socket) -> bytes:
        """Read a line from the socket, handling telnet protocol negotiations.
        
        This overrides the base class implementation to handle telnet-specific
        protocol negotiations.
        
        Args:
            sock: The socket to read from
            
        Returns:
            The line read from the socket as bytes
        """
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