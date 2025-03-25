"""Geolocation service for IP addresses."""
import requests
import logging
from typing import Optional, Dict, List, Tuple
import time
import json
import os
from pathlib import Path
from threading import Lock, Thread
from queue import Queue
import atexit

logger = logging.getLogger(__name__)

class GeolocationService:
    """Service to get geolocation data for IP addresses."""
    
    def __init__(self):
        self.cache = {}
        self.last_request_time = 0
        # ip-api.com allows 45 requests per minute (free tier)
        self.min_request_interval = 60 / 45  # ~1.33 seconds between requests
        
        # Set up cache file path in the same directory as this module
        self.cache_file = Path(__file__).parent / 'geolocation_cache.json'
        
        # Add mutex lock for thread safety
        self.cache_lock = Lock()
        
        # Batch processing queue and worker thread
        self.batch_queue = Queue()
        self.batch_worker = None
        self.batch_size = 10  # Process up to 10 IPs at once when possible
        self.running = True
        
        # Auto-save interval (save every 5 minutes)
        self.last_save_time = time.time()
        self.save_interval = 300  # 5 minutes
        
        # Load cache and start worker
        self._load_cache()
        self._start_batch_worker()
        
        # Register cleanup on exit
        atexit.register(self._cleanup)

    def _load_cache(self):
        """Load the cache from file if it exists."""
        try:
            if self.cache_file.exists():
                with open(self.cache_file, 'r') as f:
                    self.cache = json.load(f)
                logger.info(f"Loaded {len(self.cache)} cached IP locations")
        except Exception as e:
            logger.error(f"Error loading geolocation cache: {str(e)}")
            self.cache = {}

    def _save_cache(self):
        """Save the cache to file."""
        try:
            # Ensure the directory exists
            self.cache_file.parent.mkdir(parents=True, exist_ok=True)
            with self.cache_lock:
                with open(self.cache_file, 'w') as f:
                    json.dump(self.cache, f)
                self.last_save_time = time.time()
                logger.debug(f"Saved {len(self.cache)} IP locations to cache file")
        except Exception as e:
            logger.error(f"Error saving geolocation cache: {str(e)}")
    
    def _start_batch_worker(self):
        """Start the background thread for batch processing IP lookups."""
        self.batch_worker = Thread(target=self._batch_processor, daemon=True)
        self.batch_worker.name = "GeoIP-Batch-Worker"
        self.batch_worker.start()
        logger.info("Started geolocation batch processing worker")
    
    def _batch_processor(self):
        """Process IP lookups in batches."""
        batch_ips = []
        result_callbacks = []
        
        while self.running:
            try:
                # Try to collect a batch of IPs to process
                try:
                    # Wait for the first item with a timeout
                    ip, callback = self.batch_queue.get(timeout=5)
                    batch_ips.append(ip)
                    result_callbacks.append(callback)
                    
                    # Collect more items without blocking (up to batch size)
                    while len(batch_ips) < self.batch_size and not self.batch_queue.empty():
                        ip, callback = self.batch_queue.get_nowait()
                        batch_ips.append(ip)
                        result_callbacks.append(callback)
                
                except TimeoutError:
                    # No items in the queue, check if we should save cache
                    if time.time() - self.last_save_time > self.save_interval:
                        self._save_cache()
                    continue
                
                # Process the batch (if we have any)
                if not batch_ips:
                    continue
                
                # For free tier IP-API we can only do single lookups
                # For a paid API this could be replaced with batch API calls
                for i, ip in enumerate(batch_ips):
                    location = self._fetch_location(ip)
                    if result_callbacks[i]:
                        result_callbacks[i](location)
                    self.batch_queue.task_done()
                
                # Check if we should autosave the cache
                if time.time() - self.last_save_time > self.save_interval:
                    self._save_cache()
                    
            except Exception as e:
                logger.error(f"Error in batch processor: {str(e)}")
            finally:
                # Clear for next batch
                batch_ips = []
                result_callbacks = []
    
    def _fetch_location(self, ip: str) -> Optional[Dict]:
        """Fetch location data for an IP from the API."""
        try:
            # Respect rate limiting
            current_time = time.time()
            time_since_last_request = current_time - self.last_request_time
            if time_since_last_request < self.min_request_interval:
                time.sleep(self.min_request_interval - time_since_last_request)

            # Make API request
            response = requests.get(f'http://ip-api.com/json/{ip}')
            self.last_request_time = time.time()

            if response.status_code == 200:
                data = response.json()
                if data.get('status') == 'success':
                    location_data = {
                        'latitude': float(data.get('lat', 0)),
                        'longitude': float(data.get('lon', 0)),
                        'country': data.get('country'),
                        'city': data.get('city'),
                        'region': data.get('regionName')
                    }
                    # Cache the result in memory
                    with self.cache_lock:
                        self.cache[ip] = location_data
                    return location_data
                else:
                    logger.warning(f"IP-API returned error for IP {ip}: {data.get('message', 'Unknown error')}")
            
            logger.warning(f"Failed to get location for IP {ip}: {response.text}")
            return None

        except Exception as e:
            logger.error(f"Error getting location for IP {ip}: {str(e)}")
            return None

    def get_location(self, ip: str) -> Optional[Dict]:
        """Get geolocation data for an IP address.
        
        This is a synchronous wrapper that returns cached data immediately
        or queues a lookup if not in cache.
        """
        # Skip private/local IPs
        if ip.startswith(('10.', '172.', '192.168.', '127.')):
            return None

        # Check cache with thread safety
        with self.cache_lock:
            if ip in self.cache:
                return self.cache[ip]
        
        # IP not in cache, fetch it synchronously for now
        # (We could make this async in the future)
        location = self._fetch_location(ip)
        return location
    
    def get_location_async(self, ip: str, callback=None):
        """Queue an asynchronous lookup for an IP address.
        
        Args:
            ip: The IP address to look up
            callback: Optional function to call with the result
        """
        # Skip private/local IPs
        if ip.startswith(('10.', '172.', '192.168.', '127.')):
            if callback:
                callback(None)
            return
            
        # Check cache first
        with self.cache_lock:
            if ip in self.cache:
                if callback:
                    callback(self.cache[ip])
                return
        
        # Queue for batch processing
        self.batch_queue.put((ip, callback))
    
    def prefetch_location(self, ip: str):
        """Prefetch location data for an IP address without waiting for result."""
        self.get_location_async(ip)
    
    def _cleanup(self):
        """Cleanup resources when the service is shutting down."""
        logger.info("Shutting down geolocation service")
        self.running = False
        if self.batch_worker and self.batch_worker.is_alive():
            self.batch_worker.join(timeout=2)
        self._save_cache()

# Create a singleton instance
geolocation_service = GeolocationService() 