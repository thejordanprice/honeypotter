"""SIP Honeypot server implementation."""
import socket
import logging
import re
from honeypot.core.base_server import BaseHoneypot
from honeypot.database.models import Protocol
from honeypot.core.config import HOST, SIP_PORT
import threading

logger = logging.getLogger(__name__)

class SIPHoneypot(BaseHoneypot):
    """SIP Honeypot server implementation."""
    
    def __init__(self, host: str = HOST, port: int = SIP_PORT):
        """Initialize the SIP honeypot server."""
        super().__init__(host, port, Protocol.SIP)
        
        # Common SIP methods we want to handle
        self.sip_methods = {
            'REGISTER': self._handle_register,
            'INVITE': self._handle_invite,
            'ACK': self._handle_ack,
            'BYE': self._handle_bye,
            'CANCEL': self._handle_cancel,
            'OPTIONS': self._handle_options
        }

    def _handle_client(self, client_socket: socket.socket, client_ip: str):
        """Handle an individual client connection (required by base class).
        
        This method is required by the base class but we don't use it directly
        as we handle both TCP and UDP separately.
        """
        pass  # We handle clients in _handle_tcp_client and _handle_udp_message

    def start(self):
        """Start the SIP honeypot server on both TCP and UDP."""
        try:
            # Start TCP server
            self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.server_socket.bind((self.host, self.port))
            self.server_socket.listen(100)
            
            # Start UDP server
            self.udp_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            self.udp_socket.bind((self.host, self.port))
            
            logger.info(f"SIP Honeypot listening on {self.host}:{self.port} (TCP and UDP)")
            
            # Start TCP handler thread
            tcp_thread = threading.Thread(target=self._handle_tcp_connections)
            tcp_thread.daemon = True
            tcp_thread.start()
            
            # Handle UDP messages in the main thread
            self._handle_udp_messages()
                
        except Exception as e:
            logger.error(f"Failed to start SIP Honeypot: {str(e)}")
            if hasattr(self, 'server_socket'):
                self.server_socket.close()
            if hasattr(self, 'udp_socket'):
                self.udp_socket.close()
            raise

    def _handle_tcp_connections(self):
        """Handle TCP connections in a separate thread."""
        while True:
            try:
                client_socket, client_address = self.server_socket.accept()
                threading.Thread(
                    target=self._handle_tcp_client,
                    args=(client_socket, client_address[0])
                ).start()
            except Exception as e:
                logger.error(f"Error accepting TCP connection: {str(e)}")

    def _handle_udp_messages(self):
        """Handle UDP messages in the main thread."""
        while True:
            try:
                data, client_address = self.udp_socket.recvfrom(65535)
                self._handle_udp_message(data, client_address[0])
            except Exception as e:
                logger.error(f"Error handling UDP message: {str(e)}")

    def _handle_tcp_client(self, client_socket: socket.socket, client_ip: str):
        """Handle an individual TCP client connection."""
        try:
            logger.debug(f"New TCP connection from {client_ip}")
            # Set socket timeout
            client_socket.settimeout(30)
            
            # Read the entire SIP message
            message = self._read_sip_message(client_socket)
            if not message:
                logger.debug(f"No data received from {client_ip}")
                return
                
            logger.debug(f"Received SIP message from {client_ip}:\n{message.decode('utf-8', errors='ignore')}")
            # Process the message
            self._process_sip_message(message, client_ip, client_socket)
            
        except socket.timeout:
            logger.debug(f"SIP TCP connection timed out from {client_ip}")
        except Exception as e:
            logger.error(f"Error handling SIP TCP client {client_ip}: {str(e)}", exc_info=True)
        finally:
            client_socket.close()
            logger.debug(f"Closed TCP connection from {client_ip}")

    def _read_sip_message(self, sock: socket.socket) -> bytes:
        """Read an entire SIP message from the socket.
        
        Args:
            sock: The socket to read from
            
        Returns:
            The complete SIP message as bytes
        """
        buffer = bytearray()
        empty_line_count = 0
        last_char = None
        
        while True:
            try:
                data = sock.recv(1)
                if not data:
                    logger.debug("No more data to read")
                    break
                    
                # Handle different line endings
                if data == b'\r':
                    buffer.extend(data)
                    last_char = data
                elif data == b'\n':
                    if last_char == b'\r':
                        # We already added the \r, just add the \n
                        buffer.extend(data)
                    else:
                        # Single \n, add it
                        buffer.extend(data)
                    last_char = data
                    empty_line_count += 1
                    if empty_line_count == 2:  # Found empty line
                        return bytes(buffer)
                else:
                    buffer.extend(data)
                    last_char = data
                    empty_line_count = 0
                    
            except socket.timeout:
                logger.debug("Socket timeout while reading")
                break
            except Exception as e:
                logger.error(f"Error reading from socket: {str(e)}", exc_info=True)
                break
                
        return bytes(buffer) if buffer else None

    def _handle_udp_message(self, data: bytes, client_ip: str):
        """Handle a UDP message."""
        try:
            # Process the message
            self._process_sip_message(data, client_ip, self.udp_socket)
        except Exception as e:
            logger.error(f"Error handling SIP UDP message from {client_ip}: {str(e)}")

    def _process_sip_message(self, data: bytes, client_ip: str, response_socket: socket.socket):
        """Process a SIP message and send response."""
        try:
            # Decode the message
            message = data.decode('utf-8', errors='ignore')
            logger.debug(f"Processing SIP message from {client_ip}:\n{message}")
            
            # Parse the first line to get the method
            first_line = message.split('\n')[0].strip()
            method = first_line.split()[0]
            logger.debug(f"Detected SIP method: {method}")
            
            # Extract credentials if present
            username = None
            password = None
            
            # First try to get username and password from Authorization header
            # Make the regex more flexible with whitespace and line endings
            auth_match = re.search(r'Authorization:\s*Digest\s+username\s*=\s*"([^"]+)".*?response\s*=\s*"([^"]+)"', message, re.DOTALL | re.IGNORECASE)
            if auth_match:
                username = auth_match.group(1)
                password = auth_match.group(2)  # This is the hashed password
                logger.debug(f"Found credentials in Authorization header - Username: {username}, Response: {password}")
            
            # If no username in Authorization, try to extract from From header
            if not username:
                from_match = re.search(r'From:\s*<?sip:([^@>]+)@', message, re.IGNORECASE)
                if from_match:
                    username = from_match.group(1)
                    password = "[FROM_HEADER]"
                    logger.debug(f"Found username in From header: {username}")
            
            # For REGISTER/INVITE, if we still don't have a username, try to extract from URI
            if not username and method in ['REGISTER', 'INVITE']:
                uri_match = re.search(rf'{method}\s+sip:([^@\s]+)@', message, re.IGNORECASE)
                if uri_match:
                    username = uri_match.group(1)
                    password = "[URI]"
                    logger.debug(f"Found username in URI: {username}")
            
            # Only log if we found a username
            if username:
                logger.info(f"Logging SIP attempt - Username: {username}, Password: {password}, IP: {client_ip}")
                self._log_attempt(username, password, client_ip)
            else:
                logger.debug("No username found in message, skipping log")
            
            # Handle the SIP method if we support it
            if method in self.sip_methods:
                logger.debug(f"Handling SIP method: {method}")
                response = self.sip_methods[method](message, client_ip)
                if response:
                    if isinstance(response_socket, socket.socket):
                        if response_socket.type == socket.SOCK_STREAM:
                            response_socket.send(response.encode())
                            logger.debug("Sent TCP response")
                        else:  # UDP
                            response_socket.sendto(response.encode(), (client_ip, self.port))
                            logger.debug("Sent UDP response")
            
        except Exception as e:
            logger.error(f"Error processing SIP message: {str(e)}", exc_info=True)

    def _handle_register(self, message: str, client_ip: str) -> str:
        """Handle SIP REGISTER requests."""
        # Send 401 Unauthorized to trigger authentication
        return (
            "SIP/2.0 401 Unauthorized\r\n"
            "Via: " + self._extract_via(message) + "\r\n"
            "From: " + self._extract_from(message) + "\r\n"
            "To: " + self._extract_to(message) + "\r\n"
            "Call-ID: " + self._extract_call_id(message) + "\r\n"
            "CSeq: " + self._extract_cseq(message) + "\r\n"
            "WWW-Authenticate: Digest realm=\"sip.honeypot.com\", "
            "nonce=\"" + self._generate_nonce() + "\", "
            "algorithm=MD5\r\n"
            "Content-Length: 0\r\n\r\n"
        )

    def _handle_invite(self, message: str, client_ip: str) -> str:
        """Handle SIP INVITE requests."""
        return (
            "SIP/2.0 401 Unauthorized\r\n"
            "Via: " + self._extract_via(message) + "\r\n"
            "From: " + self._extract_from(message) + "\r\n"
            "To: " + self._extract_to(message) + "\r\n"
            "Call-ID: " + self._extract_call_id(message) + "\r\n"
            "CSeq: " + self._extract_cseq(message) + "\r\n"
            "WWW-Authenticate: Digest realm=\"sip.honeypot.com\", "
            "nonce=\"" + self._generate_nonce() + "\", "
            "algorithm=MD5\r\n"
            "Content-Length: 0\r\n\r\n"
        )

    def _handle_ack(self, message: str, client_ip: str) -> str:
        """Handle SIP ACK requests."""
        return None  # No response needed for ACK

    def _handle_bye(self, message: str, client_ip: str) -> str:
        """Handle SIP BYE requests."""
        return (
            "SIP/2.0 200 OK\r\n"
            "Via: " + self._extract_via(message) + "\r\n"
            "From: " + self._extract_from(message) + "\r\n"
            "To: " + self._extract_to(message) + "\r\n"
            "Call-ID: " + self._extract_call_id(message) + "\r\n"
            "CSeq: " + self._extract_cseq(message) + "\r\n"
            "Content-Length: 0\r\n\r\n"
        )

    def _handle_cancel(self, message: str, client_ip: str) -> str:
        """Handle SIP CANCEL requests."""
        return (
            "SIP/2.0 200 OK\r\n"
            "Via: " + self._extract_via(message) + "\r\n"
            "From: " + self._extract_from(message) + "\r\n"
            "To: " + self._extract_to(message) + "\r\n"
            "Call-ID: " + self._extract_call_id(message) + "\r\n"
            "CSeq: " + self._extract_cseq(message) + "\r\n"
            "Content-Length: 0\r\n\r\n"
        )

    def _handle_options(self, message: str, client_ip: str) -> str:
        """Handle SIP OPTIONS requests."""
        return (
            "SIP/2.0 200 OK\r\n"
            "Via: " + self._extract_via(message) + "\r\n"
            "From: " + self._extract_from(message) + "\r\n"
            "To: " + self._extract_to(message) + "\r\n"
            "Call-ID: " + self._extract_call_id(message) + "\r\n"
            "CSeq: " + self._extract_cseq(message) + "\r\n"
            "Allow: INVITE, ACK, CANCEL, BYE, NOTIFY, REFER, MESSAGE, OPTIONS, INFO, SUBSCRIBE, UPDATE\r\n"
            "Content-Length: 0\r\n\r\n"
        )

    def _extract_via(self, message: str) -> str:
        """Extract Via header from SIP message."""
        via_match = re.search(r'Via:\s*(.*?)(?:\r?\n|$)', message)
        return via_match.group(1) if via_match else ""

    def _extract_from(self, message: str) -> str:
        """Extract From header from SIP message."""
        from_match = re.search(r'From:\s*(.*?)(?:\r?\n|$)', message)
        return from_match.group(1) if from_match else ""

    def _extract_to(self, message: str) -> str:
        """Extract To header from SIP message."""
        to_match = re.search(r'To:\s*(.*?)(?:\r?\n|$)', message)
        return to_match.group(1) if to_match else ""

    def _extract_call_id(self, message: str) -> str:
        """Extract Call-ID header from SIP message."""
        call_id_match = re.search(r'Call-ID:\s*(.*?)(?:\r?\n|$)', message)
        return call_id_match.group(1) if call_id_match else ""

    def _extract_cseq(self, message: str) -> str:
        """Extract CSeq header from SIP message."""
        cseq_match = re.search(r'CSeq:\s*(.*?)(?:\r?\n|$)', message)
        return cseq_match.group(1) if cseq_match else ""

    def _generate_nonce(self) -> str:
        """Generate a random nonce for SIP authentication."""
        import random
        import hashlib
        nonce = hashlib.md5(str(random.getrandbits(128)).encode()).hexdigest()
        return nonce 