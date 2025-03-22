# Honeypotter

A comprehensive honeypot monitoring system that tracks and visualizes SSH, Telnet, and FTP login attempts in real-time. Built with modern Python and a beautiful web interface.


## Features

- **Multi-Protocol Support**: Monitors SSH, Telnet, and FTP login attempts
- **Real-time Monitoring**: Live updates through WebSocket connections
- **Interactive Dashboard**: Modern web interface with dark mode support
- **Geolocation Tracking**: Maps attack origins with IP geolocation
- **Data Visualization**: 
  - Interactive world map showing attack origins
  - Protocol activity timeline
  - Top usernames analytics
  - Detailed login attempt logs
- **Data Export**: Export collected IP addresses for analysis
- **Secure Implementation**: 
  - Safe credential capture
  - No system modifications
  - Configurable through environment variables
  - SQLite database for persistent storage

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
pip install -e .
```

4. Configure the environment:
```bash
cp .env.example .env
```

## Configuration

Edit the `.env` file to configure:

### Server Settings
- `HOST`: Bind address (default: 127.0.0.1)
- `SSH_PORT`: SSH server port (default: 2222)
- `TELNET_PORT`: Telnet server port (default: 2323)
- `FTP_PORT`: FTP server port (default: 2121)
- `WEB_PORT`: Web interface port (default: 8080)
- `WS_PORT`: WebSocket port (default: 8765)

### Database Settings
- `DATABASE_URL`: SQLite database path (default: sqlite:///honeypot.db)

### Logging Settings
- `LOG_LEVEL`: Logging verbosity (default: INFO)
- `LOG_FILE`: Log file path (default: honeypot.log)

## Usage

1. Start the server:
```bash
python -m honeypot.main
```

2. Access the web interface at `http://localhost:8080` (or configured host/port)

## Development

### Project Structure

```
honeypotter/
├── honeypot/
│   ├── core/           # Core honeypot implementations
│   ├── database/       # Database models and utilities
│   ├── templates/      # Web interface templates
│   └── web/           # Web application and API
├── docs/              # Documentation
├── tests/             # Test suite
└── setup.py          # Package configuration
```

### Running Tests

```bash
pytest tests/
```

## Security Considerations

- This is a research and educational tool
- Do not deploy on production systems without proper security measures
- Consider the following when deploying:
  - Use dedicated hardware/VMs
  - Implement proper firewall rules
  - Monitor system resources

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
