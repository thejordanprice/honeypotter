"""FastAPI web application for the SSH Honeypot."""
import json
from fastapi import FastAPI, WebSocket, Depends, Request, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, JSONResponse, PlainTextResponse
from sqlalchemy.orm import Session
from typing import List
from pathlib import Path
from honeypot.core.config import TEMPLATE_DIR, STATIC_DIR, HOST, WEB_PORT, SSH_PORT, TELNET_PORT, FTP_PORT, SMTP_PORT, RDP_PORT, SIP_PORT, MYSQL_PORT
from honeypot.database.models import get_db, LoginAttempt
from honeypot.core.system_monitor import SystemMonitor
import ipaddress
import logging
import asyncio
import os

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

# Store active WebSocket connections
active_connections: List[WebSocket] = []

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
        active_connections.append(websocket)
        logger.info(f"Accepted WebSocket connection from {client_info}")
        
        # Create a task for periodic system metrics updates
        periodic_task = asyncio.create_task(send_periodic_updates(websocket))
        
        try:
            while True:
                # Wait for messages from the client with a timeout
                try:
                    message_text = await asyncio.wait_for(websocket.receive_text(), timeout=60)
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
                            await websocket.send_text(json.dumps(message))
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
                    except Exception:
                        logger.info(f"Client {client_info} did not respond to ping, closing connection")
                        break
        except Exception as e:
            logger.error(f"WebSocket connection error with {client_info}: {str(e)}")
        finally:
            # Clean up
            periodic_task.cancel()
            if websocket in active_connections:
                active_connections.remove(websocket)
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
    try:
        await websocket.send_text(json.dumps(message))
    except:
        if websocket in active_connections:
            active_connections.remove(websocket)

async def send_service_status(websocket: WebSocket):
    """Send service status to a specific client."""
    status = system_monitor.get_service_status()
    message = {
        'type': 'service_status',
        'data': status
    }
    try:
        await websocket.send_text(json.dumps(message))
    except:
        if websocket in active_connections:
            active_connections.remove(websocket)

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
        await websocket.send_text(json.dumps(message))
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
            await websocket.send_text(json.dumps(message))
        except:
            pass
            
        if websocket in active_connections:
            active_connections.remove(websocket)

async def send_periodic_updates(websocket: WebSocket):
    """Send periodic system metrics updates to a client."""
    try:
        while True:
            # Send metrics every 5 seconds if the modal is open
            await asyncio.sleep(5)
            # Only send if connection is still active
            if websocket in active_connections:
                await send_system_metrics(websocket)
                
            # Send service status every 10 seconds
            if websocket in active_connections and (asyncio.get_event_loop().time() % 10) < 5:
                await send_service_status(websocket)
    except asyncio.CancelledError:
        # Task was cancelled, do cleanup
        pass
    except Exception as e:
        logger.error(f"Error in periodic updates: {str(e)}")
        if websocket in active_connections:
            active_connections.remove(websocket)

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
    
    # Track which clients successfully received the message
    failed_clients = []
    
    for connection in active_connections[:]:  # Create a copy of the list to avoid modification during iteration
        try:
            await connection.send_text(message_json)
            logger.debug(f"Successfully sent login attempt to client")
        except Exception as e:
            logger.warning(f"Failed to send login attempt to client: {str(e)}")
            failed_clients.append(connection)
            if connection in active_connections:
                active_connections.remove(connection)
    
    # Retry sending to failed clients (for any that might have temporary issues)
    if failed_clients:
        # Wait a moment before retrying
        await asyncio.sleep(1)
        
        for connection in failed_clients[:]:
            if connection in active_connections:  # Check if client is still connected
                try:
                    await connection.send_text(message_json)
                    logger.info("Successfully retried sending login attempt to client")
                    failed_clients.remove(connection)
                except:
                    logger.warning("Client still unreachable after retry, removing from active connections")
                    if connection in active_connections:
                        active_connections.remove(connection)
    
    return len(active_connections) - len(failed_clients)  # Return count of successful deliveries

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
        await websocket.send_text(json.dumps(start_message))
        
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
                    await websocket.send_text(json.dumps(batch_message))
                    success = True
                    # Track batch completion time
                    batch_tracking[batch_num]['end_time'] = asyncio.get_event_loop().time()
                    batch_tracking[batch_num]['status'] = 'sent'
                    batch_size_kb = len(json.dumps(batch_message)) / 1024
                    
                    logger.info(f"Sent batch {batch_num}/{total_batches} with {len(batch_data)} attempts ({batch_size_kb:.2f} KB) to {client_info}")
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
        await websocket.send_text(json.dumps(complete_message))
        
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
            await websocket.send_text(json.dumps(error_message))
        except:
            pass
            
        if websocket in active_connections:
            active_connections.remove(websocket)

async def send_specific_batches(websocket: WebSocket, db: Session, batch_numbers: List[int]):
    """Send specific batches to a client that requested missing batches."""
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
                
                await websocket.send_text(json.dumps(batch_message))
                logger.info(f"Sent missing batch {batch_num}/{total_batches} with {len(batch_data)} attempts")
            else:
                logger.warning(f"Requested invalid batch number: {batch_num}")
        
        # Send completion message
        complete_message = {
            'type': 'batch_complete',
            'data': {
                'total_attempts': total_attempts,
                'total_batches': total_batches
            }
        }
        await websocket.send_text(json.dumps(complete_message))
        logger.info(f"Completed sending requested missing batches")
        
    except Exception as e:
        logger.error(f"Error sending specific batches: {str(e)}")
        if websocket in active_connections:
            active_connections.remove(websocket) 