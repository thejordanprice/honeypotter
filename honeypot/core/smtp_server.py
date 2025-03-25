"""SMTP Honeypot server implementation."""
import socket
import logging
import base64
import re
from honeypot.core.base_server import BaseHoneypot
from honeypot.database.models import Protocol
from honeypot.core.config import HOST, SMTP_PORT
from honeypot.core.server_registry import register_server

logger = logging.getLogger(__name__)

@register_server
class SMTPHoneypot(BaseHoneypot):
    """SMTP Honeypot server implementation."""
    
    def __init__(self, host: str = HOST, port: int = SMTP_PORT):
        """Initialize the SMTP honeypot server."""
        super().__init__(host, port, Protocol.SMTP)

    def _handle_client(self, client_socket: socket.socket, client_ip: str):
        """Handle an individual SMTP client connection."""
        try:
            # Send welcome message
            client_socket.send(b'220 smtp.gmail.com ESMTP ready\r\n')
            
            # Initialize state
            username = None
            password = None
            in_auth = False
            
            while True:
                # Read command
                command = self._read_line(client_socket).decode('ascii', errors='ignore').strip()
                if not command:
                    break
                    
                # Parse command and arguments
                parts = command.split(' ')
                cmd = parts[0].upper()
                args = parts[1:] if len(parts) > 1 else []
                
                # Handle different commands
                if cmd == 'EHLO' or cmd == 'HELO':
                    client_socket.send(b'250-smtp.gmail.com\r\n')
                    client_socket.send(b'250-PIPELINING\r\n')
                    client_socket.send(b'250-SIZE 35882577\r\n')
                    client_socket.send(b'250-STARTTLS\r\n')
                    client_socket.send(b'250-AUTH LOGIN PLAIN\r\n')
                    client_socket.send(b'250 8BITMIME\r\n')
                elif cmd == 'AUTH':
                    if len(args) >= 2 and args[0].upper() == 'PLAIN':
                        # Handle inline AUTH PLAIN
                        try:
                            auth_data = base64.b64decode(args[1]).decode('utf-8')
                            # AUTH PLAIN format is: \x00username\x00password
                            _, username, password = auth_data.split('\x00')
                            # Log the attempt and broadcast
                            self._log_attempt(username, password, client_ip)
                            # Send error message
                            client_socket.send(b'535 Authentication failed\r\n')
                            break
                        except Exception as e:
                            logger.error(f"Error decoding AUTH PLAIN from {client_ip}: {str(e)}")
                            client_socket.send(b'501 Authentication failed\r\n')
                            break
                    elif len(args) == 1 and args[0].upper() == 'PLAIN':
                        # Handle multi-step AUTH PLAIN
                        client_socket.send(b'334 \r\n')
                        in_auth = True
                    elif len(args) == 1 and args[0].upper() == 'LOGIN':
                        # Handle AUTH LOGIN
                        client_socket.send(b'334 VXNlcm5hbWU6\r\n')  # Base64 encoded "Username:"
                        username = base64.b64decode(self._read_line(client_socket).strip()).decode('utf-8')
                        client_socket.send(b'334 UGFzc3dvcmQ6\r\n')  # Base64 encoded "Password:"
                        password = base64.b64decode(self._read_line(client_socket).strip()).decode('utf-8')
                        # Log the attempt and broadcast
                        self._log_attempt(username, password, client_ip)
                        # Send error message
                        client_socket.send(b'535 Authentication failed\r\n')
                        break
                    else:
                        client_socket.send(b'504 Authentication mechanism not supported\r\n')
                elif in_auth:
                    # Handle AUTH PLAIN continuation
                    try:
                        auth_data = base64.b64decode(command).decode('utf-8')
                        # AUTH PLAIN format is: \x00username\x00password
                        _, username, password = auth_data.split('\x00')
                        # Log the attempt and broadcast
                        self._log_attempt(username, password, client_ip)
                        # Send error message
                        client_socket.send(b'535 Authentication failed\r\n')
                        break
                    except Exception as e:
                        logger.error(f"Error decoding AUTH PLAIN continuation from {client_ip}: {str(e)}")
                        client_socket.send(b'501 Authentication failed\r\n')
                        break
                elif cmd == 'QUIT':
                    client_socket.send(b'221 Goodbye\r\n')
                    break
                else:
                    # Unknown or unhandled command
                    client_socket.send(b'500 Error: command not recognized\r\n')
            
        except Exception as e:
            logger.error(f"Error handling client {client_ip}: {str(e)}")
        finally:
            client_socket.close() 