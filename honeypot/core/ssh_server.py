"""SSH Honeypot server implementation."""
import paramiko
import socket
import logging
from honeypot.core.base_server import BaseHoneypot
from honeypot.database.models import Protocol
from honeypot.core.config import HOST, SSH_PORT

logger = logging.getLogger(__name__)

# Configure Paramiko logger to be less verbose
paramiko_logger = logging.getLogger("paramiko")
paramiko_logger.setLevel(logging.WARNING)  # Set base level
# Create a filter for common non-critical errors
class ParamikoFilter(logging.Filter):
    def filter(self, record):
        # Filter out common scanner/timeout related errors
        if "Error reading SSH protocol banner" in record.getMessage():
            return False
        if "EOFError" in record.getMessage():
            return False
        if "Incompatible ssh peer" in record.getMessage():
            return False
        return True
paramiko_logger.addFilter(ParamikoFilter())

class HoneypotServerInterface(paramiko.ServerInterface):
    """SSH server interface implementation."""
    
    def __init__(self, honeypot: 'SSHHoneypot', client_ip: str):
        """Initialize the SSH server interface.
        
        Args:
            honeypot: The parent SSHHoneypot instance
            client_ip: The client's IP address
        """
        self.honeypot = honeypot
        self.client_ip = client_ip
        self.username: str = ""
        self.password: str = ""
        super().__init__()

    def check_auth_password(self, username: str, password: str) -> int:
        """Log the authentication attempt and always return success.
        
        Args:
            username: The attempted username
            password: The attempted password
            
        Returns:
            Always returns AUTH_SUCCESSFUL to allow capturing credentials
        """
        self.username = username
        self.password = password
        
        # Log the attempt and broadcast
        self.honeypot._log_attempt(username, password, self.client_ip)
        
        return paramiko.AUTH_SUCCESSFUL

    def get_allowed_auths(self, username: str) -> str:
        """Return allowed authentication methods.
        
        Args:
            username: The username being authenticated
            
        Returns:
            String indicating password authentication is allowed
        """
        return 'password'

class SSHHoneypot(BaseHoneypot):
    """SSH Honeypot server implementation."""
    
    def __init__(self, host: str = HOST, port: int = SSH_PORT):
        """Initialize the SSH honeypot server."""
        super().__init__(host, port, Protocol.SSH)
        self.server_key = paramiko.RSAKey.generate(2048)

    def _handle_client(self, client_socket: socket.socket, client_ip: str):
        """Handle an individual SSH client connection."""
        transport = None
        try:
            # Set base timeout for initial connection
            self._configure_socket_timeout(client_socket)
            
            # Create transport
            transport = paramiko.Transport(client_socket)
            transport.local_version = "SSH-2.0-OpenSSH_8.9p1 Ubuntu-3ubuntu0.1"
            
            # Set transport timeout
            transport.set_keepalive(60)  # Send keepalive every 60 seconds
            transport.use_compression(False)
            
            # Configure extended timeout for authentication
            self._configure_socket_timeout(client_socket, self.extended_timeout)
            
            # Add server key
            transport.add_server_key(self.server_key)
            
            # Start server
            server = paramiko.ServerInterface()
            transport.start_server(server=server)
            
            # Wait for auth attempt with timeout
            channel = transport.accept(20)  # 20 second timeout for auth
            if channel is None:
                logger.debug(f"No channel established from {client_ip}")
                return
            
            # Get authentication attempts
            username = server.get_username()
            password = server.get_password()
            
            # Log the attempt
            if username or password:
                self._log_attempt(username or "", password or "", client_ip)
                
        except paramiko.SSHException as e:
            # Handle other SSH-specific exceptions
            if "Error reading SSH protocol banner" in str(e):
                logger.debug(f"Scanner probe from {client_ip}: {str(e)}")
            else:
                logger.warning(f"SSH exception from {client_ip}: {str(e)}")
        except socket.timeout:
            logger.debug(f"Connection timed out from {client_ip}")
        except Exception as e:
            logger.error(f"Error handling client {client_ip}: {str(e)}")
        finally:
            if transport:
                transport.close()
            client_socket.close() 