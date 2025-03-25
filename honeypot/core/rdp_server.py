"""RDP Honeypot server implementation."""
import logging
import socket
import struct
import time
import threading
from typing import Dict, Tuple, Optional
from .base_server import BaseHoneypot
from honeypot.database.models import Protocol
from honeypot.core.config import HOST, RDP_PORT

logger = logging.getLogger(__name__)

class RDPHoneypot(BaseHoneypot):
    """RDP Honeypot server implementation."""
    
    def __init__(self, host: str = HOST, port: int = RDP_PORT):
        """Initialize the RDP honeypot server."""
        super().__init__(host, port, Protocol.RDP)
        self.connection_states: Dict[str, Dict] = {}
        self.recv_buffer_size = 8192
        self.connection_lock = threading.Lock()

    def start(self) -> None:
        """Start the RDP honeypot server."""
        # Use the base class implementation which will handle threading properly
        super().start()

    def _handle_client(self, client_socket: socket.socket, client_ip: str) -> None:
        """Handle a client connection with improved RDP protocol handling."""
        all_data = bytearray()
        
        try:
            # Configure socket
            client_socket.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, self.recv_buffer_size)
            client_socket.setsockopt(socket.SOL_SOCKET, socket.SO_SNDBUF, self.recv_buffer_size)
            client_socket.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)

            # Check connection state
            with self.connection_lock:
                now = time.time()
                state = self.connection_states.get(client_ip, {
                    'last_attempt': 0,
                    'username': None,
                    'attempts': 0
                })
                state['last_attempt'] = now
                state['attempts'] = state.get('attempts', 0) + 1
                self.connection_states[client_ip] = state

            # Initial RDP negotiation sequence
            initial_data = self._handle_initial_negotiation(client_socket)
            if not initial_data:
                return  # Silently ignore connections with no data

            # Accumulate all received data
            all_data.extend(initial_data)

            # Try to extract credentials from initial data
            username, password = self._extract_credentials(initial_data)
            
            # If no password found, try additional negotiation steps
            if not password or password == "":
                try:
                    # Send enhanced RDP security request
                    security_request = (
                        b"\x03\x00\x00\x0c"  # TPKT header
                        b"\x02\xf0\x80\x04"  # X.224 Data TPDU
                        b"\x00\x01\x00\x00"  # Security Exchange PDU
                    )
                    client_socket.send(security_request)
                    
                    # Try to read response with increasing timeouts
                    for timeout in [0.5, 1.0, 1.5]:
                        try:
                            client_socket.settimeout(timeout)
                            security_data = client_socket.recv(self.recv_buffer_size)
                            if security_data:
                                all_data.extend(security_data)
                                username_sec, password_sec = self._extract_credentials(security_data)
                                if password_sec and password_sec != "":
                                    password = password_sec
                                    if username_sec:
                                        username = username_sec
                                    break
                        except socket.timeout:
                            continue
                        except socket.error as e:
                            if e.errno == 32:  # Broken pipe
                                break
                            logger.debug(f"Non-critical socket error: {str(e)}")
                            continue
                        except Exception as e:
                            logger.debug(f"Error during security negotiation: {str(e)}")
                            continue
                    
                    # If still no password, try one final extraction from all data
                    if not password or password == "":
                        username_final, password_final = self._extract_credentials(all_data)
                        if password_final and password_final != "":
                            password = password_final
                            if username_final:
                                username = username_final
                
                except socket.error as e:
                    if e.errno == 32:  # Broken pipe
                        logger.debug("Client closed connection during security negotiation")
                    else:
                        logger.debug(f"Socket error during security negotiation: {str(e)}")
                except Exception as e:
                    logger.debug(f"Error during security negotiation: {str(e)}")

            # Only log if we have a real username
            if username and username != "UNKNOWN":
                with self.connection_lock:
                    state = self.connection_states[client_ip]
                    # Only log if it's a new username or we have a password
                    if username != state.get('username') or (password and password != ""):
                        logger.info(f"RDP connection attempt from {client_ip} - Username: {username}")
                        self._log_attempt(username, password or "", client_ip)
                        state['username'] = username

            # Send RDP error response if connection is still alive
            try:
                self._send_error_and_close(client_socket)
            except socket.error as e:
                if e.errno == 32:  # Broken pipe
                    logger.debug("Client already closed connection")
                else:
                    logger.debug(f"Error sending error response: {str(e)}")
            except Exception as e:
                logger.debug(f"Error during connection cleanup: {str(e)}")

        except socket.error as e:
            if e.errno == 32:  # Broken pipe
                logger.debug(f"Client {client_ip} closed connection")
            else:
                logger.error(f"Socket error handling RDP connection from {client_ip}: {str(e)}")
        except Exception as e:
            logger.error(f"Error handling RDP connection from {client_ip}: {str(e)}")
        finally:
            try:
                client_socket.shutdown(socket.SHUT_RDWR)
            except:
                pass
            try:
                client_socket.close()
            except:
                pass
            # Clean up old connection states periodically
            self._cleanup_connection_states()

    def _cleanup_connection_states(self) -> None:
        """Clean up old connection states."""
        try:
            with self.connection_lock:
                now = time.time()
                expired = [
                    ip for ip, state in self.connection_states.items()
                    if now - state['last_attempt'] > 300  # 5 minutes
                ]
                for ip in expired:
                    del self.connection_states[ip]
        except Exception as e:
            logger.debug(f"Error cleaning up connection states: {str(e)}")

    def _handle_initial_negotiation(self, sock: socket.socket) -> Optional[bytes]:
        """Handle initial RDP protocol negotiation."""
        try:
            # Initial TPKT + X.224 Connection Request
            greeting = (
                b"\x03\x00\x00\x13"  # TPKT header
                b"\x0e\xd0\x00\x00\x00\x00\x00"  # X.224 Connection Request
                b"\x02\x0f\x08\x00\x00\x00"  # RDP Negotiation Request
            )
            sock.send(greeting)
            
            # Read client response with backoff strategy
            data = bytearray()
            retries = 3
            timeout = 0.5
            
            while retries > 0:
                try:
                    sock.settimeout(timeout)
                    chunk = sock.recv(self.recv_buffer_size)
                    if chunk:
                        data.extend(chunk)
                        
                        # If we have enough data, try to parse it
                        if len(data) >= 4:
                            try:
                                # Check for TPKT header
                                if data[0] == 0x03 and data[1] == 0x00:
                                    packet_length = struct.unpack(">H", data[2:4])[0]
                                    if len(data) >= packet_length:
                                        # Send RDP Negotiation Response
                                        response = (
                                            b"\x03\x00\x00\x13"  # TPKT header
                                            b"\x0e\xd0\x00\x00\x00\x00\x00"  # X.224 Connection Confirm
                                            b"\x02\x0f\x08\x00\x00\x00"  # RDP Negotiation Response
                                        )
                                        sock.send(response)
                                        
                                        # Send Server Security Data
                                        security = (
                                            b"\x03\x00\x00\x0c"  # TPKT header
                                            b"\x02\xf0\x80\x04"  # X.224 Data TPDU
                                            b"\x01\x00\x01\x00"  # Server Security Data
                                        )
                                        sock.send(security)
                                        
                                        # Try to read additional security negotiation data
                                        try:
                                            sock.settimeout(1.0)
                                            extra_data = sock.recv(self.recv_buffer_size)
                                            if extra_data:
                                                data.extend(extra_data)
                                        except socket.timeout:
                                            pass
                                        except Exception as e:
                                            logger.debug(f"Non-critical error reading extra security data: {str(e)}")
                                        
                                        return bytes(data)
                            except struct.error:
                                pass
                    
                    # Increase timeout for next retry
                    timeout *= 2
                    retries -= 1
                    
                except socket.timeout:
                    timeout *= 2
                    retries -= 1
                    continue
                except socket.error as e:
                    if e.errno == 32:  # Broken pipe
                        logger.debug("Client closed connection during negotiation")
                        if len(data) > 0:
                            return bytes(data)
                        return None
                    else:
                        logger.debug(f"Socket error during negotiation: {str(e)}")
                        if len(data) > 0:
                            return bytes(data)
                        retries -= 1
                        continue
                except Exception as e:
                    logger.debug(f"Error during negotiation: {str(e)}")
                    if len(data) > 0:
                        return bytes(data)
                    retries -= 1
                    continue
            
            return bytes(data) if data else None
            
        except Exception as e:
            logger.debug(f"Error in initial negotiation: {str(e)}")
            return None

    def _read_with_timeout(self, sock: socket.socket, timeout: float) -> Optional[bytes]:
        """Read data from socket with a specific timeout."""
        try:
            sock.settimeout(timeout)
            data = sock.recv(self.recv_buffer_size)
            return data if data else None
        except socket.timeout:
            return None
        except Exception as e:
            logger.debug(f"Error reading with timeout: {str(e)}")
            return None

    def _send_error_and_close(self, sock: socket.socket) -> None:
        """Send error response and properly close the connection."""
        try:
            # Send error response
            error_response = (
                b"\x03\x00\x00\x09"  # TPKT header
                b"\x02\xf0\x80\x21"  # X.224 Disconnect Request
                b"\x80"  # Error response
            )
            sock.send(error_response)
            
            # Small delay to allow the client to process the response
            time.sleep(0.1)
            
        except Exception as e:
            logger.debug(f"Error sending error response: {str(e)}")

    def _extract_credentials(self, data: bytes) -> Tuple[Optional[str], Optional[str]]:
        """Extract username and password from RDP connection data."""
        try:
            # First try direct binary pattern matching for common RDP password formats
            password_markers = [
                b"Password=", b"PWD=", b"PASS=", b"passwd=",
                b"\x00P\x00a\x00s\x00s\x00w\x00o\x00r\x00d\x00=",  # UTF-16LE "Password="
                b"\x00P\x00W\x00D\x00=",  # UTF-16LE "PWD="
            ]
            
            # Look for password markers in raw binary data
            for marker in password_markers:
                idx = data.find(marker)
                if idx >= 0:
                    start = idx + len(marker)
                    # Look for common terminators
                    terminators = [b"\x00", b"\r", b"\n", b"&", b" "]
                    end = None
                    for term in terminators:
                        term_idx = data.find(term, start)
                        if term_idx >= 0:
                            if end is None or term_idx < end:
                                end = term_idx
                    
                    if end:
                        password_data = data[start:end]
                        try:
                            # Try different decodings
                            for encoding in ['utf-8', 'utf-16-le', 'ascii']:
                                try:
                                    password = password_data.decode(encoding).strip()
                                    if password and not all(c in '0123456789abcdefABCDEF' for c in password):
                                        logger.debug(f"Found password using binary marker {marker} with {encoding} encoding")
                                        break
                                except:
                                    continue
                        except:
                            pass

            # Convert bytes to string, ignoring invalid characters
            text_data = data.decode('utf-8', errors='ignore')
            
            # Initialize credentials
            username = None
            password = None
            
            # Enhanced patterns for username detection
            username_patterns = [
                r"USER(?:NAME)?[=\\]([^&\r\n\t\f\v]+)",
                r"DOMAIN\\([^&\r\n\t\f\v]+)",
                r"\\([^&\r\n\t\f\v]+)",
                r"Cookie: mstshash=([^&\r\n\t\f\v]+)",
                r"LOGONID=([^&\r\n\t\f\v]+)",
                r"CONNECTION_USERNAME=([^&\r\n\t\f\v]+)",
                r"RDP_USERNAME=([^&\r\n\t\f\v]+)",
                r"LOGIN=([^&\r\n\t\f\v]+)",
                r"U=([^&\r\n\t\f\v]+)"  # Short form often used in RDP clients
            ]
            
            # Enhanced patterns for password detection
            password_patterns = [
                r"PASS(?:WORD)?[=:]([^&\r\n\t\f\v]+)",
                r"PWD[=:]([^&\r\n\t\f\v]+)",
                r"PASSWORD:([^&\r\n\t\f\v]+)",
                r"P=([^&\r\n\t\f\v]+)",  # Short form often used in RDP clients
                r"PASSWD=([^&\r\n\t\f\v]+)",
                r"RDP_PASSWORD=([^&\r\n\t\f\v]+)",
                r"CONNECTION_PASSWORD=([^&\r\n\t\f\v]+)",
                r"CRED(?:ENTIAL)?S?=([^&\r\n\t\f\v]+)",
                r"password=([^&\r\n\t\f\v]+)",  # Common lowercase variant
                r"pass=([^&\r\n\t\f\v]+)",      # Short lowercase variant
                r"pwd=([^&\r\n\t\f\v]+)"        # Common lowercase variant
            ]
            
            import re
            
            # Extract username with improved validation
            for pattern in username_patterns:
                match = re.search(pattern, text_data, re.IGNORECASE)  # Case insensitive search
                if match:
                    username_part = match.group(1).strip()
                    # Additional validation for username
                    if (username_part and len(username_part) < 50 and 
                        not username_part.startswith(('0x', '\\x')) and  # Avoid hex data
                        not all(c in '0123456789abcdefABCDEF' for c in username_part)):  # Avoid pure hex strings
                        username = username_part
                        break
            
            # Extract password with improved validation
            for pattern in password_patterns:
                match = re.search(pattern, text_data, re.IGNORECASE)  # Case insensitive search
                if match:
                    password_part = match.group(1).strip()
                    # Additional validation for password
                    if (password_part and len(password_part) < 100 and 
                        not password_part.startswith(('0x', '\\x')) and  # Avoid hex data
                        not all(c in '0123456789abcdefABCDEF' for c in password_part)):  # Avoid pure hex strings
                        password = password_part
                        break
            
            # Try to extract from binary data if text extraction failed
            if not (username and password):
                try:
                    # Look for common RDP binary patterns
                    hex_data = data.hex()
                    
                    # Common RDP authentication markers
                    auth_markers = [
                        b"NTLM",
                        b"Kerberos",
                        b"CredSSP",
                        b"TLS_RSA",
                        b"SSPI",
                        b"SPNEGO"
                    ]
                    
                    # Check for authentication data in binary stream
                    for marker in auth_markers:
                        if marker in data:
                            # Found authentication data, try to extract nearby strings
                            start_idx = data.find(marker)
                            search_range = data[max(0, start_idx - 64):min(len(data), start_idx + 256)]
                            
                            # Look for string patterns in nearby data
                            try:
                                # Try UTF-16 decoding for Windows strings
                                win_text = search_range.decode('utf-16-le', errors='ignore')
                                # Look for potential credentials in Windows text
                                for pattern in username_patterns:
                                    match = re.search(pattern, win_text, re.IGNORECASE)
                                    if match and not username:
                                        username_part = match.group(1).strip()
                                        if username_part and len(username_part) < 50:
                                            username = username_part
                                
                                for pattern in password_patterns:
                                    match = re.search(pattern, win_text, re.IGNORECASE)
                                    if match and not password:
                                        password_part = match.group(1).strip()
                                        if password_part and len(password_part) < 100:
                                            password = password_part
                            except Exception:
                                pass  # Ignore decoding errors
                            
                            # Look for ASN.1 structures that might contain credentials
                            if b"0x30" in search_range:  # ASN.1 SEQUENCE marker
                                logger.debug("Found potential ASN.1 structure in authentication data")
                                # Here we could add more sophisticated ASN.1 parsing if needed
                            
                            logger.debug(f"Found {marker.decode()} authentication data")
                            break
                    
                    # Additional binary analysis for specific RDP security providers
                    if b"MSRDP" in data:
                        logger.debug("Found MSRDP security provider")
                    elif b"SSL_RSA" in data:
                        logger.debug("Found SSL/TLS security provider")
                    
                except Exception as e:
                    logger.debug(f"Error processing binary data: {str(e)}")
            
            return username, password
            
        except Exception as e:
            logger.error(f"Error extracting credentials: {str(e)}")
            return None, None

    def stop(self) -> None:
        """Stop the RDP honeypot server."""
        if hasattr(self, 'server_socket'):
            self.server_socket.close() 