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
        logger.debug(f"Main process PID: {self.main_pid}")
    
    def get_external_ip(self) -> str:
        """Get the external IP address with caching.
        
        Returns:
            str: The external IP address or "Unknown" if not available
        """
        current_time = time.time()
        
        # Return cached IP if it's still valid
        if self._external_ip and (current_time - self._last_ip_check) < self._ip_cache_duration:
            return self._external_ip
            
        try:
            # Try to get IP from icanhazip.com
            response = requests.get('https://icanhazip.com', timeout=5)
            if response.status_code == 200:
                ip = response.text.strip()
                self._external_ip = ip
                self._last_ip_check = current_time
                return ip
        except Exception as e:
            logger.error(f"Error getting external IP: {str(e)}")
            
        return "Unknown"

    def get_system_metrics(self) -> Dict:
        """Get current system metrics."""
        try:
            # Get CPU metrics
            try:
                cpu_percent = psutil.cpu_percent(interval=1)
                cpu_count = psutil.cpu_count()
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

            # Get Network metrics
            try:
                if self.is_macos:
                    # On macOS, try using netstat for network connections
                    try:
                        netstat_cmd = ['netstat', '-an']
                        result = subprocess.run(netstat_cmd, capture_output=True, text=True)
                        if result.returncode == 0:
                            connections = len([line for line in result.stdout.splitlines() if 'ESTABLISHED' in line])
                        else:
                            connections = 0
                    except Exception as e:
                        logger.error(f"Error getting network connections via netstat: {str(e)}")
                        connections = 0

                    # Try using netstat for network traffic
                    try:
                        netstat_cmd = ['netstat', '-I', 'en0', '-b']  # Use en0 as default interface
                        result = subprocess.run(netstat_cmd, capture_output=True, text=True)
                        if result.returncode == 0:
                            lines = result.stdout.splitlines()
                            if len(lines) >= 2:  # Header + data line
                                data = lines[1].split()
                                if len(data) >= 7:
                                    bytes_in = int(data[6])  # Bytes in
                                    bytes_out = int(data[9])  # Bytes out
                                    network = type('Network', (), {
                                        'bytes_sent': bytes_out,
                                        'bytes_recv': bytes_in,
                                        'packets_sent': int(data[8]),  # Packets out
                                        'packets_recv': int(data[5])   # Packets in
                                    })
                                else:
                                    raise ValueError("Insufficient data in netstat output")
                            else:
                                raise ValueError("No data in netstat output")
                        else:
                            raise subprocess.CalledProcessError(result.returncode, netstat_cmd)
                    except Exception as e:
                        logger.error(f"Error getting network traffic via netstat: {str(e)}")
                        network = type('Network', (), {
                            'bytes_sent': 0,
                            'bytes_recv': 0,
                            'packets_sent': 0,
                            'packets_recv': 0
                        })
                else:
                    # On other platforms, use psutil
                    network = psutil.net_io_counters()
                    connections = len(psutil.net_connections())
            except Exception as e:
                logger.error(f"Error getting network metrics: {str(e)}")
                network = type('Network', (), {
                    'bytes_sent': 0,
                    'bytes_recv': 0,
                    'packets_sent': 0,
                    'packets_recv': 0
                })
                connections = 0

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
            
            return {
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
        except Exception as e:
            logger.error(f"Error collecting system metrics: {str(e)}")
            return {}

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
        """Check status of monitored services."""
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