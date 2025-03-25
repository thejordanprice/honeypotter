"""FastAPI web application for the SSH Honeypot."""
import json
from fastapi import FastAPI, WebSocket, Depends, Request, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, JSONResponse, PlainTextResponse
from sqlalchemy.orm import Session
from typing import List
from pathlib import Path
from datetime import datetime
from honeypot.core.config import TEMPLATE_DIR, STATIC_DIR, HOST, WEB_PORT, SSH_PORT, TELNET_PORT, FTP_PORT, SMTP_PORT, RDP_PORT, SIP_PORT, MYSQL_PORT
from honeypot.database.models import get_db, LoginAttempt
from honeypot.core.system_monitor import SystemMonitor
import ipaddress

app = FastAPI(title="Honeypot Monitor")

# Initialize system monitor
system_monitor = SystemMonitor({
    'ssh': SSH_PORT,
    'telnet': TELNET_PORT,
    'ftp': FTP_PORT,
    'smtp': SMTP_PORT,
    'rdp': RDP_PORT,
    'sip': SIP_PORT,
    'mysql': MYSQL_PORT
})

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
    """Serve the main page."""
    return templates.TemplateResponse(
        "index.html",
        {
            "request": request,
            "ws_host": HOST,
            "ws_port": WEB_PORT
        }
    )

@app.get("/api/system/metrics")
async def get_system_metrics():
    """Get current system metrics."""
    return JSONResponse(system_monitor.get_system_metrics())

@app.get("/api/system/external-ip")
async def get_external_ip():
    """Get the external IP address."""
    return JSONResponse({"ip": system_monitor.get_external_ip()})

@app.get("/api/system/services")
async def get_service_status():
    """Get status of monitored services."""
    return JSONResponse(system_monitor.get_service_status())

@app.get("/api/system/logs")
async def get_system_logs(lines: int = 100):
    """Get recent system logs."""
    return JSONResponse(system_monitor.get_system_logs(lines))

@app.get("/config")
async def get_config():
    """Get configuration for the frontend."""
    return JSONResponse({
        "ws_host": HOST,
        "ws_port": WEB_PORT
    })

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """Handle WebSocket connections."""
    await websocket.accept()
    active_connections.append(websocket)
    try:
        while True:
            await websocket.receive_text()
    except:
        if websocket in active_connections:
            active_connections.remove(websocket)

@app.get("/api/attempts")
async def get_attempts(
    offset: int = 0,
    limit: int = 1000,
    count_only: bool = False,
    since: str = None,
    db: Session = Depends(get_db)
):
    """Get login attempts with pagination."""
    query = db.query(LoginAttempt)
    
    # If since parameter is provided, filter attempts after that timestamp
    if since:
        try:
            since_dt = datetime.fromisoformat(since.replace('Z', '+00:00'))
            query = query.filter(LoginAttempt.timestamp > since_dt)
        except ValueError:
            return JSONResponse(
                status_code=400,
                content={"error": "Invalid timestamp format. Expected ISO format."}
            )
    
    total = query.count()
    
    if count_only:
        return {"total": total}
    
    attempts = query.order_by(LoginAttempt.timestamp.desc())\
                   .offset(offset)\
                   .limit(limit)\
                   .all()
    
    return {
        "attempts": [attempt.to_dict() for attempt in attempts],
        "total": total
    }

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
    message = json.dumps(attempt)
    for connection in active_connections[:]:  # Create a copy of the list to avoid modification during iteration
        try:
            await connection.send_text(message)
        except:
            if connection in active_connections:
                active_connections.remove(connection) 