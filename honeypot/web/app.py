"""FastAPI web application for the SSH Honeypot."""
from fastapi import FastAPI, WebSocket, Depends, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, JSONResponse, PlainTextResponse
from sqlalchemy.orm import Session
import json
from typing import List
from pathlib import Path
from honeypot.core.config import TEMPLATE_DIR, STATIC_DIR, HOST, WEB_PORT
from honeypot.database.models import get_db, LoginAttempt

app = FastAPI(title="Honeypot Monitor")

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
            "ws_port": WEB_PORT  # Use the same port as the web server
        }
    )

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
def get_attempts(db: Session = Depends(get_db)):
    """Get all login attempts."""
    attempts = db.query(LoginAttempt).order_by(LoginAttempt.timestamp.desc()).all()
    return [attempt.to_dict() for attempt in attempts]

@app.get("/api/export/plaintext")
def export_plaintext(db: Session = Depends(get_db), download: bool = False):
    """Export all login attempts in plaintext format."""
    ips = db.query(LoginAttempt.client_ip).distinct().all()
    ip_list = "\n".join([ip[0] for ip in ips])
    
    if download:
        return PlainTextResponse(ip_list, headers={
            "Content-Disposition": "attachment; filename=attempted_ips.txt"
        })
    return PlainTextResponse(ip_list)

async def broadcast_attempt(attempt: dict):
    """Broadcast a login attempt to all connected clients."""
    message = json.dumps(attempt)
    for connection in active_connections[:]:  # Create a copy of the list to avoid modification during iteration
        try:
            await connection.send_text(message)
        except:
            if connection in active_connections:
                active_connections.remove(connection) 