# SSH Honeypot Monitor

A professional SSH honeypot monitoring system that tracks and visualizes SSH login attempts in real-time.

## Features

- SSH honeypot server that safely captures login attempts
- Real-time monitoring through a modern web interface
- Secure data storage using SQLite
- WebSocket-based live updates
- Configurable settings through environment variables

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/ssh-honeypot-monitor.git
cd ssh-honeypot-monitor
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

4. Create a `.env` file:
```bash
cp .env.example .env
```

## Configuration

Edit the `.env` file to configure the following settings:

- `HOST`: Honeypot server host (default: 127.0.0.1)
- `SSH_PORT`: SSH server port (default: 2222)
- `WEB_PORT`: Web interface port (default: 8080)
- `WS_PORT`: WebSocket port (default: 8765)
- `LOG_LEVEL`: Logging level (default: INFO)

## Usage

1. Start the server:
```bash
python -m honeypot.main
```

2. Access the web interface at `http://localhost:8080`

## Security Considerations

- This is a honeypot system designed for research and educational purposes
- Do not deploy on production systems without proper security measures
- Regularly backup and rotate logs
- Monitor system resources

## License

MIT License - See LICENSE file for details
