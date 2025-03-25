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
    await websocket.accept()
    active_connections.append(websocket)
    
    # Immediately send initial attempts data
    attempts = db.query(LoginAttempt).order_by(LoginAttempt.timestamp.desc()).all()
    attempts_data = [attempt.to_dict() for attempt in attempts]
    message = {
        'type': 'initial_attempts',
        'data': attempts_data
    }
    await websocket.send_text(json.dumps(message))
    
    # Create a task for periodic system metrics updates
    periodic_task = asyncio.create_task(send_periodic_updates(websocket))
    
    try:
        while True:
            # Wait for messages from the client
            message_text = await websocket.receive_text()
            try:
                message = json.loads(message_text)
                message_type = message.get('type')
                
                # Handle different message types
                if message_type == 'request_system_metrics':
                    # Send both system metrics and service status on request
                    await send_system_metrics(websocket)
                    await send_service_status(websocket)
                elif message_type == 'request_external_ip':
                    # Send external IP on request
                    await send_external_ip(websocket)
                elif message_type == 'request_attempts':
                    # Send attempts data on request
                    attempts = db.query(LoginAttempt).order_by(LoginAttempt.timestamp.desc()).all()
                    attempts_data = [attempt.to_dict() for attempt in attempts]
                    message = {
                        'type': 'initial_attempts',
                        'data': attempts_data
                    }
                    await websocket.send_text(json.dumps(message))
            except json.JSONDecodeError:
                logger.warning(f"Received invalid JSON: {message_text}")
            except Exception as e:
                logger.error(f"Error processing WebSocket message: {str(e)}")
    except:
        # Clean up
        periodic_task.cancel()
        if websocket in active_connections:
            active_connections.remove(websocket)

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
    """Get all login attempts.
    
    Note: This endpoint is kept for backward compatibility.
    The preferred method for retrieving attempts is now via WebSocket connection.
    """
    attempts = db.query(LoginAttempt).order_by(LoginAttempt.timestamp.desc()).all()
    return [attempt.to_dict() for attempt in attempts]

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
    for connection in active_connections[:]:  # Create a copy of the list to avoid modification during iteration
        try:
            await connection.send_text(message_json)
        except:
            if connection in active_connections:
                active_connections.remove(connection) 