"""Server registry for honeypot server types.

This module provides a central registry for honeypot server types,
allowing for dynamic server discovery and instantiation.
"""
import logging
import threading
from typing import Dict, Type, List, Callable
from honeypot.core.base_server import BaseHoneypot

logger = logging.getLogger(__name__)

class ServerRegistry:
    """Registry for honeypot server types."""
    
    def __init__(self):
        """Initialize the server registry."""
        self._server_types: Dict[str, Type[BaseHoneypot]] = {}
        self._active_servers: List[BaseHoneypot] = []
        self._server_threads: List[threading.Thread] = []
    
    def register(self, server_type: Type[BaseHoneypot]) -> None:
        """Register a honeypot server type.
        
        Args:
            server_type: The server class to register
        """
        server_name = server_type.__name__
        logger.debug(f"Registering server type: {server_name}")
        self._server_types[server_name] = server_type
        return server_type  # Return the class to allow use as a decorator
    
    def get_server_types(self) -> Dict[str, Type[BaseHoneypot]]:
        """Get all registered server types.
        
        Returns:
            Dictionary mapping server names to server classes
        """
        return self._server_types.copy()
    
    def start_servers(self) -> None:
        """Start all registered server types in separate threads."""
        logger.info(f"Starting {len(self._server_types)} honeypot servers")
        
        for server_name, server_class in self._server_types.items():
            try:
                # Instantiate the server
                server_instance = server_class()
                self._active_servers.append(server_instance)
                
                # Create and start a thread for this server
                thread = threading.Thread(
                    target=self._start_server_thread,
                    args=(server_instance,),
                    name=f"{server_name}-Thread",
                    daemon=True
                )
                thread.start()
                self._server_threads.append(thread)
                
                logger.info(f"Started {server_name} on port {server_instance.port}")
            except Exception as e:
                logger.error(f"Failed to start {server_name}: {str(e)}")
    
    def _start_server_thread(self, server: BaseHoneypot) -> None:
        """Thread target function to start a server.
        
        Args:
            server: The server instance to start
        """
        try:
            server.start()
        except Exception as e:
            logger.error(f"Error in server thread {server.__class__.__name__}: {str(e)}")

# Create a singleton registry instance
registry = ServerRegistry()

def register_server(server_class: Type[BaseHoneypot]) -> Type[BaseHoneypot]:
    """Decorator to register a honeypot server type.
    
    Args:
        server_class: The server class to register
        
    Returns:
        The original server class (unchanged)
    """
    return registry.register(server_class) 