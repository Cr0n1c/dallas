# Infrastructure Debugger Backend

This is the backend API for the Infrastructure Debugger application. It provides endpoints for file operations, network checks, and command execution.

## Setup

1. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

## Running the Application

To run the application in development mode:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`

## API Documentation

Once the application is running, you can access:
- Interactive API documentation (Swagger UI): `http://localhost:8000/docs`
- Alternative API documentation (ReDoc): `http://localhost:8000/redoc`

## Available Endpoints

- `GET /api/files/list/{path}` - List directory contents
- `GET /api/files/read/{path}` - Read file contents
- `POST /api/network/check` - Check network connectivity
- `POST /api/command/execute` - Execute system commands (restricted)

## Security Notes

- The application implements path traversal protection
- Only specific directories and file types are allowed
- Command execution is restricted to a whitelist of commands
- Network checks have a timeout of 5 seconds
- CORS is configured to allow all origins (should be restricted in production)
