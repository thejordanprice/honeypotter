"""MySQL Honeypot server implementation."""
import socket
import struct
import logging
from honeypot.core.base_server import BaseHoneypot
from honeypot.database.models import Protocol
from honeypot.core.config import HOST, MYSQL_PORT

logger = logging.getLogger(__name__)

# MySQL protocol constants
MYSQL_PROTOCOL_VERSION = 10
SERVER_VERSION = "8.0.32"  # Updated to match client's version
SERVER_CAPABILITIES = 0x0AFF  # Basic capabilities
SERVER_CHARSET = 0x21  # utf8_general_ci
SERVER_STATUS = 0x0002  # SERVER_STATUS_AUTOCOMMIT
AUTH_PLUGIN_NAME = b"caching_sha2_password"  # Changed to match client's auth method

class MySQLHoneypot(BaseHoneypot):
    """MySQL Honeypot server implementation."""
    
    def __init__(self, host: str = HOST, port: int = MYSQL_PORT):
        """Initialize the MySQL honeypot server."""
        super().__init__(host, port, Protocol.MYSQL)

    def _handle_client(self, client_socket: socket.socket, client_ip: str):
        """Handle an individual MySQL client connection."""
        try:
            # Set socket timeout
            client_socket.settimeout(10)
            
            # Send initial handshake packet
            logger.info(f"Sending handshake to {client_ip}")
            self._send_handshake(client_socket)
            
            # Read initial authentication packet
            logger.info(f"Reading auth packet from {client_ip}")
            auth_packet = self._read_packet(client_socket)
            if not auth_packet:
                logger.warning(f"No auth packet received from {client_ip}")
                return
                
            # Parse initial authentication data
            logger.info(f"Parsing auth packet from {client_ip}")
            username, password = self._parse_initial_auth_packet(auth_packet)
            logger.info(f"Auth attempt from {client_ip}: username={username}, password={password}")
            
            # Log the attempt and broadcast
            self._log_attempt(username, password, client_ip)
            
            # Send error packet
            logger.info(f"Sending error packet to {client_ip}")
            self._send_error_packet(client_socket, "Access denied for user")
            
        except socket.timeout:
            logger.debug(f"Connection timed out from {client_ip}")
        except Exception as e:
            logger.error(f"Error handling client {client_ip}: {str(e)}")
        finally:
            client_socket.close()

    def _send_handshake(self, sock: socket.socket):
        """Send MySQL handshake packet."""
        # Generate random salt
        salt = b'\x0a' * 20  # Simplified salt for example
        
        # Create handshake packet
        handshake = bytearray()
        handshake.append(MYSQL_PROTOCOL_VERSION)
        handshake.extend(SERVER_VERSION.encode('ascii') + b'\x00')
        handshake.extend(struct.pack('<I', 0))  # Connection ID
        handshake.extend(salt[:8])
        handshake.append(0x00)  # Filler
        handshake.extend(salt[8:])
        handshake.extend(AUTH_PLUGIN_NAME + b'\x00')
        
        # Send packet length and data
        packet_length = len(handshake)
        header = struct.pack('<I', packet_length)[:3] + b'\x00'
        sock.send(header + handshake)
        logger.debug(f"Sent handshake packet: {header.hex()} {handshake.hex()}")

    def _read_packet(self, sock: socket.socket) -> bytes:
        """Read a MySQL packet."""
        try:
            # Read packet header
            header = sock.recv(4)
            if not header:
                return None
                
            # Parse packet length and sequence ID
            packet_length = struct.unpack('<I', header[:3] + b'\x00')[0]
            sequence_id = header[3]
            
            logger.debug(f"Received packet header: length={packet_length}, sequence={sequence_id}")
            
            # Read packet body
            packet = sock.recv(packet_length)
            if not packet:
                return None
                
            logger.debug(f"Received packet body: {packet.hex()}")
            return packet
            
        except Exception as e:
            logger.error(f"Error reading packet: {str(e)}")
            return None

    def _parse_initial_auth_packet(self, packet: bytes) -> tuple[str, str]:
        """Parse initial MySQL authentication packet."""
        try:
            # Skip protocol version
            pos = 0
            
            # Read client capabilities
            client_capabilities = struct.unpack('<I', packet[pos:pos+4])[0]
            pos += 4
            
            # Skip max packet size and character set
            pos += 5
            
            # Skip reserved bytes
            pos += 23
            
            # Read username
            username = ""
            while pos < len(packet) and packet[pos] != 0:
                username += chr(packet[pos])
                pos += 1
            pos += 1  # Skip null terminator
            
            # Read auth method
            auth_method = ""
            while pos < len(packet) and packet[pos] != 0:
                auth_method += chr(packet[pos])
                pos += 1
            pos += 1  # Skip null terminator
            
            # Read password
            password = ""
            if pos < len(packet):
                # Password is the rest of the packet
                password = packet[pos:].decode('utf-8', errors='ignore')
            
            # If the password is "caching_sha2_password", it's likely a null password
            if password == "caching_sha2_password" or password == auth_method:
                password = "[Password Null]"
            
            logger.debug(f"Parsed initial auth packet: username={username}, auth_method={auth_method}, password={password}")
            return username, password
            
        except Exception as e:
            logger.error(f"Error parsing initial auth packet: {str(e)}")
            return "", ""

    def _send_error_packet(self, sock: socket.socket, message: str):
        """Send MySQL error packet."""
        error_packet = bytearray()
        error_packet.append(0xFF)  # Error packet marker
        error_packet.extend(struct.pack('<H', 1045))  # ER_ACCESS_DENIED_ERROR
        error_packet.extend(b'#')  # SQL state marker
        error_packet.extend(b'28000')  # SQL state
        error_packet.extend(message.encode('utf-8'))
        
        # Send packet length and data
        packet_length = len(error_packet)
        header = struct.pack('<I', packet_length)[:3] + b'\x01'
        sock.send(header + error_packet)
        logger.debug(f"Sent error packet: {header.hex()} {error_packet.hex()}") 