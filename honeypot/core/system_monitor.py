import psutil
import logging
from typing import Dict
from datetime import datetime
import os
import subprocess
import platform

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
        logger.debug(f"Main process PID: {self.main_pid}")
    
    def get_system_metrics(self) -> Dict:
        """Get current system metrics."""
        try:
            cpu_percent = psutil.cpu_percent(interval=1)
            memory = psutil.virtual_memory()
            disk = psutil.disk_usage('/')
            network = psutil.net_io_counters()
            
            return {
                'timestamp': datetime.utcnow().isoformat(),
                'cpu': {
                    'percent': cpu_percent,
                    'count': psutil.cpu_count()
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
                    'packets_recv': network.packets_recv
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