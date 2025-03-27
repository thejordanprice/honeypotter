import psutil
import logging
from typing import Dict
from datetime import datetime
import os
import subprocess
import platform
import requests
import time

logger = logging.getLogger(__name__)

class SystemMonitor:
    """Monitor system resources and service status."""
    
    def __init__(self, services: Dict[str, int]):
        """Initialize the system monitor.
        
        Args:
            services: Dictionary of service names and their ports
        """
        self.services = services
        self.is_macos = platform.system() == 'Darwin'
        # Get the main process PID to find child processes
        self.main_pid = os.getpid()
        # Cache for external IP
        self._external_ip = None
        self._last_ip_check = 0
        self._ip_cache_duration = 300  # Cache IP for 5 minutes
        # Metrics caching
        self._metrics_cache = {}
        self._last_metrics_check = 0
        self._metrics_cache_duration = 3  # Default cache duration in seconds
        self._high_load_threshold = 70.0  # CPU percentage threshold for high load
        self._is_high_load = False
        self._service_status_cache = {}
        self._last_service_status_check = 0
        self._service_cache_duration = 15  # Default cache for service status in seconds
        logger.debug(f"Main process PID: {self.main_pid}")
    
    def get_external_ip(self) -> str:
        """Get the external IP address with caching.
        
        Returns:
            str: The external IP address or "Unknown" if not available
        """
        current_time = time.time()
        
        # Return cached IP if it's still valid
        if self._external_ip and (current_time - self._last_ip_check) < self._ip_cache_duration:
            logger.debug(f"Returning cached external IP: {self._external_ip}")
            return self._external_ip
            
        # During high load, extend the cache duration
        if self._is_high_load:
            # Double the cache duration during high load (10 minutes instead of 5)
            extended_duration = self._ip_cache_duration * 2
            if self._external_ip and (current_time - self._last_ip_check) < extended_duration:
                logger.debug(f"High load detected: Using extended IP cache duration ({extended_duration}s)")
                return self._external_ip
        
        # List of services to try for getting the external IP
        ip_services = [
            'https://icanhazip.com',
            'https://api.ipify.org',
            'https://ipinfo.io/ip',
            'https://ifconfig.me'
        ]
        
        # Use a single timeout for all requests to avoid long wait times
        timeout = 3 if self._is_high_load else 5
        
        logger.debug(f"Attempting to retrieve external IP from {len(ip_services)} services (timeout: {timeout}s)")
        for service in ip_services:
            try:
                logger.debug(f"Trying to get external IP from {service}")
                response = requests.get(service, timeout=timeout)
                logger.debug(f"Response from {service}: status={response.status_code}, content={response.text[:50]}")
                
                if response.status_code == 200:
                    ip = response.text.strip()
                    if ip and self._is_valid_ip(ip):
                        logger.info(f"Successfully retrieved external IP {ip} from {service}")
                        self._external_ip = ip
                        self._last_ip_check = current_time
                        return ip
                    else:
                        logger.warning(f"Retrieved invalid IP format from {service}: {ip}")
                else:
                    logger.warning(f"Service {service} returned status code {response.status_code}")
                
            except Exception as e:
                logger.error(f"Error getting external IP from {service}: {str(e)}")
                
            # If we're under high load, exit after first attempt to avoid further resource usage
            if self._is_high_load:
                logger.debug("High load detected: Stopping external IP lookup after first attempt")
                # Return the cached IP even if it's expired, rather than "Could not determine IP"
                if self._external_ip:
                    logger.info(f"Returning expired cached IP during high load: {self._external_ip}")
                    return self._external_ip
                break
        
        # If we got here, none of the services worked
        logger.warning("Failed to get external IP from any service")
        return "Could not determine IP"

    def get_server_location(self) -> dict:
        """Get the server location based on external IP with caching.
        
        Returns:
            dict: Dictionary containing latitude and longitude coordinates,
                 or default coordinates if geolocation fails
        """
        # Default coordinates (San Francisco)
        default_location = {"latitude": 37.7749, "longitude": -122.4194}
        
        # Cache for geolocation data
        if not hasattr(self, '_server_location'):
            self._server_location = None
            self._last_location_check = 0
            self._location_cache_duration = 3600  # Cache location for 1 hour (longer than IP)
        
        current_time = time.time()
        
        # Return cached location if it's still valid
        if self._server_location and (current_time - self._last_location_check) < self._location_cache_duration:
            logger.debug(f"Returning cached server location: {self._server_location}")
            return self._server_location
        
        # First, get the current external IP
        ip = self.get_external_ip()
        
        # If we couldn't get a valid IP, return the default location
        if not ip or ip == "Could not determine IP" or not self._is_valid_ip(ip):
            logger.warning("Using default server location due to invalid IP")
            return default_location
        
        # Try to get the geolocation data from ipapi.co (same service used by client)
        try:
            logger.debug(f"Fetching geolocation data for IP: {ip}")
            timeout = 5 if not self._is_high_load else 3
            response = requests.get(f"https://ipapi.co/{ip}/json/", timeout=timeout)
            
            if response.status_code == 200:
                data = response.json()
                if data and 'latitude' in data and 'longitude' in data:
                    location = {
                        "latitude": data['latitude'],
                        "longitude": data['longitude']
                    }
                    logger.info(f"Successfully retrieved server location: {location}")
                    self._server_location = location
                    self._last_location_check = current_time
                    return location
                else:
                    logger.warning(f"Invalid geolocation data format: {data}")
            else:
                logger.warning(f"Geolocation service returned status code {response.status_code}")
        
        except Exception as e:
            logger.error(f"Error getting server geolocation: {str(e)}")
        
        # If we failed to get geolocation, return default and try alternate services
        try:
            # Try ipinfo.io as backup
            response = requests.get("https://ipinfo.io/json", timeout=timeout)
            if response.status_code == 200:
                data = response.json()
                if data and 'loc' in data:
                    # ipinfo returns "latitude,longitude" format
                    lat, lng = data['loc'].split(',')
                    location = {
                        "latitude": float(lat),
                        "longitude": float(lng)
                    }
                    logger.info(f"Successfully retrieved server location from backup service: {location}")
                    self._server_location = location
                    self._last_location_check = current_time
                    return location
        except Exception as e:
            logger.error(f"Error getting server geolocation from backup service: {str(e)}")
        
        logger.warning("Failed to get server location, using default")
        # Return default coordinates
        return default_location

    def _is_valid_ip(self, ip: str) -> bool:
        """Check if a string is a valid IPv4 address.
        
        Args:
            ip: String to check
            
        Returns:
            bool: True if valid IP, False otherwise
        """
        try:
            # Simple check using socket
            parts = ip.split('.')
            if len(parts) != 4:
                return False
            
            # Make sure each part is a number between 0-255
            return all(0 <= int(part) < 256 for part in parts)
        except (ValueError, AttributeError):
            return False

    def get_system_metrics(self) -> Dict:
        """Get current system metrics with caching based on system load."""
        current_time = time.time()
        
        # Check if we can use the cached metrics
        if self._metrics_cache and (current_time - self._last_metrics_check) < self._metrics_cache_duration:
            logger.debug(f"Returning cached system metrics (age: {current_time - self._last_metrics_check:.1f}s)")
            return self._metrics_cache
        
        # Adjust cache duration based on current load
        if self._is_high_load:
            # During high load, use longer cache duration (10 seconds)
            self._metrics_cache_duration = 10
            logger.debug("System under high load, using extended metrics cache duration")
        else:
            # During normal load, use shorter cache duration (3 seconds)
            self._metrics_cache_duration = 3
        
        try:
            # Get CPU metrics
            try:
                # Use shorter interval (0.1s instead of 1s) to reduce blocking
                cpu_percent = psutil.cpu_percent(interval=0.1)
                cpu_count = psutil.cpu_count()
                
                # Update high load flag based on CPU usage
                self._is_high_load = cpu_percent > self._high_load_threshold
                
            except Exception as e:
                logger.error(f"Error getting CPU metrics: {str(e)}")
                cpu_percent = 0
                cpu_count = 0

            # Get Memory metrics
            try:
                memory = psutil.virtual_memory()
            except Exception as e:
                logger.error(f"Error getting memory metrics: {str(e)}")
                memory = type('Memory', (), {
                    'total': 0,
                    'available': 0,
                    'percent': 0,
                    'used': 0
                })

            # Get Disk metrics
            try:
                disk = psutil.disk_usage('/')
            except Exception as e:
                logger.error(f"Error getting disk metrics: {str(e)}")
                disk = type('Disk', (), {
                    'total': 0,
                    'used': 0,
                    'free': 0,
                    'percent': 0
                })

            # Get Network metrics (using optimized method)
            network, connections = self._get_optimized_network_metrics()

            # Get Load Average
            try:
                load_avg = psutil.getloadavg()
            except Exception as e:
                logger.error(f"Error getting load average: {str(e)}")
                load_avg = [0, 0, 0]

            # Get Uptime
            try:
                uptime = time.time() - psutil.boot_time()
            except Exception as e:
                logger.error(f"Error getting uptime: {str(e)}")
                uptime = 0
            
            # Build and cache the metrics
            metrics = {
                'timestamp': datetime.utcnow().isoformat(),
                'cpu': {
                    'percent': cpu_percent,
                    'count': cpu_count
                },
                'memory': {
                    'total': memory.total,
                    'available': memory.available,
                    'percent': memory.percent,
                    'used': memory.used
                },
                'disk': {
                    'total': disk.total,
                    'used': disk.used,
                    'free': disk.free,
                    'percent': disk.percent
                },
                'network': {
                    'bytes_sent': network.bytes_sent,
                    'bytes_recv': network.bytes_recv,
                    'packets_sent': network.packets_sent,
                    'packets_recv': network.packets_recv,
                    'connections': connections
                },
                'load': {
                    '1min': load_avg[0],
                    '5min': load_avg[1],
                    '15min': load_avg[2]
                },
                'uptime': {
                    'seconds': uptime,
                    'days': uptime / (24 * 3600),
                    'hours': uptime / 3600
                }
            }
            
            # Update cache
            self._metrics_cache = metrics
            self._last_metrics_check = current_time
            
            return metrics
        except Exception as e:
            logger.error(f"Error collecting system metrics: {str(e)}")
            return {}
    
    def _get_optimized_network_metrics(self):
        """Get network metrics using optimized methods based on platform."""
        try:
            if self.is_macos:
                # On macOS, use a more efficient method that combines operations
                try:
                    # Use cached connections count if available and not too old
                    current_time = time.time()
                    if (hasattr(self, '_connections_cache') and 
                        hasattr(self, '_last_connections_check') and
                        (current_time - self._last_connections_check) < 5):
                        connections = self._connections_cache
                        logger.debug(f"Using cached connections count: {connections}")
                    else:
                        # Use a less expensive command for just counting connections
                        netstat_cmd = ['netstat', '-an']
                        result = subprocess.run(netstat_cmd, capture_output=True, text=True)
                        if result.returncode == 0:
                            connections = len([line for line in result.stdout.splitlines() if 'ESTABLISHED' in line])
                            # Cache the count
                            self._connections_cache = connections
                            self._last_connections_check = current_time
                        else:
                            connections = 0
                except Exception as e:
                    logger.error(f"Error getting network connections via netstat: {str(e)}")
                    connections = 0

                # For network traffic data, use the most basic command possible
                try:
                    network = type('Network', (), {
                        'bytes_sent': 0,
                        'bytes_recv': 0,
                        'packets_sent': 0,
                        'packets_recv': 0
                    })
                    
                    # Only collect detailed traffic data during low load periods
                    if not self._is_high_load:
                        netstat_cmd = ['netstat', '-I', 'en0', '-b']
                        result = subprocess.run(netstat_cmd, capture_output=True, text=True)
                        if result.returncode == 0:
                            lines = result.stdout.splitlines()
                            if len(lines) >= 2:
                                data = lines[1].split()
                                if len(data) >= 7:
                                    network.bytes_recv = int(data[6])
                                    network.bytes_sent = int(data[9])
                                    network.packets_recv = int(data[5])
                                    network.packets_sent = int(data[8])
                except Exception as e:
                    logger.error(f"Error getting network traffic via netstat: {str(e)}")
            else:
                # On other platforms, use psutil but with caching during high load
                if self._is_high_load and hasattr(self, '_network_cache') and hasattr(self, '_last_network_check'):
                    current_time = time.time()
                    if (current_time - self._last_network_check) < 5:
                        network = self._network_cache
                        connections = self._connections_cache
                        logger.debug("Using cached network metrics during high load")
                        return network, connections
                
                # If not cached or cache expired, get new data
                network = psutil.net_io_counters()
                connections = len(psutil.net_connections())
                
                # Cache for future use
                self._network_cache = network
                self._connections_cache = connections
                self._last_network_check = time.time()
                
            return network, connections
        except Exception as e:
            logger.error(f"Error in optimized network metrics: {str(e)}")
            network = type('Network', (), {
                'bytes_sent': 0,
                'bytes_recv': 0,
                'packets_sent': 0,
                'packets_recv': 0
            })
            return network, 0
    
    def _get_listening_ports_lsof(self) -> Dict[int, int]:
        """Get listening ports using lsof command."""
        try:
            # Run lsof to get listening ports
            cmd = ['lsof', '-i', '-P', '-n']
            result = subprocess.run(cmd, capture_output=True, text=True)
            
            if result.returncode != 0:
                logger.error(f"lsof command failed: {result.stderr}")
                return {}
            
            ports_dict = {}
            for line in result.stdout.splitlines():
                if 'LISTEN' in line:
                    try:
                        # Parse the line to get port and PID
                        parts = line.split()
                        if len(parts) >= 9:  # Make sure we have enough parts
                            pid = int(parts[1])
                            # Extract port from address (e.g., "*:2222" or "[::]:2222" or "127.0.0.1:2222")
                            addr_part = parts[8]
                            port = int(addr_part.split(':')[-1])
                            # Store port->pid mapping
                            ports_dict[port] = pid
                            logger.debug(f"Found listening port {port} with PID {pid} from line: {line}")
                    except (ValueError, IndexError) as e:
                        logger.error(f"Error parsing lsof line '{line}': {e}")
                        continue
            
            return ports_dict
            
        except Exception as e:
            logger.error(f"Error running lsof: {e}")
            return {}
    
    def get_service_status(self) -> Dict:
        """Check status of monitored services with caching."""
        current_time = time.time()
        
        # Return cached service status if not expired
        if self._service_status_cache and (current_time - self._last_service_status_check) < self._service_cache_duration:
            logger.debug(f"Returning cached service status (age: {current_time - self._last_service_status_check:.1f}s)")
            return self._service_status_cache
        
        # Adjust cache duration based on system load
        if self._is_high_load:
            self._service_cache_duration = 30  # Longer cache during high load
        else:
            self._service_cache_duration = 15  # Normal cache duration
        
        status = {}
        
        try:
            # Get listening ports based on OS
            if self.is_macos:
                # Use lsof on macOS
                listening_ports = self._get_listening_ports_lsof()
                logger.debug(f"Found listening ports via lsof: {listening_ports}")
            else:
                # Use psutil on other platforms
                try:
                    connections = psutil.net_connections()
                    listening_ports = {
                        conn.laddr.port: conn.pid
                        for conn in connections
                        if conn.status == 'LISTEN'
                    }
                    logger.debug(f"Found listening ports via psutil: {listening_ports}")
                except Exception as e:
                    logger.error(f"Error getting network connections: {e}")
                    listening_ports = {}
            
            # Check each service
            for service, port in self.services.items():
                service_running = False
                service_pid = None
                port_bound = port in listening_ports
                
                if port_bound:
                    service_pid = listening_ports.get(port)
                    if service_pid:
                        try:
                            proc = psutil.Process(service_pid)
                            logger.debug(f"Found process for port {port}: PID={service_pid}, name={proc.name()}, cmdline={' '.join(proc.cmdline())}")
                            service_running = True
                        except (psutil.NoSuchProcess, psutil.AccessDenied) as e:
                            logger.debug(f"Could not access process {service_pid}: {e}")
                
                status[service] = {
                    'running': port_bound,
                    'port': port,
                    'pid': service_pid,
                    'process_detected': service_running,
                    'port_bound': port_bound
                }
                
                logger.debug(f"Final status for {service}: {status[service]}")
                
            # Update cache
            self._service_status_cache = status
            self._last_service_status_check = current_time
                
        except Exception as e:
            logger.error(f"Error checking service status: {str(e)}")
            # Return all services as not running in case of error
            for service, port in self.services.items():
                status[service] = {'running': False, 'port': port, 'error': str(e)}
        
        return status
    
    def get_system_logs(self, lines: int = 100) -> list:
        """Get recent system logs."""
        try:
            import subprocess
            # Get system logs using journalctl or tail based on availability
            try:
                cmd = ['journalctl', '-n', str(lines), '--no-pager']
                result = subprocess.run(cmd, capture_output=True, text=True)
                logs = result.stdout.splitlines()
            except FileNotFoundError:
                # Fallback to traditional log files
                with open('/var/log/syslog', 'r') as f:
                    logs = f.readlines()[-lines:]
            
            return logs
        except Exception as e:
            logger.error(f"Error reading system logs: {str(e)}")
            return [] 