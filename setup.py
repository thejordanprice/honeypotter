from setuptools import setup, find_packages

setup(
    name="ssh-honeypot",
    version="0.1.0",
    packages=find_packages(),
    install_requires=[
        "paramiko>=3.4.0",
        "websockets>=12.0",
        "SQLAlchemy>=2.0.27",
        "python-dotenv>=1.0.1",
        "rich>=13.7.0",
        "fastapi>=0.110.0",
        "uvicorn>=0.27.1",
        "aiofiles>=23.2.1",
        "jinja2>=3.1.3",
        "requests>=2.31.0",
    ],
    entry_points={
        "console_scripts": [
            "ssh-honeypot=honeypot.main:main",
        ],
    },
) 