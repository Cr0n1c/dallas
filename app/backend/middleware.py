import time
from typing import Callable

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from helpers import log_debug, log_rate_limit, log_request_metrics


async def metrics_middleware(request: Request, call_next: Callable) -> Response:
    """Middleware to log request/response metrics and detect rate limits."""
    start_time = time.time()

    # Get request details
    method = request.method
    url_path = request.url.path
    client_ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent")

    # Calculate request size
    request_size = 0
    if request.body:
        body = await request.body()
        request_size = len(body)
        # Recreate the request body for downstream processing
        request._body = body

    # Add request size from headers
    request_size += sum(len(k) + len(v) for k, v in request.headers.items())

    log_debug(
        "Request started",
        {
            "method": method,
            "url_path": url_path,
            "client_ip": client_ip,
            "request_size_bytes": request_size,
        },
    )

    try:
        # Process the request
        response = await call_next(request)

        # Calculate processing time
        processing_time_ms = (time.time() - start_time) * 1000

        # Calculate response size
        response_size = 0
        if hasattr(response, "body"):
            response_body = response.body
            if isinstance(response_body, bytes):
                response_size = len(response_body)
            elif isinstance(response_body, str):
                response_size = len(response_body.encode("utf-8"))

        # Add response headers size
        response_size += sum(len(k) + len(v) for k, v in response.headers.items())

        # Log request metrics
        log_request_metrics(
            method=method,
            url_path=url_path,
            client_ip=client_ip,
            request_size=request_size,
            response_size=response_size,
            processing_time_ms=processing_time_ms,
            status_code=response.status_code,
            user_agent=user_agent,
        )

        return response

    except Exception:
        # Calculate processing time for failed requests
        processing_time_ms = (time.time() - start_time) * 1000

        # Log error metrics
        log_request_metrics(
            method=method,
            url_path=url_path,
            client_ip=client_ip,
            request_size=request_size,
            response_size=0,
            processing_time_ms=processing_time_ms,
            status_code=500,
            user_agent=user_agent,
        )

        # Re-raise the exception
        raise


def rate_limit_exception_handler(request: Request, _exc: Exception) -> JSONResponse:
    """Handle rate limit exceptions and log them."""
    client_ip = request.client.host if request.client else "unknown"
    url_path = request.url.path

    # Log rate limit hit
    log_rate_limit(
        client_ip=client_ip,
        endpoint=url_path,
        limit=f"{60}/minute",  # This matches our rate limit configuration
    )

    # Return rate limit response
    return JSONResponse(
        status_code=429,
        content={
            "error": "Rate limit exceeded",
            "message": "Too many requests. Please try again later.",
            "limit": "60 requests per minute",
        },
    )
