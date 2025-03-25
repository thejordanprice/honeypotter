"""FTP Honeypot server implementation."""
import socket
import logging
from honeypot.core.base_server import BaseHoneypot
from honeypot.database.models import Protocol
from honeypot.core.config import HOST, FTP_PORT

logger = logging.getLogger(__name__)

class FTPHoneypot(BaseHoneypot):
    """FTP Honeypot server implementation."""
    
    def __init__(self, host: str = HOST, port: int = FTP_PORT):
        """Initialize the FTP honeypot server."""
        super().__init__(host, port, Protocol.FTP)

    def _handle_client(self, client_socket: socket.socket, client_ip: str):
        """Handle an individual FTP client connection."""
        try:
            # Set base timeout for initial connection
            self._configure_socket_timeout(client_socket)
            
            # Send welcome message
            client_socket.send(b'220 Welcome to FTP server\r\n')
            
            # Initialize state
            username = None
            password = None
            
            while True:
                # Set extended timeout for command processing
                self._configure_socket_timeout(client_socket, self.extended_timeout)
                
                # Receive command
                data = client_socket.recv(1024).decode('utf-8', errors='ignore').strip()
                if not data:
                    break
                
                # Process FTP commands
                if data.upper().startswith('USER'):
                    username = data[5:].strip()
                    client_socket.send(b'331 Please specify the password.\r\n')
                
                elif data.upper().startswith('PASS'):
                    if username:
                        password = data[5:].strip()
                        self._log_attempt(username, password, client_ip)
                        client_socket.send(b'530 Login incorrect.\r\n')
                        break
                    else:
                        client_socket.send(b'503 Login with USER first.\r\n')
                
                elif data.upper().startswith('QUIT'):
                    client_socket.send(b'221 Goodbye.\r\n')
                    break
                
                else:
                    client_socket.send(b'530 Please login with USER and PASS.\r\n')
            
        except socket.timeout:
            logger.debug(f"Connection timed out from {client_ip}")
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