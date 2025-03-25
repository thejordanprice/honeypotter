"""WebSocket broadcast functionality for the honeypot."""
import asyncio
import json
import logging

logger = logging.getLogger(__name__)

# Will be set by app.py when it initializes
connection_manager = None

async def broadcast_attempt(attempt: dict):
    """Broadcast a login attempt to all connected WebSocket clients.
    
    Args:
        attempt: Dictionary containing login attempt details
    """
    if connection_manager is None:
        logger.warning("WebSocket connection manager not initialized, cannot broadcast")
        return
        
    try:
        # Create a JSON-serializable message
        message = json.dumps({
            "type": "new_attempt",
            "data": attempt
        })
        
        # Broadcast to all connections
        sent_count = await connection_manager.broadcast(message)
        
        logger.debug(f"Broadcasted new login attempt to {sent_count} clients")
    except Exception as e:
        logger.error(f"Error broadcasting login attempt: {str(e)}") 