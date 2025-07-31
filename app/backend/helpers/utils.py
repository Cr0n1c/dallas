import json
import os
import sys
from datetime import datetime
from typing import Any, Dict, Literal, Optional

from slowapi import Limiter
from slowapi.util import get_remote_address

# Initialize rate limiter
limiter = Limiter(key_func=get_remote_address)

# Constants
MAX_REQUESTS_PER_MINUTE = 60

# Log level hierarchy (from lowest to highest)
LogLevel = Literal["debug", "info", "warning", "error"]

LOG_LEVELS: Dict[LogLevel, int] = {
    "debug": 1,
    "info": 2,
    "warning": 3,
    "error": 4,
}


def get_min_log_level() -> LogLevel:
    """Get minimum log level from environment variable."""
    env_log_level = os.getenv("LOG_LEVEL", "").lower()

    if env_log_level in LOG_LEVELS:
        return env_log_level  # type: ignore

    # Default to 'info' if LOG_LEVEL is not set or invalid
    return "info"


# Global minimum log level
MIN_LOG_LEVEL = get_min_log_level()


def should_log(level: LogLevel) -> bool:
    """Check if a log level should be output based on configuration."""
    return LOG_LEVELS[level] >= LOG_LEVELS[MIN_LOG_LEVEL]


def log_debug(message: str, data: Optional[Dict[str, Any]] = None):
    """Log debug information to stdout."""
    if not should_log("debug"):
        return

    log_entry = {
        "timestamp": datetime.utcnow().isoformat(),
        "level": "DEBUG",
        "message": message,
    }
    if data:
        log_entry["data"] = data
    print(json.dumps(log_entry), file=sys.stdout)
    sys.stdout.flush()


def log_info(message: str, data: Optional[Dict[str, Any]] = None):
    """Log info information to stdout."""
    if not should_log("info"):
        return

    log_entry = {
        "timestamp": datetime.utcnow().isoformat(),
        "level": "INFO",
        "message": message,
    }
    if data:
        log_entry["data"] = data
    print(json.dumps(log_entry), file=sys.stdout)
    sys.stdout.flush()


def log_warning(message: str, data: Optional[Dict[str, Any]] = None):
    """Log warning information to stderr."""
    if not should_log("warning"):
        return

    log_entry = {
        "timestamp": datetime.utcnow().isoformat(),
        "level": "WARNING",
        "message": message,
    }
    if data:
        log_entry["data"] = data
    print(json.dumps(log_entry), file=sys.stderr)
    sys.stderr.flush()


def log_error(response_type: str, error: str, data: Optional[Dict[str, Any]] = None):
    """Log error data in JSON format to stderr."""
    if not should_log("error"):
        return

    log_entry = {
        "timestamp": datetime.utcnow().isoformat(),
        "level": "ERROR",
        "type": response_type,
        "error": error,
    }
    if data:
        log_entry["data"] = data
    print(json.dumps(log_entry), file=sys.stderr)
    sys.stderr.flush()


def log_response(response_type: str, data: Dict):
    """Log response data in JSON format to stdout (INFO level)."""
    if not should_log("info"):
        return

    log_entry = {
        "timestamp": datetime.utcnow().isoformat(),
        "level": "INFO",
        "type": response_type,
        "data": data,
    }
    print(json.dumps(log_entry), file=sys.stdout)
    sys.stdout.flush()


def log_rate_limit(client_ip: str, endpoint: str, limit: str):
    """Log rate limit hits to stderr."""
    if not should_log("warning"):
        return

    log_entry = {
        "timestamp": datetime.utcnow().isoformat(),
        "level": "WARNING",
        "message": "Rate limit exceeded",
        "data": {
            "client_ip": client_ip,
            "endpoint": endpoint,
            "limit": limit,
        },
    }
    print(json.dumps(log_entry), file=sys.stderr)
    sys.stderr.flush()


def log_request_metrics(
    method: str,
    url_path: str,
    client_ip: str,
    request_size: int,
    response_size: int,
    processing_time_ms: float,
    status_code: int,
    user_agent: Optional[str] = None,
):
    """Log request/response metrics to stdout."""
    if not should_log("debug"):
        return

    log_entry = {
        "timestamp": datetime.utcnow().isoformat(),
        "level": "DEBUG",
        "message": "Request processed",
        "data": {
            "method": method,
            "url_path": url_path,
            "client_ip": client_ip,
            "request_size_bytes": request_size,
            "response_size_bytes": response_size,
            "processing_time_ms": round(processing_time_ms, 2),
            "status_code": status_code,
        },
    }
    if user_agent:
        log_entry["data"]["user_agent"] = user_agent

    print(json.dumps(log_entry), file=sys.stdout)
    sys.stdout.flush()


def get_current_log_level() -> LogLevel:
    """Get the current configured log level."""
    return MIN_LOG_LEVEL


# Rate limit decorator
def rate_limit():
    return limiter.limit(f"{MAX_REQUESTS_PER_MINUTE}/minute")
