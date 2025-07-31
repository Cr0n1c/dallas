import gc
import socket
import time

import aiohttp
from fastapi import APIRouter, HTTPException, Request
from helpers import (
    HTTP_TIMEOUT,
    CommandResponse,
    HttpRequest,
    HttpResponse,
    NetworkCheck,
    is_imds_endpoint,
    log_debug,
    log_error,
    log_info,
    log_warning,
    rate_limit,
)

router = APIRouter()

# Global aiohttp session with connection pooling
_aiohttp_session = None


def get_aiohttp_session():
    """Get or create an aiohttp session with proper connection pooling."""
    global _aiohttp_session
    if _aiohttp_session is None or _aiohttp_session.closed:
        log_debug("Initializing aiohttp session with connection pooling")
        connector = aiohttp.TCPConnector(
            limit=10,  # Connection pool size
            limit_per_host=5,  # Connections per host
            ttl_dns_cache=300,  # DNS cache TTL
            use_dns_cache=True,
            keepalive_timeout=30,
            enable_cleanup_closed=True,
        )
        timeout = aiohttp.ClientTimeout(total=HTTP_TIMEOUT)
        _aiohttp_session = aiohttp.ClientSession(
            connector=connector, timeout=timeout, raise_for_status=False
        )
        log_info("aiohttp session initialized with connection pooling")
    return _aiohttp_session


@router.post("/network/check", response_model=CommandResponse)
@rate_limit()
async def check_network(check: NetworkCheck, request: Request):
    """Check network connectivity to a host and port."""
    start_time = time.time()
    log_debug(
        "Network check endpoint called",
        {
            "url_path": request.url.path,
            "method": request.method,
            "client_ip": request.client.host if request.client else "unknown",
            "host": check.host,
            "port": check.port,
        },
    )

    try:
        log_debug(
            "Starting network connectivity check",
            {"host": check.host, "port": check.port},
        )

        # Create a socket object
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)  # 5 second timeout

        # Try to connect
        connection_start_time = time.time()
        result = sock.connect_ex((check.host, check.port))
        connection_time_ms = (time.time() - connection_start_time) * 1000
        sock.close()

        if result == 0:
            response = CommandResponse(
                output=f"Connection successful to {check.host}:{check.port}"
            )
            total_time_ms = (time.time() - start_time) * 1000
            log_info(
                "Network connectivity check successful",
                {
                    "host": check.host,
                    "port": check.port,
                    "result": "success",
                    "connection_time_ms": round(connection_time_ms, 2),
                    "total_time_ms": round(total_time_ms, 2),
                },
            )
            return response
        else:
            response = CommandResponse(
                output=f"Connection unsuccessful to {check.host}:{check.port}",
                error=f"Error code: {result}",
            )
            total_time_ms = (time.time() - start_time) * 1000
            log_warning(
                "Network connectivity check failed",
                {
                    "host": check.host,
                    "port": check.port,
                    "result": "failure",
                    "error_code": result,
                    "connection_time_ms": round(connection_time_ms, 2),
                    "total_time_ms": round(total_time_ms, 2),
                },
            )
            return response
    except Exception as e:
        total_time_ms = (time.time() - start_time) * 1000
        error_msg = str(e)
        log_error(
            "network_check",
            error_msg,
            {
                "host": check.host,
                "port": check.port,
                "total_time_ms": round(total_time_ms, 2),
            },
        )
        raise HTTPException(status_code=500, detail=error_msg)


@router.post("/http/request", response_model=HttpResponse)
@rate_limit()
async def make_http_request(http_request: HttpRequest, request: Request):
    """Make an HTTP request to the specified URL."""
    start_time = time.time()
    log_debug(
        "HTTP request endpoint called",
        {
            "url_path": request.url.path,
            "method": request.method,
            "client_ip": request.client.host if request.client else "unknown",
            "target_url": str(http_request.url),
            "target_method": http_request.method,
        },
    )

    try:
        log_debug(
            "Starting HTTP request",
            {"url": str(http_request.url), "method": http_request.method},
        )

        # Check for IMDS access
        if is_imds_endpoint(str(http_request.url)):
            response = HttpResponse(
                status_code=403,
                headers={},
                body="",
                error=(
                    "Access to Instance Metadata Service (IMDS) endpoints "
                    "is not allowed"
                ),
            )
            total_time_ms = (time.time() - start_time) * 1000
            log_warning(
                "IMDS access blocked",
                {
                    "url": str(http_request.url),
                    "method": http_request.method,
                    "status_code": 403,
                    "total_time_ms": round(total_time_ms, 2),
                },
            )
            return response

        # Get shared session
        session = get_aiohttp_session()

        # Prepare request - only include body for methods that support it
        kwargs = {}

        # GET, HEAD, and OPTIONS typically don't use request bodies
        if http_request.body and http_request.method not in [
            "GET",
            "HEAD",
            "OPTIONS",
        ]:
            kwargs["data"] = http_request.body.encode()

        # Add headers if provided
        if http_request.headers:
            kwargs["headers"] = http_request.headers

        # Make request
        request_start_time = time.time()
        async with session.request(
            method=http_request.method, url=str(http_request.url), **kwargs
        ) as response:
            request_time_ms = (time.time() - request_start_time) * 1000

            # Get response body
            body = await response.text()

            # Get response headers
            headers = {k: v for k, v in response.headers.items()}

            http_response = HttpResponse(
                status_code=response.status, headers=headers, body=body
            )

            total_time_ms = (time.time() - start_time) * 1000
            log_info(
                "HTTP request completed",
                {
                    "url": str(http_request.url),
                    "method": http_request.method,
                    "status_code": response.status,
                    "body_length": len(body),
                    "request_time_ms": round(request_time_ms, 2),
                    "total_time_ms": round(total_time_ms, 2),
                },
            )

            return http_response
    except aiohttp.ClientError as e:
        total_time_ms = (time.time() - start_time) * 1000
        error_msg = f"Connection error: {str(e)}"
        response = HttpResponse(status_code=0, headers={}, body="", error=error_msg)
        log_error(
            "http_request",
            error_msg,
            {
                "url": str(http_request.url),
                "method": http_request.method,
                "total_time_ms": round(total_time_ms, 2),
            },
        )
        return response
    except Exception as e:
        total_time_ms = (time.time() - start_time) * 1000
        error_msg = f"Request failed: {str(e)}"
        response = HttpResponse(status_code=0, headers={}, body="", error=error_msg)
        log_error(
            "http_request",
            error_msg,
            {
                "url": str(http_request.url),
                "method": http_request.method,
                "total_time_ms": round(total_time_ms, 2),
            },
        )
        return response
    finally:
        # Force garbage collection after request
        gc.collect()
        log_debug("Garbage collection completed after HTTP request")
