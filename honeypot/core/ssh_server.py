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
        # Generate ECDSA key
        self.host_key = paramiko.ECDSAKey.generate(bits=521)
        logger.info(f"Generated ECDSA host key: {self.host_key.get_fingerprint().hex()}")

    def _handle_client(self, client_socket: socket.socket, client_ip: str):
        """Handle an individual SSH client connection."""
        transport = None
        try:
            transport = paramiko.Transport(client_socket)
            transport.add_server_key(self.host_key)
            transport.local_version = "SSH-2.0-OpenSSH_8.2p1 Ubuntu-4ubuntu0.5"  # Mimic a real server
            
            server = HoneypotServerInterface(self, client_ip)
            try:
                transport.start_server(server=server)
            except paramiko.SSHException as e:
                if "Error reading SSH protocol banner" in str(e):
                    # This is a common case for scanners, log at debug level
                    logger.debug(f"Scanner probe from {client_ip}: {str(e)}")
                    return
                elif "Incompatible ssh peer" in str(e):
                    logger.debug(f"Incompatible SSH client from {client_ip}: {str(e)}")
                    return
                else:
                    logger.warning(f"SSH negotiation failed from {client_ip}: {str(e)}")
                    return
            
            channel = transport.accept(20)
            if channel is not None:
                channel.close()
                
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