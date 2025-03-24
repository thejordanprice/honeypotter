# Honeypotter

A comprehensive honeypot monitoring system that tracks and visualizes SSH, Telnet, FTP, SMTP, RDP, SIP, and MySQL login attempts in real-time. Built with modern Python and a beautiful web interface.


## Features

- **Multi-Protocol Support**: Monitors multiple service protocols:
  - SSH (Secure Shell)
  - Telnet
  - FTP (File Transfer Protocol)
  - SMTP (Simple Mail Transfer Protocol)
  - RDP (Remote Desktop Protocol)
  - SIP (Session Initiation Protocol)
  - MySQL (Database Protocol)
- **Real-time Monitoring**: Live updates through WebSocket connections
- **Interactive Dashboard**: Modern web interface with dark mode support
- **Geolocation Tracking**: Maps attack origins with IP geolocation
- **Data Visualization**: 
  - Interactive world map showing attack origins
  - Protocol activity timeline
  - Top usernames analytics
  - Source IP analytics
  - Top countries analytics
  - Detailed login attempt logs
- **System Monitoring**:
  - Real-time CPU, Memory, and Disk usage
  - Network traffic statistics
  - Active connections monitoring
  - System load metrics
  - External IP tracking
  - Service status indicators
- **Data Export**: Export collected data in multiple formats:
  - Plaintext IP list
  - JSON format
  - CSV format with detailed attempt data
- **Secure Implementation**: 
  - Safe credential capture
  - No system modifications
  - Configurable through environment variables
  - SQLite database for persistent storage
- **Advanced Features**:
  - Protocol-specific credential extraction
  - Rate limiting and connection tracking
  - Detailed logging and error reporting
  - Responsive web interface
  - Dark/Light mode support
  - Mobile-friendly design

## Requirements

- Python 3.8+

## Installation

1. Clone the repository:
```bash
git clone https://github.com/thejordanprice/honeypotter.git
cd honeypotter
```

2. Create and activate a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Configure the environment:
```bash
cp .env.example .env
```

## Configuration

Edit the `.env` file to configure:

### Server Settings
- `HOST`: Bind address (default: 0.0.0.0)
- `SSH_PORT`: SSH server port (default: 22)
- `TELNET_PORT`: Telnet server port (default: 23)
- `FTP_PORT`: FTP server port (default: 21)
- `SMTP_PORT`: SMTP server port (default: 25)
- `RDP_PORT`: RDP server port (default: 3389)
- `SIP_PORT`: SIP server port (default: 5060)
- `MYSQL_PORT`: MySQL server port (default: 3306)
- `WEB_PORT`: Web interface port (default: 8080)

### Database Settings
- `DATABASE_URL`: SQLite database path (default: sqlite:///honeypot.db)

### Logging Settings
- `LOG_LEVEL`: Logging verbosity (default: INFO)
- `LOG_FILE`: Log file path (default: honeypot.log)

### System Monitoring Settings
- System metrics are automatically collected and displayed in the web interface
- No additional configuration needed for basic monitoring
- Advanced monitoring features are enabled by default

## Usage

1. Start the server:
```bash
python main.py
```

2. Access the web interface at `http://localhost:8080` (or configured host/port)

3. Monitor the dashboard for:
   - Real-time attack attempts
   - System resource usage
   - Service status
   - Network activity
   - Geolocation data
   - Protocol-specific analytics

## Development

### Project Structure

```
honeypotter/
├── honeypot/
│   ├── core/           # Core honeypot implementations
│   │   ├── ssh_server.py
│   │   ├── telnet_server.py
│   │   ├── ftp_server.py
│   │   ├── smtp_server.py
│   │   ├── rdp_server.py
│   │   ├── sip_server.py
│   │   ├── mysql_server.py
│   │   ├── system_monitor.py
│   │   └── geolocation.py
│   ├── database/       # Database models and utilities
│   ├── templates/      # Web interface templates
│   └── web/           # Web application and API
├── docs/              # Documentation
├── tests/             # Test suite
└── requirements.txt   # Python dependencies
```

## Security Considerations

- This is a research and educational tool
- Do not deploy on production systems without proper security measures
- Consider the following when deploying:
  - Use dedicated hardware/VMs
  - Implement proper firewall rules
  - Monitor system resources
  - Keep the system updated with security patches
  - Use non-standard ports for services
  - Implement rate limiting
  - Monitor for suspicious activity

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT License - See [LICENSE](LICENSE) file for details

## Acknowledgments

- [Paramiko](https://www.paramiko.org/) for SSH protocol implementation
- [FastAPI](https://fastapi.tiangolo.com/) for the web framework
- [Leaflet](https://leafletjs.com/) for map visualization
- [Chart.js](https://www.chartjs.org/) for data visualization
- [Tailwind CSS](https://tailwindcss.com/) for styling
- [psutil](https://psutil.readthedocs.io/) for system monitoring
