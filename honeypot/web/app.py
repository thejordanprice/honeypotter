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
from honeypot.web.utility import versioned_static
from honeypot.web.static_handler import VersionedStaticFiles
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
    app.mount("/static", VersionedStaticFiles(directory=str(static_path)), name="static")

# Set up templates
templates = Jinja2Templates(directory=str(TEMPLATE_DIR))
# Register the versioned_static function with the templates
templates.env.globals["versioned_static"] = versioned_static

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
                # Run verification and cleanup every 60 seconds instead of 5 minutes (300 seconds)
                await asyncio.sleep(60)
                
                # Check memory usage
                try:
                    import psutil
                    process = psutil.Process(os.getpid())
                    memory_info = process.memory_info()
                    memory_usage_mb = memory_info.rss / 1024 / 1024
                    logger.info(f"Current memory usage: {memory_usage_mb:.2f} MB with {len(self.active_connections)} active connections")
                    
                    # If memory usage is high (> 1GB), force more aggressive cleanup
                    if memory_usage_mb > 1024:
                        logger.warning(f"High memory usage detected: {memory_usage_mb:.2f} MB. Performing aggressive connection cleanup.")
                        # Reduce stale timeout to 5 minutes instead of 10 during high memory usage
                        stale_cutoff = datetime.now() - timedelta(minutes=5)
                    else:
                        stale_cutoff = datetime.now() - timedelta(minutes=10)
                except ImportError:
                    logger.warning("psutil not installed. Memory monitoring disabled.")
                    stale_cutoff = datetime.now() - timedelta(minutes=10)
                except Exception as e:
                    logger.error(f"Error monitoring memory: {str(e)}")
                    stale_cutoff = datetime.now() - timedelta(minutes=10)
                
                # Verify connections before cleanup
                try:
                    await self.verify_connections()
                except Exception as e:
                    logger.error(f"Error in connection verification: {str(e)}")
                
                # Perform cleanup with stronger error handling
                try:
                    async with self.lock:
                        connections = list(self.active_connections.keys())
                        
                        stale_count = 0
                        for websocket in connections:
                            try:
                                client_info = self.active_connections[websocket]['client_info']
                                last_active = self.active_connections[websocket]['last_active']
                                ping_success = self.active_connections[websocket]['ping_success']
                                
                                # Remove stale connections: either too old or failed ping
                                if last_active < stale_cutoff or not ping_success:
                                    logger.info(f"Cleaning up stale connection from {client_info} (last active: {last_active})")
                                    try:
                                        await websocket.close(code=1000, reason="Connection timeout")
                                    except Exception as close_err:
                                        logger.warning(f"Error closing websocket: {str(close_err)}")
                                    
                                    if websocket in self.active_connections:
                                        del self.active_connections[websocket]
                                        stale_count += 1
                            except Exception as conn_err:
                                logger.error(f"Error processing connection during cleanup: {str(conn_err)}")
                                # If we can't process this connection properly, remove it anyway
                                try:
                                    if websocket in self.active_connections:
                                        del self.active_connections[websocket]
                                        stale_count += 1
                                except Exception:
                                    pass
                    
                    if stale_count > 0:
                        logger.info(f"Cleaned up {stale_count} stale connections, {len(self.active_connections)} remaining")
                    else:
                        logger.debug(f"No stale connections found, {len(self.active_connections)} connections active")
                except Exception as cleanup_err:
                    logger.error(f"Error during connection cleanup: {str(cleanup_err)}")
                
                # Log connection statistics
                try:
                    if self.active_connections:
                        total_sent = sum(conn['messages_sent'] for conn in self.active_connections.values())
                        total_received = sum(conn['messages_received'] for conn in self.active_connections.values())
                        logger.info(f"WebSocket stats: {len(self.active_connections)} connections, {total_sent} msgs sent, {total_received} msgs received")
                except Exception as stats_err:
                    logger.error(f"Error calculating connection statistics: {str(stats_err)}")
        
        except asyncio.CancelledError:
            logger.info("Connection cleanup task cancelled")
        except Exception as e:
            logger.error(f"Error in connection cleanup task: {str(e)}")
            # Restart the task on failure after a short delay
            await asyncio.sleep(10)  # Shorter delay before restart (was 60 seconds)
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
    # Check for psutil for memory monitoring
    try:
        import psutil
        logger.info("psutil available - memory monitoring enabled")
    except ImportError:
        logger.warning("psutil not available - consider installing it with 'pip install psutil' to enable memory monitoring")

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

@app.get("/api/system/server-location")
async def get_server_location():
    """Get the server geolocation coordinates (used for attack animations)."""
    location = system_monitor.get_server_location()
    return JSONResponse(location)

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
                # Make sure we handle disconnections and timeouts properly
                try:
                    # Set a timeout for receiving messages to prevent hanging connections
                    message = await asyncio.wait_for(websocket.receive_text(), timeout=60)
                    
                    # Update connection activity timestamp
                    connection_manager.update_activity(websocket)
                    
                    # Process the received message
                    try:
                        data = json.loads(message)
                        message_type = data.get('type')
                        logger.debug(f"Received message of type '{message_type}' from {client_info}")
                        
                        # Handle different message types
                        if message_type == 'request_system_metrics':
                            # Send both system metrics and service status on request
                            await send_system_metrics(websocket)
                            await send_service_status(websocket)
                        elif message_type == 'request_external_ip':
                            # Send external IP on request
                            await send_external_ip(websocket)
                        elif message_type == 'request_server_location':
                            # Send server location on request
                            await send_server_location(websocket)
                        elif message_type == 'request_attempts':
                            # Send attempts data on request (legacy method)
                            logger.info(f"Client {client_info} requested data via legacy method")
                            
                            # Use a dedicated transaction with limit for better performance
                            try:
                                db.begin()
                                
                                # Set a reasonable fetch limit to prevent memory issues
                                # and add timeout to prevent long-running queries
                                try:
                                    db.execute("SET statement_timeout = '10s'")
                                except:
                                    pass
                                
                                # Limit result set for the legacy method
                                attempts = db.query(LoginAttempt).order_by(
                                    LoginAttempt.timestamp.desc()
                                ).limit(5000).all()
                                
                                attempts_data = [attempt.to_dict() for attempt in attempts]
                                message = {
                                    'type': 'initial_attempts',
                                    'data': attempts_data
                                }
                                await connection_manager.send_text(websocket, json.dumps(message))
                                
                                # Explicitly commit and clear session
                                db.commit()
                                db.expire_all()
                                
                            except Exception as db_err:
                                logger.error(f"Database error handling legacy request from {client_info}: {str(db_err)}")
                                db.rollback()
                                error_message = {
                                    'type': 'error',
                                    'message': 'Failed to retrieve login attempts'
                                }
                                await connection_manager.send_text(websocket, json.dumps(error_message))
                        elif message_type == 'request_data_batches':
                            # Send data in batches
                            logger.info(f"Client {client_info} requested data in batches")
                            await send_data_in_batches(websocket, db)
                        elif message_type == 'batch_ack':
                            # Client acknowledged receipt of a batch
                            batch_number = data.get('data', {}).get('batch_number')
                            logger.debug(f"Client {client_info} acknowledged receipt of batch {batch_number}")
                        elif message_type == 'request_missing_batches':
                            # Client requested specific missing batches
                            missing_batches = data.get('data', {}).get('batch_numbers', [])
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
                        elif message_type == 'ping':
                            # Client ping (especially after sleep/wake) - respond immediately with pong
                            logger.debug(f"Received ping from {client_info}, responding with pong")
                            # Send a pong response
                            await connection_manager.send_text(websocket, json.dumps({
                                'type': 'pong',
                                'data': {'timestamp': datetime.now().isoformat()}
                            }))
                        else:
                            logger.warning(f"Received unknown message type '{message_type}' from {client_info}")
                            await connection_manager.send_text(websocket, json.dumps({
                                'type': 'error',
                                'message': f"Unknown message type: {message_type}"
                            }))
                    except json.JSONDecodeError:
                        logger.warning(f"Received invalid JSON from client {client_info}: {message}")
                        await connection_manager.send_text(websocket, json.dumps({"type": "error", "message": "Invalid JSON format"}))
                    except Exception as msg_err:
                        logger.error(f"Error processing message from {client_info}: {str(msg_err)}")
                        await connection_manager.send_text(websocket, json.dumps({"type": "error", "message": "Error processing message"}))
                        
                except asyncio.TimeoutError:
                    # This is normal - we use the timeout to regularly check connection health
                    try:
                        # Send a ping to check connection
                        pong_waiter = await websocket.ping()
                        await asyncio.wait_for(pong_waiter, timeout=5)
                        logger.debug(f"Ping-pong successful for {client_info}")
                        connection_manager.update_ping_status(websocket, True)
                    except Exception as ping_err:
                        logger.info(f"Client {client_info} did not respond to ping: {str(ping_err)}")
                        connection_manager.update_ping_status(websocket, False)
                        break
                except Exception as e:
                    logger.warning(f"WebSocket receive error for {client_info}: {str(e)}")
                    break
                    
        except Exception as e:
            logger.error(f"Error in WebSocket loop for {client_info}: {str(e)}")
        finally:
            # Make sure we cancel the periodic task
            if 'periodic_task' in locals() and not periodic_task.done():
                periodic_task.cancel()
                try:
                    await periodic_task
                except asyncio.CancelledError:
                    pass
                
    except Exception as e:
        logger.error(f"Error establishing WebSocket connection with {client_info}: {str(e)}")
    finally:
        # Make sure we clean up the connection
        try:
            await connection_manager.disconnect(websocket)
        except Exception as cleanup_err:
            logger.error(f"Error during connection cleanup: {str(cleanup_err)}")

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
        
        # Remove the automatic server location send to prevent duplicate data
        # Do not send server location from here as it's requested separately
        
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

async def send_server_location(websocket: WebSocket):
    """Send server geolocation coordinates to a specific client."""
    try:
        location = system_monitor.get_server_location()
        logger.info(f"Retrieved server location: {location}")
        message = {
            'type': 'server_location',
            'data': location
        }
        logger.debug(f"Sending server location message: {message}")
        await connection_manager.send_text(websocket, json.dumps(message))
        logger.info("Server location message sent successfully")
    except Exception as e:
        logger.error(f"Error sending server location: {str(e)}")

async def send_periodic_updates(websocket: WebSocket):
    """Send periodic system metrics updates to a client."""
    try:
        # Initial metrics check to determine system load
        metrics = system_monitor.get_system_metrics()
        high_load = metrics.get('cpu', {}).get('percent', 0) > 70
        
        # Track consecutive high load periods for adaptive scheduling
        consecutive_high_load = 0
        update_interval = 5  # Default update interval in seconds
        
        while True:
            # Adjust update frequency based on system load
            if high_load:
                consecutive_high_load += 1
                # Scale back frequency during high load periods
                if consecutive_high_load >= 3:
                    # After 3 consecutive high load periods, use longer interval
                    update_interval = 15
                    logger.debug("System under sustained high load, reducing update frequency")
                else:
                    update_interval = 10
                    logger.debug("System under high load, slightly reducing update frequency")
            else:
                consecutive_high_load = 0
                update_interval = 5  # Normal update interval during normal load
            
            # Wait based on the adaptive interval
            await asyncio.sleep(update_interval)
            
            # Only send if connection is still active
            if websocket in connection_manager.active_connections:
                # Get metrics (this will use the cached version if appropriate)
                metrics = system_monitor.get_system_metrics()
                
                # Update high load flag for next iteration
                high_load = metrics.get('cpu', {}).get('percent', 0) > 70
                
                # Send metrics to client
                message = {
                    'type': 'system_metrics',
                    'data': metrics
                }
                await connection_manager.send_text(websocket, json.dumps(message))
                
                # Send service status less frequently, especially during high load
                service_status_interval = 30 if high_load else 10
                if websocket in connection_manager.active_connections and (asyncio.get_event_loop().time() % service_status_interval) < update_interval:
                    await send_service_status(websocket)
                    
                # Send server location updates occasionally (every few minutes to handle IP changes)
                location_interval = 300  # Send location every 5 minutes
                if websocket in connection_manager.active_connections and (asyncio.get_event_loop().time() % location_interval) < update_interval:
                    await send_server_location(websocket)
                    
                # Send a heartbeat to keep track of activity (scaled back during high load)
                heartbeat_interval = 60 if high_load else 30
                if websocket in connection_manager.active_connections and (asyncio.get_event_loop().time() % heartbeat_interval) < update_interval:
                    client_info = connection_manager.get_connection_info(websocket).get('client_info', 'unknown')
                    logger.debug(f"Sending server heartbeat to {client_info}")
                    try:
                        message = {
                            'type': 'server_heartbeat',
                            'data': {
                                'timestamp': datetime.now().isoformat(),
                                'uptime': time.time() - connection_manager.get_connection_info(websocket).get('connected_at', datetime.now()).timestamp(),
                                'update_interval': update_interval  # Let client know about current update interval
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
    try:
        # Use an explicit transaction
        db.begin()
        
        # Set statement timeout (PostgreSQL only)
        try:
            db.execute("SET statement_timeout = '10s'")
        except:
            pass
            
        # Use more efficient query with limit
        attempts = db.query(LoginAttempt).order_by(LoginAttempt.timestamp.desc()).limit(5000).all()
        
        # Create response data
        response_data = [attempt.to_dict() for attempt in attempts]
        
        # Explicitly commit to ensure transaction is closed
        db.commit()
        
        # Add a warning header to indicate that this endpoint is deprecated
        response = JSONResponse(response_data)
        response.headers["X-API-Warning"] = "This endpoint is deprecated. Please use WebSocket connection for data retrieval."
        
        return response
    except Exception as e:
        # Ensure transaction is rolled back on error
        db.rollback()
        logger.error(f"Error retrieving attempts: {str(e)}")
        return JSONResponse({"error": "Failed to retrieve login attempts"}, status_code=500)

@app.get("/api/export/plaintext")
def export_plaintext(db: Session = Depends(get_db), download: bool = False):
    """Export all login attempts in plaintext format."""
    try:
        # Use an explicit transaction
        db.begin()
        
        # Only select distinct IPs directly in the query for efficiency
        ips = db.query(LoginAttempt.client_ip).distinct().all()
        
        # Convert IPs to a list and sort them numerically using ipaddress module
        ip_list = sorted([ip[0] for ip in ips], key=lambda x: int(ipaddress.ip_address(x)))
        ip_text = "\n".join(ip_list)
        
        # Explicitly commit to ensure transaction is closed
        db.commit()
        
        if download:
            return PlainTextResponse(ip_text, headers={
                "Content-Disposition": "attachment; filename=attempted_ips.txt"
            })
        return PlainTextResponse(ip_text)
    except Exception as e:
        # Ensure transaction is rolled back on error
        db.rollback()
        logger.error(f"Error exporting plaintext: {str(e)}")
        return PlainTextResponse(f"Error exporting data: {str(e)}", status_code=500)

@app.get("/api/export/json")
def export_json(db: Session = Depends(get_db), download: bool = False):
    """Export all login attempts in JSON format."""
    try:
        # Use an explicit transaction with chunked processing
        db.begin()
        
        # Get total count for chunking
        total_count = db.query(LoginAttempt).count()
        attempts_data = []
        
        # Process large results in chunks to avoid memory issues
        CHUNK_SIZE = 5000
        
        if total_count > CHUNK_SIZE:
            logger.info(f"Processing large JSON export ({total_count} records) in chunks")
            
            for offset in range(0, total_count, CHUNK_SIZE):
                chunk = db.query(LoginAttempt).limit(CHUNK_SIZE).offset(offset).all()
                
                for attempt in chunk:
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
                
                # Clear SQLAlchemy's identity map between chunks
                db.expire_all()
        else:
            # Small enough to process at once
            attempts = db.query(LoginAttempt).all()
            
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
        
        # Explicitly commit to ensure transaction is closed
        db.commit()
        
        # Generate JSON response with streaming for large datasets
        json_data = json.dumps(attempts_data, indent=2)
        
        if download:
            return Response(
                json_data,
                media_type="application/json",
                headers={"Content-Disposition": "attachment; filename=login_attempts.json"}
            )
        return Response(json_data, media_type="application/json")
    except Exception as e:
        # Ensure transaction is rolled back on error
        db.rollback()
        logger.error(f"Error exporting JSON: {str(e)}")
        return JSONResponse({"error": f"Failed to export data: {str(e)}"}, status_code=500)

@app.get("/api/export/csv")
def export_csv(db: Session = Depends(get_db), download: bool = False):
    """Export all login attempts in CSV format."""
    try:
        # Use an explicit transaction with chunked processing
        db.begin()
        
        # Get total count for chunking
        total_count = db.query(LoginAttempt).count()
        
        # Create CSV header
        csv_data = "timestamp,protocol,client_ip,username,password,country,city,region,latitude,longitude\n"
        
        def escape_field(value):
            """Helper to properly escape and quote CSV fields."""
            if value is None or value == "":
                return ""
            # Replace double quotes with two double quotes and wrap in quotes
            return '"{}"'.format(str(value).replace('"', '""'))
        
        # Process large results in chunks to avoid memory issues
        CHUNK_SIZE = 5000
        
        if total_count > CHUNK_SIZE:
            logger.info(f"Processing large CSV export ({total_count} records) in chunks")
            
            for offset in range(0, total_count, CHUNK_SIZE):
                chunk = db.query(LoginAttempt).limit(CHUNK_SIZE).offset(offset).all()
                
                # Add data rows for current chunk
                for attempt in chunk:
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
                
                # Clear SQLAlchemy's identity map between chunks
                db.expire_all()
        else:
            # Small enough to process at once
            attempts = db.query(LoginAttempt).all()
            
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
        
        # Explicitly commit to ensure transaction is closed
        db.commit()
        
        if download:
            return Response(
                csv_data,
                media_type="text/csv",
                headers={"Content-Disposition": "attachment; filename=login_attempts.csv"}
            )
        return Response(csv_data, media_type="text/csv")
    except Exception as e:
        # Ensure transaction is rolled back on error
        db.rollback()
        logger.error(f"Error exporting CSV: {str(e)}")
        return PlainTextResponse(f"Error exporting data: {str(e)}", status_code=500)

@app.get("/api/export/mikrotik")
def export_mikrotik(db: Session = Depends(get_db), download: bool = False):
    """Export Mikrotik router firewall rules to block all attempted IPs."""
    try:
        # Use an explicit transaction
        db.begin()
        
        # Only select distinct IPs directly in the query for efficiency
        ips = db.query(LoginAttempt.client_ip).distinct().all()
        
        # Convert IPs to a list and sort them numerically using ipaddress module
        ip_list = sorted([ip[0] for ip in ips], key=lambda x: int(ipaddress.ip_address(x)))
        
        # Generate Mikrotik firewall rules
        mikrotik_commands = ["# Honeypotter - Mikrotik Firewall Rules", 
                             "# Generated on: " + datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                             "# Total IPs: " + str(len(ip_list)),
                             "",
                             "# Add address list",
                             "/ip firewall address-list"]
        
        # Add each IP to the address list
        for ip in ip_list:
            mikrotik_commands.append(f"add address={ip} list=honeypot-blacklist comment=\"Honeypotter detected attack\"")
        
        # Add firewall filter rule if it doesn't exist
        mikrotik_commands.extend([
            "",
            "# Add firewall filter rule (run once)",
            "/ip firewall filter",
            "add chain=input src-address-list=honeypot-blacklist action=drop comment=\"Block Honeypotter detected attacks\" place-before=0"
        ])
        
        # Join all commands
        mikrotik_text = "\n".join(mikrotik_commands)
        
        # Explicitly commit to ensure transaction is closed
        db.commit()
        
        if download:
            return PlainTextResponse(mikrotik_text, headers={
                "Content-Disposition": "attachment; filename=mikrotik_firewall_rules.rsc"
            })
        return PlainTextResponse(mikrotik_text)
    except Exception as e:
        # Ensure transaction is rolled back on error
        db.rollback()
        logger.error(f"Error exporting Mikrotik rules: {str(e)}")
        return PlainTextResponse(f"Error exporting data: {str(e)}", status_code=500)

@app.get("/api/export/iptables")
def export_iptables(db: Session = Depends(get_db), download: bool = False):
    """Export IPTables firewall rules to block all attempted IPs."""
    try:
        # Use an explicit transaction
        db.begin()
        
        # Only select distinct IPs directly in the query for efficiency
        ips = db.query(LoginAttempt.client_ip).distinct().all()
        
        # Convert IPs to a list and sort them numerically using ipaddress module
        ip_list = sorted([ip[0] for ip in ips], key=lambda x: int(ipaddress.ip_address(x)))
        
        # Generate IPTables firewall rules
        iptables_commands = ["#!/bin/bash", 
                            "# Honeypotter - IPTables Firewall Rules", 
                            "# Generated on: " + datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                            "# Total IPs: " + str(len(ip_list)),
                            "",
                            "# Create a new chain for Honeypotter blocks",
                            "iptables -N HONEYPOTTER 2>/dev/null || iptables -F HONEYPOTTER",
                            "",
                            "# Link the chain to INPUT if not already done",
                            "iptables -C INPUT -j HONEYPOTTER 2>/dev/null || iptables -A INPUT -j HONEYPOTTER",
                            "",
                            "# Block all IPs from honeypot"]
        
        # Add each IP to the chain
        for ip in ip_list:
            iptables_commands.append(f"iptables -A HONEYPOTTER -s {ip} -j DROP")
        
        # Add commands to save rules
        iptables_commands.extend([
            "",
            "# Save the rules (uncomment the line for your distribution)",
            "# Debian/Ubuntu:",
            "# iptables-save > /etc/iptables/rules.v4",
            "",
            "# RHEL/CentOS/Fedora:",
            "# service iptables save",
            "",
            "echo \"IPTables rules for ${#ip_list[@]} IPs have been applied.\""
        ])
        
        # Join all commands
        iptables_text = "\n".join(iptables_commands)
        
        # Explicitly commit to ensure transaction is closed
        db.commit()
        
        if download:
            return PlainTextResponse(iptables_text, headers={
                "Content-Disposition": "attachment; filename=honeypotter_iptables.sh"
            })
        return PlainTextResponse(iptables_text)
    except Exception as e:
        # Ensure transaction is rolled back on error
        db.rollback()
        logger.error(f"Error exporting IPTables rules: {str(e)}")
        return PlainTextResponse(f"Error exporting data: {str(e)}", status_code=500)

@app.get("/api/export/cisco")
def export_cisco(db: Session = Depends(get_db), download: bool = False):
    """Export Cisco ASA firewall configuration to block all attempted IPs."""
    try:
        # Use an explicit transaction
        db.begin()
        
        # Only select distinct IPs directly in the query for efficiency
        ips = db.query(LoginAttempt.client_ip).distinct().all()
        
        # Convert IPs to a list and sort them numerically using ipaddress module
        ip_list = sorted([ip[0] for ip in ips], key=lambda x: int(ipaddress.ip_address(x)))
        
        # Generate Cisco ASA firewall configuration
        cisco_commands = ["! Honeypotter - Cisco ASA Firewall Configuration", 
                         "! Generated on: " + datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                         "! Total IPs: " + str(len(ip_list)),
                         "!",
                         "! First, create a network object group for the blocked IPs",
                         "object-group network HONEYPOTTER_BLOCKED_IPS"]
        
        # Add each IP to the object group
        for ip in ip_list:
            cisco_commands.append(f" network-object host {ip}")
        
        # Add access control entries
        cisco_commands.extend([
            "!",
            "! Apply the access control list to block traffic",
            "access-list OUTSIDE_IN deny ip object-group HONEYPOTTER_BLOCKED_IPS any",
            "!",
            "! If you don't have an access-list applied yet, use something like this:",
            "! access-group OUTSIDE_IN in interface outside",
            "!",
            "! To save the configuration:",
            "! write memory"
        ])
        
        # Join all commands
        cisco_text = "\n".join(cisco_commands)
        
        # Explicitly commit to ensure transaction is closed
        db.commit()
        
        if download:
            return PlainTextResponse(cisco_text, headers={
                "Content-Disposition": "attachment; filename=honeypotter_cisco_asa.txt"
            })
        return PlainTextResponse(cisco_text)
    except Exception as e:
        # Ensure transaction is rolled back on error
        db.rollback()
        logger.error(f"Error exporting Cisco ASA configuration: {str(e)}")
        return PlainTextResponse(f"Error exporting data: {str(e)}", status_code=500)

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
    attempts_data = []
    
    try:
        # Use a dedicated transaction for the database query
        # and close it as soon as possible
        logger.info(f"Retrieving data for batch transmission to {client_info}")
        
        # Execute the query with a reasonable fetch size
        # to avoid potential memory issues with large datasets
        attempts = []
        
        # Use a transaction with explicit commit to ensure clean closure
        db.begin()
        query = db.query(LoginAttempt).order_by(LoginAttempt.timestamp.desc())
        
        # Set a statement timeout to prevent long-running queries
        # This requires a raw SQL execution first
        try:
            db.execute("SET statement_timeout = '30s'")
        except Exception as e:
            logger.debug(f"Failed to set query timeout (expected for non-PostgreSQL DBs): {str(e)}")
        
        # Execute query with chunking for very large datasets
        try:
            # First get total count
            total_count = query.count()
            
            if total_count == 0:
                logger.info(f"No login attempts found in database for {client_info}")
                # Send empty batch start message with 1 batch (empty batch)
                start_message = {
                    'type': 'batch_start',
                    'data': {
                        'total_attempts': 0,
                        'total_batches': 1  # Changed from 0 to 1
                    }
                }
                await connection_manager.send_text(websocket, json.dumps(start_message))
                
                # Send empty batch data message
                batch_message = {
                    'type': 'batch_data',
                    'data': {
                        'batch_number': 1,
                        'total_batches': 1,  # Changed from 0 to 1
                        'attempts': []
                    }
                }
                await connection_manager.send_text(websocket, json.dumps(batch_message))
                
                # Send completion message
                complete_message = {
                    'type': 'batch_complete',
                    'data': {
                        'total_attempts': 0,
                        'total_batches': 1  # Changed from 0 to 1
                    }
                }
                await connection_manager.send_text(websocket, json.dumps(complete_message))
                return
            
            # Use batched fetching for large datasets to reduce memory pressure
            CHUNK_SIZE = 5000  # Process 5000 records at a time
            
            if total_count > CHUNK_SIZE:
                logger.info(f"Large dataset detected ({total_count} records), using chunked fetching")
                
                # Process in chunks to avoid loading everything into memory at once
                for offset in range(0, total_count, CHUNK_SIZE):
                    chunk = query.limit(CHUNK_SIZE).offset(offset).all()
                    attempts.extend(chunk)
                    
                    # Convert chunk to dictionaries
                    for attempt in chunk:
                        attempts_data.append(attempt.to_dict())
                    
                    # Clear SQLAlchemy's identity map to free memory
                    db.expire_all()
            else:
                # Small enough dataset to load all at once
                attempts = query.all()
                attempts_data = [attempt.to_dict() for attempt in attempts]
                
        except Exception as query_err:
            logger.error(f"Error executing login attempts query: {str(query_err)}")
            raise
        finally:
            # End transaction explicitly
            db.commit()
            
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
        elif total_attempts <= 30000:
            batch_size = 1000
        else:
            # Use smaller batches for very large datasets (30k+ records)
            batch_size = 500
        
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
                # Use longer delay for larger batch sizes
                if total_attempts > 30000:
                    await asyncio.sleep(0.2)  # 200ms delay for very large datasets
                elif total_attempts > 10000:
                    await asyncio.sleep(0.1)  # 100ms delay for large datasets
                else:
                    await asyncio.sleep(0.05)  # 50ms delay for smaller datasets
            
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
    finally:
        # Ensure memory is freed
        attempts_data.clear()
        batch_tracking.clear()
        # No need to close db session as it's passed in by FastAPI dependency injection
        # and will be closed automatically when the websocket handler completes

async def send_specific_batches(websocket: WebSocket, db: Session, batch_numbers: List[int]):
    """Send specific batches to a client that requested missing batches."""
    client_info = f"{websocket.client.host}:{websocket.client.port}"
    attempts_data = []
    
    try:
        # Use a dedicated transaction for the database query
        logger.info(f"Retrieving data for specific batches to {client_info}")
        
        # Begin a transaction
        db.begin()
        query = db.query(LoginAttempt).order_by(LoginAttempt.timestamp.desc())
        
        try:
            # Execute query with efficient fetching
            attempts = query.all()
            attempts_data = [attempt.to_dict() for attempt in attempts]
        except Exception as query_err:
            logger.error(f"Error executing query for specific batches: {str(query_err)}")
            raise
        finally:
            # End transaction explicitly
            db.commit()
        
        # Determine batch size based on total data
        total_attempts = len(attempts_data)
        
        if total_attempts <= 100:
            batch_size = total_attempts
        elif total_attempts <= 1000:
            batch_size = 100
        elif total_attempts <= 10000:
            batch_size = 500
        elif total_attempts <= 30000:
            batch_size = 1000
        else:
            # Use smaller batches for very large datasets (30k+ records)
            batch_size = 500
        
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
                if total_attempts > 30000:
                    await asyncio.sleep(0.2)  # 200ms delay for very large datasets
                elif total_attempts > 10000:
                    await asyncio.sleep(0.1)  # 100ms delay for large datasets
                else:
                    await asyncio.sleep(0.05)  # 50ms delay for smaller datasets
                
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
    finally:
        # Clear memory resources
        attempts_data.clear() 

@app.get("/api/clear-static-cache", include_in_schema=False)
async def clear_static_cache(request: Request):
    """
    Clear the static file version cache.
    This will force new versions to be generated for all static files.
    Admin use only - should be protected in production.
    """
    from honeypot.web.utility import static_versioner
    static_versioner.clear_cache()
    logger.info("Static file version cache cleared")
    return {"status": "success", "message": "Static file version cache cleared"} 