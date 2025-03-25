"""FastAPI web application for the SSH Honeypot."""
import json
from fastapi import FastAPI, WebSocket, Depends, Request, Response, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, JSONResponse, PlainTextResponse
from sqlalchemy.orm import Session
from typing import List, Dict, Set, Any
from pathlib import Path
from honeypot.core.config import TEMPLATE_DIR, STATIC_DIR, HOST, WEB_PORT, SSH_PORT, TELNET_PORT, FTP_PORT, SMTP_PORT, RDP_PORT, SIP_PORT, MYSQL_PORT
from honeypot.database.models import get_db, LoginAttempt
from honeypot.core.system_monitor import SystemMonitor
import ipaddress
import logging
import asyncio
import os
import time
import weakref
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

app = FastAPI(title="Honeypot Monitor")

# Initialize system monitor
services = {
    "ssh": SSH_PORT,
    "telnet": TELNET_PORT,
    "ftp": FTP_PORT,
    "smtp": SMTP_PORT,
    "rdp": RDP_PORT,
    "sip": SIP_PORT,
    "mysql": MYSQL_PORT
}
system_monitor = SystemMonitor(services)

# Mount static files directory
static_path = Path(STATIC_DIR)
if static_path.exists():
    app.mount("/static", StaticFiles(directory=str(static_path)), name="static")

# Set up templates
templates = Jinja2Templates(directory=str(TEMPLATE_DIR))

# Enhanced WebSocket connection tracking
class ConnectionManager:
    def __init__(self):
        # Track connections with metadata: {websocket: {last_seen: timestamp, client_info: str, ...}}
        self.active_connections: Dict[WebSocket, Dict[str, Any]] = {}
        self.cleanup_task = None
        self.lock = asyncio.Lock()
    
    async def connect(self, websocket: WebSocket, client_info: str) -> None:
        """Register a new connection with metadata"""
        async with self.lock:
            self.active_connections[websocket] = {
                'client_info': client_info,
                'connected_at': datetime.now(),
                'last_active': datetime.now(),
                'ping_success': True,
                'messages_sent': 0,
                'messages_received': 0
            }
            # Start cleanup task if not already running
            if self.cleanup_task is None or self.cleanup_task.done():
                self.cleanup_task = asyncio.create_task(self.periodic_cleanup())
    
    async def disconnect(self, websocket: WebSocket) -> None:
        """Remove a connection"""
        async with self.lock:
            if websocket in self.active_connections:
                del self.active_connections[websocket]
                logger.info(f"Removed websocket from active connections, {len(self.active_connections)} remaining")
    
    def get_connection_info(self, websocket: WebSocket) -> Dict[str, Any]:
        """Get metadata for a specific connection"""
        return self.active_connections.get(websocket, {})
    
    def update_activity(self, websocket: WebSocket) -> None:
        """Update the last_active timestamp for a connection"""
        if websocket in self.active_connections:
            self.active_connections[websocket]['last_active'] = datetime.now()
            self.active_connections[websocket]['messages_received'] += 1
    
    def update_ping_status(self, websocket: WebSocket, success: bool) -> None:
        """Update the ping status for a connection"""
        if websocket in self.active_connections:
            self.active_connections[websocket]['ping_success'] = success
            if success:
                self.active_connections[websocket]['last_active'] = datetime.now()
    
    async def send_text(self, websocket: WebSocket, message: str) -> bool:
        """Send text to a connection and track success"""
        try:
            await websocket.send_text(message)
            if websocket in self.active_connections:
                self.active_connections[websocket]['last_active'] = datetime.now()
                self.active_connections[websocket]['messages_sent'] += 1
            return True
        except Exception as e:
            logger.warning(f"Failed to send message to client: {str(e)}")
            await self.disconnect(websocket)
            return False
    
    async def broadcast(self, message: str) -> int:
        """Broadcast a message to all connections and return success count"""
        success_count = 0
        failed_connections = []
        
        # First attempt to send to all clients
        connections = list(self.active_connections.keys())  # Make a copy to avoid modification during iteration
        for websocket in connections:
            try:
                await websocket.send_text(message)
                self.active_connections[websocket]['last_active'] = datetime.now()
                self.active_connections[websocket]['messages_sent'] += 1
                success_count += 1
            except Exception as e:
                logger.warning(f"Failed to send to {self.active_connections[websocket]['client_info']}: {str(e)}")
                failed_connections.append(websocket)
        
        # Clean up failed connections
        async with self.lock:
            for websocket in failed_connections:
                if websocket in self.active_connections:
                    del self.active_connections[websocket]
        
        return success_count
    
    async def verify_connections(self) -> None:
        """Send a ping to all connections to verify they're still active"""
        logger.debug("Verifying all active WebSocket connections")
        connections = list(self.active_connections.keys())
        
        for websocket in connections:
            client_info = self.active_connections[websocket]['client_info']
            last_active = self.active_connections[websocket]['last_active']
            
            # If connection hasn't been active in the last 2 minutes, check it
            if datetime.now() - last_active > timedelta(minutes=2):
                logger.debug(f"Pinging inactive connection from {client_info}")
                try:
                    # Send a ping and wait for pong
                    pong_waiter = await websocket.ping()
                    await asyncio.wait_for(pong_waiter, timeout=5)
                    logger.debug(f"Ping successful for {client_info}")
                    self.update_ping_status(websocket, True)
                except Exception as e:
                    logger.warning(f"Connection verification failed for {client_info}: {str(e)}")
                    self.update_ping_status(websocket, False)
    
    async def periodic_cleanup(self) -> None:
        """Periodically clean up stale connections"""
        try:
            while True:
                # Run verification and cleanup every 5 minutes
                await asyncio.sleep(300)
                await self.verify_connections()
                
                async with self.lock:
                    # Calculate stale cutoff time (10 minutes)
                    stale_cutoff = datetime.now() - timedelta(minutes=10)
                    connections = list(self.active_connections.keys())
                    
                    stale_count = 0
                    for websocket in connections:
                        client_info = self.active_connections[websocket]['client_info']
                        last_active = self.active_connections[websocket]['last_active']
                        ping_success = self.active_connections[websocket]['ping_success']
                        
                        # Remove stale connections: either too old or failed ping
                        if last_active < stale_cutoff or not ping_success:
                            logger.info(f"Cleaning up stale connection from {client_info} (last active: {last_active})")
                            try:
                                await websocket.close(code=1000, reason="Connection timeout")
                            except:
                                pass
                            
                            if websocket in self.active_connections:
                                del self.active_connections[websocket]
                                stale_count += 1
                
                if stale_count > 0:
                    logger.info(f"Cleaned up {stale_count} stale connections, {len(self.active_connections)} remaining")
                else:
                    logger.debug(f"No stale connections found, {len(self.active_connections)} connections active")
                
                # Log connection statistics
                if self.active_connections:
                    total_sent = sum(conn['messages_sent'] for conn in self.active_connections.values())
                    total_received = sum(conn['messages_received'] for conn in self.active_connections.values())
                    logger.info(f"WebSocket stats: {len(self.active_connections)} connections, {total_sent} msgs sent, {total_received} msgs received")
        
        except asyncio.CancelledError:
            logger.info("Connection cleanup task cancelled")
        except Exception as e:
            logger.error(f"Error in connection cleanup task: {str(e)}")
            # Restart the task on failure
            await asyncio.sleep(60)
            self.cleanup_task = asyncio.create_task(self.periodic_cleanup())

# Initialize connection manager
connection_manager = ConnectionManager()

# For backwards compatibility, maintain a list view of active connections
@property
def active_connections() -> List[WebSocket]:
    return list(connection_manager.active_connections.keys())

@app.on_event("startup")
async def startup_event():
    """Run startup tasks"""
    # Start the connection verification task
    asyncio.create_task(connection_manager.periodic_cleanup())
    logger.info("Started WebSocket connection management tasks")

@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    """Serve the main HTML page."""
    return templates.TemplateResponse(
        "index.html",
        {
            "request": request,
            "ws_host": HOST,
            "ws_port": WEB_PORT
        }
    )

@app.get("/api/system/external-ip")
async def get_external_ip():
    """Get the external IP address (fallback API for when WebSockets aren't available)."""
    ip = system_monitor.get_external_ip()
    return JSONResponse({"ip": ip})

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, db: Session = Depends(get_db)):
    """Handle WebSocket connections."""
    client_info = f"{websocket.client.host}:{websocket.client.port}"
    logger.info(f"New WebSocket connection from {client_info}")
    
    try:
        await websocket.accept()
        await connection_manager.connect(websocket, client_info)
        logger.info(f"Accepted WebSocket connection from {client_info}")
        
        # Create a task for periodic system metrics updates
        periodic_task = asyncio.create_task(send_periodic_updates(websocket))
        
        try:
            while True:
                # Wait for messages from the client with a timeout
                try:
                    message_text = await asyncio.wait_for(websocket.receive_text(), timeout=60)
                    connection_manager.update_activity(websocket)
                    
                    try:
                        message = json.loads(message_text)
                        message_type = message.get('type')
                        logger.debug(f"Received message of type '{message_type}' from {client_info}")
                        
                        # Handle different message types
                        if message_type == 'request_system_metrics':
                            # Send both system metrics and service status on request
                            await send_system_metrics(websocket)
                            await send_service_status(websocket)
                        elif message_type == 'request_external_ip':
                            # Send external IP on request
                            await send_external_ip(websocket)
                        elif message_type == 'request_attempts':
                            # Send attempts data on request (legacy method)
                            logger.info(f"Client {client_info} requested data via legacy method")
                            attempts = db.query(LoginAttempt).order_by(LoginAttempt.timestamp.desc()).all()
                            attempts_data = [attempt.to_dict() for attempt in attempts]
                            message = {
                                'type': 'initial_attempts',
                                'data': attempts_data
                            }
                            await connection_manager.send_text(websocket, json.dumps(message))
                        elif message_type == 'request_data_batches':
                            # Send data in batches
                            logger.info(f"Client {client_info} requested data in batches")
                            await send_data_in_batches(websocket, db)
                        elif message_type == 'batch_ack':
                            # Client acknowledged receipt of a batch
                            batch_number = message.get('data', {}).get('batch_number')
                            logger.debug(f"Client {client_info} acknowledged receipt of batch {batch_number}")
                        elif message_type == 'request_missing_batches':
                            # Client requested specific missing batches
                            missing_batches = message.get('data', {}).get('batch_numbers', [])
                            logger.info(f"Client {client_info} requested missing batches: {missing_batches}")
                            await send_specific_batches(websocket, db, missing_batches)
                        elif message_type == 'heartbeat':
                            # Client heartbeat - just update the last active timestamp
                            logger.debug(f"Received heartbeat from {client_info}")
                            # Send a heartbeat response
                            await connection_manager.send_text(websocket, json.dumps({
                                'type': 'heartbeat_response',
                                'data': {'timestamp': datetime.now().isoformat()}
                            }))
                        else:
                            logger.warning(f"Received unknown message type '{message_type}' from {client_info}")
                    except json.JSONDecodeError:
                        logger.warning(f"Received invalid JSON from {client_info}: {message_text}")
                    except Exception as e:
                        logger.error(f"Error processing WebSocket message from {client_info}: {str(e)}")
                except asyncio.TimeoutError:
                    # No message received within timeout, check if client is still connected
                    try:
                        # Send a ping to check connection
                        pong_waiter = await websocket.ping()
                        await asyncio.wait_for(pong_waiter, timeout=5)
                        logger.debug(f"Ping-pong successful for {client_info}")
                        connection_manager.update_ping_status(websocket, True)
                    except Exception:
                        logger.info(f"Client {client_info} did not respond to ping, closing connection")
                        connection_manager.update_ping_status(websocket, False)
                        break
        except Exception as e:
            logger.error(f"WebSocket connection error with {client_info}: {str(e)}")
        finally:
            # Clean up
            periodic_task.cancel()
            await connection_manager.disconnect(websocket)
            logger.info(f"Removed {client_info} from active connections")
    except Exception as e:
        logger.error(f"Error accepting WebSocket connection from {client_info}: {str(e)}")
        try:
            await websocket.close(code=1011, reason=f"Server error: {str(e)}")
        except:
            pass

async def send_system_metrics(websocket: WebSocket):
    """Send system metrics to a specific client."""
    metrics = system_monitor.get_system_metrics()
    message = {
        'type': 'system_metrics',
        'data': metrics
    }
    await connection_manager.send_text(websocket, json.dumps(message))

async def send_service_status(websocket: WebSocket):
    """Send service status to a specific client."""
    status = system_monitor.get_service_status()
    message = {
        'type': 'service_status',
        'data': status
    }
    await connection_manager.send_text(websocket, json.dumps(message))

async def send_external_ip(websocket: WebSocket):
    """Send external IP to a specific client."""
    try:
        ip = system_monitor.get_external_ip()
        logger.info(f"Retrieved external IP: {ip}")
        message = {
            'type': 'external_ip',
            'data': {'ip': ip}  # Always use a consistent structure
        }
        logger.debug(f"Sending external IP message: {message}")
        await connection_manager.send_text(websocket, json.dumps(message))
        logger.info("External IP message sent successfully")
        
        # Check what we're sending (for debugging)
        debug_info = {
            'ip_value': ip,
            'ip_type': type(ip).__name__,
            'message_type': type(message).__name__,
            'message_json': json.dumps(message)
        }
        logger.debug(f"External IP debug info: {debug_info}")
        
    except Exception as e:
        logger.error(f"Error sending external IP: {str(e)}")
        # Try to send a fallback message
        try:
            message = {
                'type': 'external_ip',
                'data': {'ip': 'Connection error'}
            }
            await connection_manager.send_text(websocket, json.dumps(message))
        except:
            pass

async def send_periodic_updates(websocket: WebSocket):
    """Send periodic system metrics updates to a client."""
    try:
        while True:
            # Send metrics every 5 seconds
            await asyncio.sleep(5)
            
            # Only send if connection is still active
            if websocket in connection_manager.active_connections:
                await send_system_metrics(websocket)
                
                # Send service status every 10 seconds
                if websocket in connection_manager.active_connections and (asyncio.get_event_loop().time() % 10) < 5:
                    await send_service_status(websocket)
                    
                # Send a heartbeat to keep track of activity
                if websocket in connection_manager.active_connections and (asyncio.get_event_loop().time() % 30) < 5:
                    client_info = connection_manager.get_connection_info(websocket).get('client_info', 'unknown')
                    logger.debug(f"Sending server heartbeat to {client_info}")
                    try:
                        message = {
                            'type': 'server_heartbeat',
                            'data': {
                                'timestamp': datetime.now().isoformat(),
                                'uptime': time.time() - connection_manager.get_connection_info(websocket).get('connected_at', datetime.now()).timestamp()
                            }
                        }
                        await connection_manager.send_text(websocket, json.dumps(message))
                    except Exception as e:
                        logger.warning(f"Failed to send heartbeat: {str(e)}")
            else:
                # Connection is not active anymore
                break
    except asyncio.CancelledError:
        # Task was cancelled, do cleanup
        pass
    except Exception as e:
        logger.error(f"Error in periodic updates: {str(e)}")
        # Don't need to remove from connections here as send_text will handle it

@app.get("/api/attempts")
def get_attempts(db: Session = Depends(get_db)):
    """Get all login attempts (legacy endpoint).
    
    WebSocket connection is the required method for retrieving attempts.
    This endpoint is only kept for backward compatibility and may be removed in the future.
    """
    attempts = db.query(LoginAttempt).order_by(LoginAttempt.timestamp.desc()).all()
    
    # Add a warning header to indicate that this endpoint is deprecated
    response = JSONResponse([attempt.to_dict() for attempt in attempts])
    response.headers["X-API-Warning"] = "This endpoint is deprecated. Please use WebSocket connection for data retrieval."
    
    return response

@app.get("/api/export/plaintext")
def export_plaintext(db: Session = Depends(get_db), download: bool = False):
    """Export all login attempts in plaintext format."""
    ips = db.query(LoginAttempt.client_ip).distinct().all()
    # Convert IPs to a list and sort them numerically using ipaddress module
    ip_list = sorted([ip[0] for ip in ips], key=lambda x: int(ipaddress.ip_address(x)))
    ip_text = "\n".join(ip_list)
    
    if download:
        return PlainTextResponse(ip_text, headers={
            "Content-Disposition": "attachment; filename=attempted_ips.txt"
        })
    return PlainTextResponse(ip_text)

@app.get("/api/export/json")
def export_json(db: Session = Depends(get_db), download: bool = False):
    """Export all login attempts in JSON format."""
    attempts = db.query(LoginAttempt).all()
    attempts_data = []
    
    for attempt in attempts:
        attempt_dict = {
            "client_ip": attempt.client_ip,
            "username": attempt.username,
            "password": attempt.password,
            "protocol": attempt.protocol.value if attempt.protocol else None,
            "country": attempt.country,
            "city": attempt.city,
            "region": attempt.region,
            "latitude": attempt.latitude,
            "longitude": attempt.longitude
        }
        
        # Handle timestamp conversion safely
        if attempt.timestamp:
            attempt_dict["timestamp"] = attempt.timestamp.isoformat()
        else:
            attempt_dict["timestamp"] = None
            
        attempts_data.append(attempt_dict)
    
    json_data = json.dumps(attempts_data, indent=2)
    
    if download:
        return Response(
            json_data,
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=login_attempts.json"}
        )
    return Response(json_data, media_type="application/json")

@app.get("/api/export/csv")
def export_csv(db: Session = Depends(get_db), download: bool = False):
    """Export all login attempts in CSV format."""
    attempts = db.query(LoginAttempt).all()
    
    # Create CSV header
    csv_data = "timestamp,protocol,client_ip,username,password,country,city,region,latitude,longitude\n"
    
    def escape_field(value):
        """Helper to properly escape and quote CSV fields."""
        if value is None or value == "":
            return ""
        # Replace double quotes with two double quotes and wrap in quotes
        return '"{}"'.format(str(value).replace('"', '""'))
    
    # Add data rows
    for attempt in attempts:
        row = [
            attempt.timestamp.isoformat() if attempt.timestamp else "",
            attempt.protocol.value if attempt.protocol else "",
            attempt.client_ip or "",
            escape_field(attempt.username),
            escape_field(attempt.password),
            escape_field(attempt.country),
            escape_field(attempt.city),
            escape_field(attempt.region),
            str(attempt.latitude) if attempt.latitude is not None else "",
            str(attempt.longitude) if attempt.longitude is not None else ""
        ]
        csv_data += ",".join(row) + "\n"
    
    if download:
        return Response(
            csv_data,
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=login_attempts.csv"}
        )
    return Response(csv_data, media_type="text/csv")

async def broadcast_attempt(attempt: dict):
    """Broadcast a login attempt to all connected clients."""
    message = {
        'type': 'login_attempt',
        'data': attempt
    }
    message_json = json.dumps(message)
    
    # Use the connection manager to broadcast the message
    success_count = await connection_manager.broadcast(message_json)
    
    logger.debug(f"Broadcast login attempt to {success_count} clients")
    return success_count

async def send_data_in_batches(websocket: WebSocket, db: Session):
    """Send login attempts data in batches to a client."""
    client_info = f"{websocket.client.host}:{websocket.client.port}"
    batch_tracking = {}
    
    try:
        # Get all attempts
        logger.info(f"Retrieving data for batch transmission to {client_info}")
        attempts = db.query(LoginAttempt).order_by(LoginAttempt.timestamp.desc()).all()
        attempts_data = [attempt.to_dict() for attempt in attempts]
        
        # Determine batch size based on total data
        # Smaller batches for larger datasets
        total_attempts = len(attempts_data)
        logger.info(f"Total attempts to send to {client_info}: {total_attempts}")
        
        if total_attempts <= 100:
            batch_size = total_attempts  # Send all at once if small dataset
        elif total_attempts <= 1000:
            batch_size = 100
        elif total_attempts <= 10000:
            batch_size = 500
        else:
            batch_size = 1000
        
        # Calculate number of batches
        total_batches = (total_attempts + batch_size - 1) // batch_size
        logger.info(f"Sending {total_attempts} attempts in {total_batches} batches to {client_info}")
        
        # Send batch start message
        start_message = {
            'type': 'batch_start',
            'data': {
                'total_attempts': total_attempts,
                'total_batches': total_batches
            }
        }
        await connection_manager.send_text(websocket, json.dumps(start_message))
        
        # Send each batch
        for i in range(total_batches):
            start_idx = i * batch_size
            end_idx = min(start_idx + batch_size, total_attempts)
            
            # Track batch start time
            batch_num = i + 1
            batch_tracking[batch_num] = {'start_time': asyncio.get_event_loop().time()}
            
            batch_data = attempts_data[start_idx:end_idx]
            batch_message = {
                'type': 'batch_data',
                'data': {
                    'batch_number': batch_num,
                    'total_batches': total_batches,
                    'attempts': batch_data
                }
            }
            
            # Add small delay between batches to avoid overwhelming client
            if i > 0:
                await asyncio.sleep(0.05)
            
            # Send the batch with retry logic
            success = False
            retry_count = 0
            max_retries = 3
            
            while not success and retry_count < max_retries:
                try:
                    success = await connection_manager.send_text(websocket, json.dumps(batch_message))
                    if success:
                        # Track batch completion time
                        batch_tracking[batch_num]['end_time'] = asyncio.get_event_loop().time()
                        batch_tracking[batch_num]['status'] = 'sent'
                        batch_size_kb = len(json.dumps(batch_message)) / 1024
                        
                        logger.info(f"Sent batch {batch_num}/{total_batches} with {len(batch_data)} attempts ({batch_size_kb:.2f} KB) to {client_info}")
                    else:
                        raise Exception("Failed to send message")
                except Exception as e:
                    retry_count += 1
                    if retry_count < max_retries:
                        logger.warning(f"Failed to send batch {batch_num}/{total_batches} to {client_info}, retrying ({retry_count}/{max_retries}): {str(e)}")
                        await asyncio.sleep(0.5)  # Wait before retry
                    else:
                        logger.error(f"Failed to send batch {batch_num}/{total_batches} to {client_info} after {max_retries} attempts: {str(e)}")
                        batch_tracking[batch_num]['status'] = 'failed'
                        # If we can't send a batch, the client might have disconnected
                        raise
        
        # Send completion message
        complete_message = {
            'type': 'batch_complete',
            'data': {
                'total_attempts': total_attempts,
                'total_batches': total_batches
            }
        }
        await connection_manager.send_text(websocket, json.dumps(complete_message))
        
        # Calculate and log batch transfer statistics
        sent_batches = sum(1 for batch in batch_tracking.values() if batch.get('status') == 'sent')
        if sent_batches == total_batches:
            total_time = batch_tracking[total_batches]['end_time'] - batch_tracking[1]['start_time']
            avg_batch_time = total_time / total_batches
            logger.info(f"Completed sending all {total_batches} batches to {client_info} in {total_time:.2f}s (avg {avg_batch_time:.2f}s per batch)")
        else:
            logger.warning(f"Only sent {sent_batches}/{total_batches} batches to {client_info}")
        
    except Exception as e:
        logger.error(f"Error sending data in batches to {client_info}: {str(e)}")
        # If there was an error during batch send, try to send a failure message to the client
        try:
            error_message = {
                'type': 'batch_error',
                'data': {
                    'error': str(e),
                    'message': 'Error occurred during batch data transmission'
                }
            }
            await connection_manager.send_text(websocket, json.dumps(error_message))
        except:
            pass

async def send_specific_batches(websocket: WebSocket, db: Session, batch_numbers: List[int]):
    """Send specific batches to a client that requested missing batches."""
    client_info = f"{websocket.client.host}:{websocket.client.port}"
    
    try:
        # Get all attempts
        attempts = db.query(LoginAttempt).order_by(LoginAttempt.timestamp.desc()).all()
        attempts_data = [attempt.to_dict() for attempt in attempts]
        
        # Determine batch size based on total data
        total_attempts = len(attempts_data)
        
        if total_attempts <= 100:
            batch_size = total_attempts
        elif total_attempts <= 1000:
            batch_size = 100
        elif total_attempts <= 10000:
            batch_size = 500
        else:
            batch_size = 1000
        
        # Calculate number of batches
        total_batches = (total_attempts + batch_size - 1) // batch_size
        
        # Send each requested batch
        for batch_num in batch_numbers:
            if 1 <= batch_num <= total_batches:
                start_idx = (batch_num - 1) * batch_size
                end_idx = min(start_idx + batch_size, total_attempts)
                
                batch_data = attempts_data[start_idx:end_idx]
                batch_message = {
                    'type': 'batch_data',
                    'data': {
                        'batch_number': batch_num,
                        'total_batches': total_batches,
                        'attempts': batch_data
                    }
                }
                
                # Add small delay between batches
                await asyncio.sleep(0.05)
                
                success = await connection_manager.send_text(websocket, json.dumps(batch_message))
                if success:
                    logger.info(f"Sent missing batch {batch_num}/{total_batches} with {len(batch_data)} attempts to {client_info}")
            else:
                logger.warning(f"Requested invalid batch number: {batch_num} from {client_info}")
        
        # Send completion message
        complete_message = {
            'type': 'batch_complete',
            'data': {
                'total_attempts': total_attempts,
                'total_batches': total_batches
            }
        }
        await connection_manager.send_text(websocket, json.dumps(complete_message))
        logger.info(f"Completed sending requested missing batches to {client_info}")
        
    except Exception as e:
        logger.error(f"Error sending specific batches to {client_info}: {str(e)}")
        # Connection manager will handle disconnection if needed 