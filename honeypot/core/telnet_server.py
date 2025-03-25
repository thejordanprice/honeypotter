"""Telnet Honeypot server implementation."""
import socket
import logging
from honeypot.core.base_server import BaseHoneypot
from honeypot.database.models import Protocol
from honeypot.core.config import HOST, TELNET_PORT

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

class TelnetHoneypot(BaseHoneypot):
    """Telnet Honeypot server implementation."""
    
    def __init__(self, host: str = HOST, port: int = TELNET_PORT):
        """Initialize the Telnet honeypot server."""
        super().__init__(host, port, Protocol.TELNET)

    def _handle_client(self, client_socket: socket.socket, client_ip: str):
        """Handle an individual Telnet client connection."""
        try:
            # Set base timeout for initial connection
            self._configure_socket_timeout(client_socket)
            
            # Send initial telnet negotiation
            self._send_initial_negotiation(client_socket)
            
            # Initialize state
            username = None
            password = None
            
            # Send login prompt
            client_socket.send(b'Ubuntu 20.04.6 LTS\r\nlogin: ')
            
            while True:
                # Set extended timeout for input processing
                self._configure_socket_timeout(client_socket, self.extended_timeout)
                
                # Receive input
                data = client_socket.recv(1024)
                if not data:
                    break
                
                # Handle telnet commands
                if IAC in data:
                    self._handle_telnet_command(client_socket, data)
                    continue
                
                # Process input
                try:
                    text = data.decode('utf-8', errors='ignore').strip()
                    if not username:
                        username = text
                        client_socket.send(b'Password: ')
                    else:
                        password = text
                        self._log_attempt(username, password, client_ip)
                        client_socket.send(b'\r\nLogin incorrect\r\n\r\nUbuntu 20.04.6 LTS\r\nlogin: ')
                        username = None
                        password = None
                except UnicodeDecodeError:
                    continue
            
        except socket.timeout:
            logger.debug(f"Connection timed out from {client_ip}")
        except Exception as e:
            logger.error(f"Error handling client {client_ip}: {str(e)}")
        finally:
            client_socket.close()

    def _send_initial_negotiation(self, sock: socket.socket) -> None:
        """Send initial Telnet protocol negotiation."""
        # Don't echo
        sock.send(IAC + WILL + ECHO)
        # Will suppress go ahead
        sock.send(IAC + WILL + SUPPRESS_GO_AHEAD)
        # Don't use linemode
        sock.send(IAC + WONT + LINEMODE)

    def _handle_telnet_command(self, sock: socket.socket, data: bytes) -> None:
        """Handle Telnet protocol commands."""
        try:
            # Find all IAC sequences
            while IAC in data:
                # Get index of IAC
                iac_index = data.index(IAC)
                
                # If we have at least 3 bytes (IAC + command + option)
                if len(data) >= iac_index + 3:
                    cmd = data[iac_index + 1:iac_index + 2]
                    opt = data[iac_index + 2:iac_index + 3]
                    
                    # Handle basic negotiation
                    if cmd in [DO, WILL]:
                        sock.send(IAC + WONT + opt)
                    elif cmd in [DONT, WONT]:
                        sock.send(IAC + DONT + opt)
                    
                    # Move past this command
                    data = data[iac_index + 3:]
                else:
                    break
                    
        except Exception as e:
            logger.error(f"Error handling telnet command: {str(e)}")

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