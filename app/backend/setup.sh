#!/bin/bash

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install -r requirements.txt

# Start the FastAPI server with reload enabled
echo "Starting FastAPI server..."
# Set environment variable to prevent __pycache__ creation
export PYTHONDONTWRITEBYTECODE=1
# Use python -m uvicorn instead of just uvicorn to ensure it uses the venv version
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000

echo "Setup complete!"
