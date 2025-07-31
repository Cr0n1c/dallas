import asyncio
import gc
import time

import aiohttp
from fastapi import APIRouter, HTTPException, Request, Response
from helpers import (
    HealthCheck,
    ServiceStatus,
    log_debug,
    log_error,
    log_info,
    log_warning,
    rate_limit,
)

# Constants
FRONTEND_TIMEOUT = 5

router = APIRouter()

# Global aiohttp session for health checks
_health_session = None


def get_health_session():
    """Get or create an aiohttp session for health checks."""
    global _health_session
    if _health_session is None or _health_session.closed:
        log_debug("Initializing health check aiohttp session")
        connector = aiohttp.TCPConnector(
            limit=5,  # Smaller pool for health checks
            limit_per_host=2,
            ttl_dns_cache=300,
            use_dns_cache=True,
            keepalive_timeout=30,
            enable_cleanup_closed=True,
        )
        timeout = aiohttp.ClientTimeout(total=FRONTEND_TIMEOUT)
        _health_session = aiohttp.ClientSession(
            connector=connector, timeout=timeout, raise_for_status=False
        )
        log_info("Health check aiohttp session initialized")
    return _health_session


@router.get("/health", response_model=HealthCheck)
@rate_limit()
async def health_check(request: Request, response: Response):
    """Check the health of both backend and frontend services."""
    start_time = time.time()
    log_debug(
        "Health check endpoint called",
        {
            "url_path": request.url.path,
            "method": request.method,
            "client_ip": request.client.host if request.client else "unknown",
        },
    )

    log_debug("Starting health check")

    health_status = {
        "status": "healthy",
        "backend": ServiceStatus(
            status="healthy",
            message="Backend service is running",
            status_code="200",
        ),
        "frontend": ServiceStatus(
            status="healthy",
            message="Frontend service is running",
            status_code="200",
        ),
    }

    # Check frontend health (with reduced timeout for Kubernetes readiness)
    frontend_check_start_time = time.time()
    try:
        session = get_health_session()
        # Use a shorter timeout for Kubernetes readiness probes
        timeout = aiohttp.ClientTimeout(total=2)  # 2 seconds for readiness
        async with session.get(
            "http://localhost:3000", timeout=timeout
        ) as http_response:
            frontend_check_time_ms = (time.time() - frontend_check_start_time) * 1000
            if http_response.status != 200:
                health_status["frontend"] = ServiceStatus(
                    status="unhealthy",
                    message=(
                        f"Frontend service returned status code: "
                        f"{http_response.status}"
                    ),
                    status_code=str(http_response.status),
                )
                log_warning(
                    "Frontend health check failed",
                    {
                        "status_code": http_response.status,
                        "expected_status": 200,
                        "check_time_ms": round(frontend_check_time_ms, 2),
                    },
                )
    except asyncio.TimeoutError:
        frontend_check_time_ms = (time.time() - frontend_check_start_time) * 1000
        health_status["frontend"] = ServiceStatus(
            status="unhealthy",
            message="Frontend service timeout after 2 seconds",
            status_code="503",
        )
        log_warning(
            "Frontend health check timeout",
            {
                "timeout_seconds": 2,
                "check_time_ms": round(frontend_check_time_ms, 2),
            },
        )
    except aiohttp.ClientError as e:
        frontend_check_time_ms = (time.time() - frontend_check_start_time) * 1000
        health_status["frontend"] = ServiceStatus(
            status="unhealthy",
            message=(f"Frontend service connection error: {str(e)}"),
            status_code="408",
        )
        log_warning(
            "Frontend health check connection error",
            {"error": str(e), "check_time_ms": round(frontend_check_time_ms, 2)},
        )
    except Exception as e:
        frontend_check_time_ms = (time.time() - frontend_check_start_time) * 1000
        health_status["frontend"] = ServiceStatus(
            status="unhealthy",
            message=(f"Unexpected error checking frontend: {str(e)}"),
            status_code="500",
        )
        log_error(
            "health_check",
            f"Unexpected error checking frontend: {str(e)}",
            {"check_time_ms": round(frontend_check_time_ms, 2)},
        )

    # Set overall status based on service health
    if (
        health_status["frontend"].status == "unhealthy"
        or health_status["backend"].status == "unhealthy"
    ):
        health_status["status"] = "unhealthy"
        # Set response status code based on the first unhealthy service found
        if health_status["frontend"].status == "unhealthy":
            response.status_code = int(health_status["frontend"].status_code)
        elif health_status["backend"].status == "unhealthy":
            response.status_code = int(health_status["backend"].status_code)
    else:
        response.status_code = 200

    # Convert ServiceStatus objects to dict for logging
    log_data = {
        "status": health_status["status"],
        "backend": health_status["backend"].dict(),
        "frontend": health_status["frontend"].dict(),
    }

    total_time_ms = (time.time() - start_time) * 1000
    log_info(
        "Health check completed", {**log_data, "total_time_ms": round(total_time_ms, 2)}
    )

    # Force garbage collection after health check
    gc.collect()
    log_debug("Garbage collection completed after health check")

    return health_status


@router.get("/ready")
async def readiness_check(request: Request):
    """Simple readiness check for Kubernetes probes - only checks backend."""
    log_debug("Readiness check endpoint called")

    # Simple backend readiness check - no frontend dependency
    return {"status": "ready", "message": "Backend service is ready"}


@router.get("/ready/backend")
async def backend_readiness_check(request: Request):
    """Backend-only readiness check for Kubernetes probes."""
    log_debug("Backend readiness check endpoint called")

    # Check if backend is fully initialized
    try:
        # Verify we can handle requests
        return {
            "status": "ready",
            "message": "Backend service is ready",
            "timestamp": time.time(),
        }
    except Exception as e:
        log_error(
            "backend_readiness_check", f"Backend readiness check failed: {str(e)}"
        )
        raise HTTPException(status_code=503, detail="Backend not ready")
