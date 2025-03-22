"""Geolocation service for IP addresses."""
import requests
import logging
from typing import Optional, Dict
import time

logger = logging.getLogger(__name__)

class GeolocationService:
    """Service to get geolocation data for IP addresses."""
    
    def __init__(self):
        self.cache = {}
        self.last_request_time = 0
        # ip-api.com allows 45 requests per minute (free tier)
        self.min_request_interval = 60 / 45  # ~1.33 seconds between requests

    def get_location(self, ip: str) -> Optional[Dict]:
        """Get geolocation data for an IP address."""
        # Skip private/local IPs
        if ip.startswith(('10.', '172.', '192.168.', '127.')):
            return None

        # Check cache
        if ip in self.cache:
            return self.cache[ip]

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
                    # Cache the result
                    self.cache[ip] = location_data
                    return location_data
                else:
                    logger.warning(f"IP-API returned error for IP {ip}: {data.get('message', 'Unknown error')}")
            
            logger.warning(f"Failed to get location for IP {ip}: {response.text}")
            return None

        except Exception as e:
            logger.error(f"Error getting location for IP {ip}: {str(e)}")
            return None

# Create a singleton instance
geolocation_service = GeolocationService() 