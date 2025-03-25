"""SMTP Honeypot server implementation."""
import socket
import logging
import base64
from honeypot.core.base_server import BaseHoneypot
from honeypot.database.models import Protocol
from honeypot.core.config import HOST, SMTP_PORT

logger = logging.getLogger(__name__)

class SMTPHoneypot(BaseHoneypot):
    """SMTP Honeypot server implementation."""
    
    def __init__(self, host: str = HOST, port: int = SMTP_PORT):
        """Initialize the SMTP honeypot server."""
        super().__init__(host, port, Protocol.SMTP)

    def _handle_client(self, client_socket: socket.socket, client_ip: str):
        """Handle an individual SMTP client connection."""
        try:
            # Set base timeout for initial connection
            self._configure_socket_timeout(client_socket)
            
            # Send welcome message
            client_socket.send(b'220 smtp.gmail.com ESMTP ready\r\n')
            
            # Initialize state
            username = None
            password = None
            in_auth = False
            
            while True:
                # Set extended timeout for command processing
                self._configure_socket_timeout(client_socket, self.extended_timeout)
                
                # Receive command
                data = client_socket.recv(1024).decode('utf-8', errors='ignore').strip()
                if not data:
                    break
                
                # Process SMTP commands
                if data.startswith('EHLO') or data.startswith('HELO'):
                    client_socket.send(b'250-smtp.gmail.com\r\n')
                    client_socket.send(b'250-PIPELINING\r\n')
                    client_socket.send(b'250-SIZE 35882577\r\n')
                    client_socket.send(b'250-AUTH LOGIN PLAIN\r\n')
                    client_socket.send(b'250 8BITMIME\r\n')
                
                elif data.startswith('AUTH'):
                    in_auth = True
                    if 'PLAIN' in data:
                        # Handle AUTH PLAIN
                        try:
                            auth_data = data.split()[-1]
                            decoded = base64.b64decode(auth_data).decode('utf-8')
                            _, username, password = decoded.split('\0')
                            self._log_attempt(username, password, client_ip)
                        except:
                            pass
                    else:
                        # For other AUTH methods, prompt for username
                        client_socket.send(b'334 VXNlcm5hbWU6\r\n')  # Base64 encoded "Username:"
                
                elif in_auth:
                    try:
                        # Try to decode credentials
                        decoded = base64.b64decode(data).decode('utf-8')
                        if username is None:
                            username = decoded
                            client_socket.send(b'334 UGFzc3dvcmQ6\r\n')  # Base64 encoded "Password:"
                        else:
                            password = decoded
                            self._log_attempt(username, password, client_ip)
                            client_socket.send(b'535 Authentication failed\r\n')
                            break
                    except:
                        client_socket.send(b'501 Syntax error\r\n')
                        break
                
                elif data.startswith('QUIT'):
                    client_socket.send(b'221 Bye\r\n')
                    break
                
                else:
                    client_socket.send(b'500 Error: command not recognized\r\n')
            
        except socket.timeout:
            logger.debug(f"Connection timed out from {client_ip}")
        except Exception as e:
            logger.error(f"Error handling client {client_ip}: {str(e)}")
        finally:
            client_socket.close() 