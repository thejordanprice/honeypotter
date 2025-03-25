"""Thread management for honeypot servers."""
import threading
import logging
import queue
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Callable, Dict, Any, Optional

logger = logging.getLogger(__name__)

class ThreadManager:
    """Manages threads and connections for honeypot servers.
    
    This class provides:
    - Thread pool management with max worker limits
    - Connection tracking and limiting
    - Client timeouts for inactive connections
    """
    
    def __init__(
        self, 
        max_workers: int = 50,
        max_connections_per_ip: int = 5,
        connection_timeout: int = 60,
        max_queued_connections: int = 100
    ):
        """Initialize the thread manager.
        
        Args:
            max_workers: Maximum number of worker threads
            max_connections_per_ip: Maximum connections allowed from a single IP
            connection_timeout: Timeout in seconds for inactive connections
            max_queued_connections: Maximum number of queued connections
        """
        self.thread_pool = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="honeypot")
        self.max_connections_per_ip = max_connections_per_ip
        self.connection_timeout = connection_timeout
        self.max_queued_connections = max_queued_connections
        
        # Track active connections by IP
        self.connections: Dict[str, int] = {}
        self.connections_lock = threading.Lock()
        
        # Track active client handlers to support timeouts
        self.active_handlers: Dict[str, Dict[str, Any]] = {}
        self.active_handlers_lock = threading.Lock()
        
        # Connection queue for when thread pool is full
        self.connection_queue = queue.Queue(maxsize=max_queued_connections)
        
        # Start the connection timeout monitor
        self.stop_event = threading.Event()
        self.timeout_thread = threading.Thread(
            target=self._monitor_connection_timeouts,
            name="Connection-Monitor",
            daemon=True
        )
        self.timeout_thread.start()
        
        logger.info(f"Thread manager initialized with max_workers={max_workers}, "
                   f"max_connections_per_ip={max_connections_per_ip}, "
                   f"connection_timeout={connection_timeout}s")
    
    def submit_connection(self, client_handler: Callable, client_ip: str, *args, **kwargs) -> bool:
        """Submit a connection for handling.
        
        Args:
            client_handler: The function to handle the client connection
            client_ip: The client IP address
            *args: Additional arguments to pass to the client handler
            **kwargs: Additional keyword arguments to pass to the client handler
            
        Returns:
            True if the connection was accepted, False if rejected
        """
        # Check if this IP has too many connections
        with self.connections_lock:
            current_connections = self.connections.get(client_ip, 0)
            if current_connections >= self.max_connections_per_ip:
                logger.warning(f"Rejecting connection from {client_ip}: Too many connections "
                              f"({current_connections}/{self.max_connections_per_ip})")
                return False
            
            # Increment connection count for this IP
            self.connections[client_ip] = current_connections + 1
        
        try:
            # Submit the task to the thread pool with a wrapper that tracks activity
            future = self.thread_pool.submit(
                self._connection_wrapper, client_handler, client_ip, *args, **kwargs
            )
            
            # Register the connection for timeout monitoring
            handler_id = f"{client_ip}:{id(future)}"
            with self.active_handlers_lock:
                self.active_handlers[handler_id] = {
                    "client_ip": client_ip,
                    "start_time": time.time(),
                    "last_activity": time.time(),
                    "future": future
                }
            
            return True
            
        except Exception as e:
            # Decrement the connection count on failure
            with self.connections_lock:
                self.connections[client_ip] = max(0, self.connections.get(client_ip, 1) - 1)
            logger.error(f"Failed to submit connection from {client_ip}: {str(e)}")
            return False
    
    def _connection_wrapper(self, client_handler: Callable, client_ip: str, *args, **kwargs):
        """Wrapper for client handlers to track connections and handle cleanup.
        
        Args:
            client_handler: The function to handle the client connection
            client_ip: The client IP address
            *args: Additional arguments to pass to the client handler
            **kwargs: Additional keyword arguments to pass to the client handler
        """
        handler_id = f"{client_ip}:{id(threading.current_thread())}"
        
        try:
            # Call the actual client handler
            result = client_handler(*args, **kwargs)
            return result
        except Exception as e:
            logger.error(f"Error in client handler for {client_ip}: {str(e)}")
            raise
        finally:
            # Cleanup: Remove from active handlers and decrement connection count
            with self.active_handlers_lock:
                if handler_id in self.active_handlers:
                    del self.active_handlers[handler_id]
            
            with self.connections_lock:
                self.connections[client_ip] = max(0, self.connections.get(client_ip, 1) - 1)
                if self.connections[client_ip] == 0:
                    del self.connections[client_ip]
    
    def update_activity(self, client_ip: str):
        """Update the last activity timestamp for a client.
        
        Call this method whenever there is activity from a client to
        prevent timeout.
        
        Args:
            client_ip: The client IP address
        """
        with self.active_handlers_lock:
            # Find handlers for this IP and update their activity timestamp
            for handler_id, handler_info in list(self.active_handlers.items()):
                if handler_info["client_ip"] == client_ip:
                    handler_info["last_activity"] = time.time()
    
    def _monitor_connection_timeouts(self):
        """Monitor for inactive connections and terminate them."""
        while not self.stop_event.is_set():
            try:
                current_time = time.time()
                with self.active_handlers_lock:
                    for handler_id, handler_info in list(self.active_handlers.items()):
                        # Check if the connection has timed out
                        idle_time = current_time - handler_info["last_activity"]
                        if idle_time > self.connection_timeout:
                            logger.info(f"Terminating inactive connection from {handler_info['client_ip']} "
                                       f"(idle for {idle_time:.1f}s)")
                            
                            # Cancel the future if possible
                            future = handler_info.get("future")
                            if future and not future.done():
                                future.cancel()
                            
                            # Remove from active handlers
                            del self.active_handlers[handler_id]
                            
                            # Update connection count
                            with self.connections_lock:
                                client_ip = handler_info["client_ip"]
                                self.connections[client_ip] = max(0, self.connections.get(client_ip, 1) - 1)
                                if self.connections[client_ip] == 0:
                                    del self.connections[client_ip]
            except Exception as e:
                logger.error(f"Error monitoring connection timeouts: {str(e)}")
                
            # Sleep briefly to avoid excessive CPU usage
            time.sleep(1)
    
    def shutdown(self):
        """Shutdown the thread manager and cleanup resources."""
        logger.info("Shutting down thread manager")
        self.stop_event.set()
        if self.timeout_thread.is_alive():
            self.timeout_thread.join(timeout=5)
        self.thread_pool.shutdown(wait=True)
        logger.info("Thread manager shutdown complete") 