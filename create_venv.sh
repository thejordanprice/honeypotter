#!/bin/bash

# Hardcoded directory name for the virtual environment
VENV_DIR="python-venv"

# Check if Python 3 is installed
if ! command -v python3 &>/dev/null; then
    echo "Python 3 is not installed."
    exit 1
fi

# Check if virtualenv is installed
if ! python3 -m venv --help &>/dev/null; then
    echo "Virtualenv module is not available."
    echo "Please install it by running: python3 -m pip install --user virtualenv"
    exit 1
fi

# Check if the virtual environment already exists
if [ -d "$VENV_DIR" ]; then
    echo "Virtual environment already exists in $VENV_DIR."
    exit 1
fi

# Create the virtual environment
python3 -m venv "$VENV_DIR"

# Check if the venv was created successfully
if [ $? -eq 0 ]; then
    echo "Virtual environment created successfully in $VENV_DIR"
else
    echo "Failed to create virtual environment."
    exit 1
fi

# Activate the virtual environment
echo "Activating the virtual environment..."
source "$VENV_DIR/bin/activate"

# Check if the activation was successful
if [ $? -eq 0 ]; then
    echo "Virtual environment is activated."
else
    echo "Failed to activate virtual environment."
    exit 1
fi
