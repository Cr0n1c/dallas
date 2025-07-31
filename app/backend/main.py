import sys

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from helpers import log_debug, log_info, log_warning
from middleware import metrics_middleware, rate_limit_exception_handler
from routes import kubernetes_router, main_router, networking_router
from slowapi.errors import RateLimitExceeded

# Disable Python bytecode generation
sys.dont_write_bytecode = True

# Create FastAPI app
app = FastAPI(
    title="Infrastructure Debugger API",
    description="API for infrastructure debugging and monitoring",
    version="1.0.0",
    docs_url="/docs",  # Enable Swagger UI for development
    redoc_url="/redoc",  # Enable ReDoc for development
)

# Add middleware
app.middleware("http")(metrics_middleware)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],  # Frontend URLs
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD", "PATCH"],
    allow_headers=["*"],
)


# Add exception handlers
@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    """Handle rate limit exceptions."""
    return rate_limit_exception_handler(request, exc)


# Include API routes
app.include_router(main_router, prefix="/api")
app.include_router(networking_router, prefix="/api")
app.include_router(kubernetes_router, prefix="/api")


@app.get("/")
async def root():
    log_debug("Root endpoint accessed")
    return {"message": "Welcome to Infrastructure Debugger API"}


@app.on_event("startup")
async def startup_event():
    """Initialize resources on application startup."""
    log_info("Application startup initiated")

    # Pre-initialize sessions to avoid lazy loading delays
    try:
        from routes.networking import get_aiohttp_session

        get_aiohttp_session()
        log_debug("aiohttp session pre-initialized")
    except Exception as e:
        log_warning("Failed to pre-initialize aiohttp session", {"error": str(e)})

    try:
        from routes.main import get_health_session

        get_health_session()
        log_debug("Health check session pre-initialized")
    except Exception as e:
        log_warning("Failed to pre-initialize health check session", {"error": str(e)})

    try:
        from routes.kubernetes import get_kubernetes_client

        get_kubernetes_client()
        log_debug("Kubernetes client pre-initialized")
    except Exception as e:
        log_warning("Failed to pre-initialize Kubernetes client", {"error": str(e)})

    log_info("Application startup completed successfully")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup resources on application shutdown."""
    log_info("Application shutdown initiated")

    # Close aiohttp sessions
    try:
        from routes.networking import _aiohttp_session

        if _aiohttp_session and not _aiohttp_session.closed:
            await _aiohttp_session.close()
            log_debug("aiohttp session closed successfully")
    except Exception as e:
        log_warning("Failed to close aiohttp session", {"error": str(e)})

    try:
        from routes.main import _health_session

        if _health_session and not _health_session.closed:
            await _health_session.close()
            log_debug("Health check session closed successfully")
    except Exception as e:
        log_warning("Failed to close health check session", {"error": str(e)})

    # Clear Kubernetes client
    try:
        from routes.kubernetes import _kubernetes_client

        if _kubernetes_client:
            _kubernetes_client.api_client.rest_client.pool_manager.clear()
            log_debug("Kubernetes client connection pool cleared")
    except Exception as e:
        log_warning(
            "Failed to clear Kubernetes client connection pool", {"error": str(e)}
        )

    log_info("Application shutdown completed successfully")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info",
        access_log=True,
    )
