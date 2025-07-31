from .kubernetes import router as kubernetes_router
from .main import router as main_router
from .networking import router as networking_router

# Export all routers
__all__ = ["main_router", "networking_router", "kubernetes_router"]
