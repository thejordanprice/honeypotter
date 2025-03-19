import paramiko
import socket
import threading

# Disable Paramiko's internal logging (to prevent verbose output like connection details, errors, etc.)
paramiko.util.log_to_file("/dev/null")  # You can also use "nul" for Windows if needed

class HoneyPotServer(paramiko.ServerInterface):
    def __init__(self, client_ip):
        self.username = None
        self.password = None
        self.client_ip = client_ip  # Store the client IP for logging

    def check_auth_password(self, username, password):
        # Use print statements to log login attempts with username, password, and client IP
        print(f"Login attempt from {self.client_ip}: Username: {username}, Password: {password}")
        
        # Allow 'test' as both username and password for demonstration purposes
        if username == 'test' and password == 'test':
            self.username = username
            self.password = password
            return paramiko.AUTH_SUCCESSFUL
        else:
            return paramiko.AUTH_FAILED

    def get_allowed_auths(self, username):
        # Allow password authentication
        return 'password'


class HoneyPotSSHServer:
    def __init__(self, host='127.0.0.1', port=2222):
        self.host = host
        self.port = port
        self.server = None

    def start(self):
        # Set up the transport to accept SSH connections
        host_key = paramiko.RSAKey.generate(2048)
        
        # Create the transport listener
        server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        server_socket.bind((self.host, self.port))
        server_socket.listen(100)

        print(f"SSH Honeypot started on {self.host}:{self.port}...")

        while True:
            client_socket, client_address = server_socket.accept()

            # Start a new thread to handle the client and pass the client IP
            threading.Thread(target=self.handle_client, args=(client_socket, host_key, client_address[0])).start()

    def handle_client(self, client_socket, host_key, client_ip):
        transport = paramiko.Transport(client_socket)
        try:
            transport.add_server_key(host_key)
            server = HoneyPotServer(client_ip)
            transport.start_server(server=server)

            # Wait for authentication
            transport.accept(20)
        except Exception:
            # No logging for errors or disconnections
            pass
        finally:
            transport.close()

if __name__ == "__main__":
    honeypot = HoneyPotSSHServer()
    honeypot.start()
