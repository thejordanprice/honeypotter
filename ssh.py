import paramiko
import socket
import threading
import sqlite3
import websockets
import asyncio
from datetime import datetime
import os
from http.server import SimpleHTTPRequestHandler
from socketserver import TCPServer

# Disable Paramiko's internal logging
paramiko.util.log_to_file("/dev/null")  # You can also use "nul" for Windows if needed

# Database setup
def setup_database():
    conn = sqlite3.connect('honeypot.db')
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS login_attempts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT,
                    password TEXT,
                    client_ip TEXT,
                    timestamp DATETIME)''')
    conn.commit()
    conn.close()

# Function to log attempts into the SQLite database
def log_login_attempt(username, password, client_ip):
    conn = sqlite3.connect('honeypot.db')
    c = conn.cursor()
    timestamp = datetime.now()
    c.execute("INSERT INTO login_attempts (username, password, client_ip, timestamp) VALUES (?, ?, ?, ?)",
              (username, password, client_ip, timestamp))
    conn.commit()
    conn.close()

    # Notify WebSocket clients about the new login attempt
    asyncio.run(broadcast_login_attempt(username, password, client_ip, timestamp))

# WebSocket server
clients = []

async def register(websocket):
    clients.append(websocket)
    try:
        await websocket.wait_closed()
    finally:
        clients.remove(websocket)

async def broadcast_login_attempt(username, password, client_ip, timestamp):
    message = f"Login attempt: Username: {username}, Password: {password}, IP: {client_ip}, Time: {timestamp}"
    if clients:
        await asyncio.gather(*[client.send(message) for client in clients])

async def websocket_server():
    async with websockets.serve(register, "localhost", 8765):
        await asyncio.Future()  # Run forever

# HoneyPotServer and HoneyPotSSHServer class
class HoneyPotServer(paramiko.ServerInterface):
    def __init__(self, client_ip):
        self.username = None
        self.password = None
        self.client_ip = client_ip

    def check_auth_password(self, username, password):
        # Log login attempts with username, password, and client IP to database
        print(f"Login attempt from {self.client_ip}: Username: {username}, Password: {password}")
        
        # Log to database and notify WebSocket clients
        log_login_attempt(username, password, self.client_ip)
        
        # Always authenticate successfully
        self.username = username
        self.password = password
        return paramiko.AUTH_SUCCESSFUL

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

# HTTP server to serve the index.html
class HTTPServer:
    def __init__(self, port=80):
        self.port = port

    def start(self):
        os.chdir('.')  # Make sure to change the directory to where index.html is located
        handler = SimpleHTTPRequestHandler
        with TCPServer(('0.0.0.0', self.port), handler) as httpd:
            print(f"Serving index.html on port {self.port}...")
            httpd.serve_forever()

if __name__ == "__main__":
    # Set up database before starting the honeypot server
    setup_database()

    # Start WebSocket server in background
    threading.Thread(target=lambda: asyncio.run(websocket_server())).start()
    
    # Start HTTP server to serve the index.html on port 80
    threading.Thread(target=lambda: HTTPServer(port=80).start()).start()

    # Start the honeypot server
    honeypot = HoneyPotSSHServer()
    honeypot.start()
