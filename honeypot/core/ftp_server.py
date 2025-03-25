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
                    # Log the attempt and broadcast
                    self._log_attempt(username, password, client_ip)
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