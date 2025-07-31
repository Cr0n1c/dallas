# Implement server-side pagination for pods
_Exported on 7/31/2025 at 09:26:44 CDT from Cursor (1.3.6)_

---

**User**

update the pods call to be server side pagination so that it greatly reduces application memory. I am getting a lot of OOM-ing

---

**Cursor**

I'll help you implement server-side pagination for the Kubernetes pods endpoint to reduce memory usage and prevent OOM issues. Let me first examine the current implementation and then update both the backend and frontend.


Now I'll update the models to support pagination and then modify the backend and frontend accordingly.


```python
from typing import Dict, List, Optional

from pydantic import BaseModel, HttpUrl, validator


class CommandResponse(BaseModel):
    output: str
    error: Optional[str] = None


class ServiceStatus(BaseModel):
    status: str
    message: str
    status_code: str


class HealthCheck(BaseModel):
    status: str
    backend: ServiceStatus
    frontend: ServiceStatus


class NetworkCheck(BaseModel):
    host: str
    port: int

    @validator("host")
    def validate_host(cls, v):
        import re

        if not re.match(r"^[a-zA-Z0-9.-]+$", v):
            raise ValueError("Invalid host format")
        return v

    @validator("port")
    def validate_port(cls, v):
        if not 1 <= v <= 65535:
            raise ValueError("Port must be between 1 and 65535")
        return v


class HttpRequest(BaseModel):
    url: HttpUrl
    method: str = "GET"
    headers: Optional[Dict[str, str]] = None
    body: Optional[str] = None

    @validator("method")
    def validate_method(cls, v):
        allowed_methods = ["GET", "HEAD", "OPTIONS"]
        if v.upper() not in allowed_methods:
            raise ValueError(f"Method must be one of: {', '.join(allowed_methods)}")
        return v.upper()

    @validator("body")
    def validate_body(cls, v, values):
        if v and "method" in values and values["method"] in ["GET", "HEAD", "OPTIONS"]:
            raise ValueError(
                f"Request body is not allowed for {values['method']} method"
            )
        return v


class HttpResponse(BaseModel):
    status_code: int
    headers: Dict[str, str]
    body: str
    error: Optional[str] = None


class PodInfo(BaseModel):
    id: str
    name: str
    namespace: str
    created_timestamp: str
    phase: str
    healthy: bool
    ready: str
    restart_count: int
    image: str
    node_name: Optional[str] = None
    pod_ip: Optional[str] = None
    host_ip: Optional[str] = None
    app_name: Optional[str] = None


class KubernetesResponse(BaseModel):
    pods: List[PodInfo]
    error: Optional[str] = None


class PaginatedKubernetesResponse(BaseModel):
    pods: List[PodInfo]
    pagination: Dict[str, int]
    total_count: int
    error: Optional[str] = None


class DeletePodRequest(BaseModel):
    name: str
    namespace: str


class DeletePodResponse(BaseModel):
    success: bool
    message: str
    error: Optional[str] = None
```

The linter error is just about missing type stubs for pydantic, which is expected in this environment. Let's continue with updating the backend route to implement server-side pagination.


```python
import gc
import time

from fastapi import APIRouter, Request, Query
from helpers import (
    DeletePodRequest,
    DeletePodResponse,
    KubernetesResponse,
    PaginatedKubernetesResponse,
    PodInfo,
    log_debug,
    log_error,
    log_info,
    log_warning,
    rate_limit,
)
from kubernetes import client, config
from kubernetes.client.rest import ApiException

router = APIRouter()

# Global API client with connection pooling
_kubernetes_client = None


def get_kubernetes_client():
    """Get or create a Kubernetes API client with proper connection pooling."""
    global _kubernetes_client
    if _kubernetes_client is None:
        log_debug("Initializing Kubernetes API client with connection pooling")
        # Configure connection pooling
        configuration = client.Configuration()
        configuration.connection_pool_maxsize = 10
        configuration.connection_pool_block = False
        configuration.retries = 3

        # Try multiple configuration methods
        config_loaded = False

        # Method 1: Try in-cluster config (when running inside Kubernetes)
        try:
            config.load_incluster_config()
            _kubernetes_client = client.CoreV1Api()
            log_info("Kubernetes API client initialized with in-cluster config")
            config_loaded = True
        except config.ConfigException as e:
            log_debug("In-cluster config not available", {"error": str(e)})

        # Method 2: Try kubeconfig file (when running locally with kubectl)
        if not config_loaded:
            try:
                config.load_kube_config()
                _kubernetes_client = client.CoreV1Api()
                log_info("Kubernetes API client initialized with kubeconfig")
                config_loaded = True
            except config.ConfigException as e:
                log_debug("Kubeconfig not available", {"error": str(e)})

        # Method 3: Try environment variables (KUBECONFIG, etc.)
        if not config_loaded:
            try:
                config.load_config()
                _kubernetes_client = client.CoreV1Api()
                log_info("Kubernetes API client initialized with environment config")
                config_loaded = True
            except config.ConfigException as e:
                log_debug("Environment config not available", {"error": str(e)})

        # Method 4: Fallback to default config (will likely fail but provides better error)
        if not config_loaded:
            log_warning(
                "No Kubernetes configuration found, using default configuration"
            )
            _kubernetes_client = client.CoreV1Api()

    return _kubernetes_client


@router.get("/kubernetes/pods", response_model=PaginatedKubernetesResponse)
@rate_limit()
async def get_kubernetes_pods(
    request: Request,
    limit: int = Query(default=100, ge=1, le=1000, description="Number of pods to return"),
    offset: int = Query(default=0, ge=0, description="Number of pods to skip"),
    namespace: str = Query(default=None, description="Filter by namespace (optional)")
):
    """Get Kubernetes pod information with server-side pagination."""
    start_time = time.time()
    log_debug(
        "Kubernetes pods endpoint called",
        {
            "url_path": request.url.path,
            "method": request.method,
            "client_ip": request.client.host if request.client else "unknown",
            "limit": limit,
            "offset": offset,
            "namespace": namespace,
        },
    )

    try:
        log_debug("Starting Kubernetes pods request")

        # Get API client
        v1 = get_kubernetes_client()

        # Get pods with pagination and optional namespace filter
        log_debug("Fetching pods with pagination")
        api_start_time = time.time()

        # Calculate the total limit needed (offset + limit) for pagination
        total_limit = offset + limit

        if namespace:
            # Filter by specific namespace
            pods_response = v1.list_namespaced_pod(
                namespace=namespace,
                watch=False,
                timeout_seconds=30,
                limit=total_limit
            )
        else:
            # Get pods from all namespaces
            pods_response = v1.list_pod_for_all_namespaces(
                watch=False,
                timeout_seconds=30,
                limit=total_limit
            )

        api_time_ms = (time.time() - api_start_time) * 1000
        log_debug(
            "Kubernetes API call completed", {"api_time_ms": round(api_time_ms, 2)}
        )

        # Apply offset and limit to the response items
        all_pods = pods_response.items
        total_count = len(all_pods)

        # Slice the pods based on offset and limit
        paginated_pods = all_pods[offset:offset + limit]

        pods = []
        processing_start_time = time.time()

        for pod in paginated_pods:
            # Determine if pod is healthy
            ready_count = 0
            total_containers = len(pod.spec.containers)

            if pod.status.conditions:
                for condition in pod.status.conditions:
                    if condition.type == "Ready" and condition.status == "True":
                        ready_count = total_containers
                        break

            # Get restart count (sum of all containers)
            restart_count = 0
            if pod.status.container_statuses:
                for container_status in pod.status.container_statuses:
                    restart_count += container_status.restart_count

            # Get container image
            image = ""
            if pod.spec.containers:
                image = pod.spec.containers[0].image

            # Format ready status
            ready_status = f"{ready_count}/{total_containers}"

            # Get labels name with fallback to app
            labels_name = None
            if pod.metadata.labels:
                labels_name = pod.metadata.labels.get(
                    "name"
                ) or pod.metadata.labels.get("app")

            # Create unique ID for the pod
            pod_id = f"{pod.metadata.namespace}-{pod.metadata.name}"

            pod_info = PodInfo(
                id=pod_id,
                name=pod.metadata.name,
                namespace=pod.metadata.namespace,
                created_timestamp=(
                    pod.metadata.creation_timestamp.isoformat()
                    if pod.metadata.creation_timestamp
                    else ""
                ),
                phase=pod.status.phase,
                healthy=ready_count == total_containers
                and pod.status.phase == "Running",
                ready=ready_status,
                restart_count=restart_count,
                image=image,
                node_name=pod.spec.node_name,
                pod_ip=pod.status.pod_ip,
                host_ip=pod.status.host_ip,
                app_name=labels_name,
            )
            pods.append(pod_info)

        processing_time_ms = (time.time() - processing_start_time) * 1000
        log_debug(
            "Pod data processing completed",
            {
                "processing_time_ms": round(processing_time_ms, 2),
                "pods_processed": len(pods),
                "total_pods_returned": total_count,
                "pagination_applied": f"offset={offset}, limit={limit}",
            },
        )

        # Force garbage collection after processing large response
        gc.collect()
        log_debug("Garbage collection completed after processing pods response")

        total_time_ms = (time.time() - start_time) * 1000
        log_info(
            "Successfully retrieved Kubernetes pods with pagination",
            {
                "pod_count": len(pods),
                "total_count": total_count,
                "limit": limit,
                "offset": offset,
                "total_time_ms": round(total_time_ms, 2),
                "api_time_ms": round(api_time_ms, 2),
                "processing_time_ms": round(processing_time_ms, 2),
            },
        )

        return PaginatedKubernetesResponse(
            pods=pods,
            pagination={
                "limit": limit,
                "offset": offset,
                "has_more": offset + limit < total_count,
                "total_pages": (total_count + limit - 1) // limit
            },
            total_count=total_count
        )

    except ApiException as e:
        total_time_ms = (time.time() - start_time) * 1000
        error_msg = f"Kubernetes API error: {e.reason}"

        # Provide more specific error messages based on status code
        if e.status == 404:
            error_msg = (
                "Kubernetes API server not found. Please ensure the application is "
                "running inside a Kubernetes cluster or has proper kubeconfig setup."
            )
        elif e.status == 401:
            error_msg = (
                "Unauthorized access to Kubernetes API. Please check service account "
                "permissions."
            )
        elif e.status == 403:
            error_msg = (
                "Forbidden access to Kubernetes API. Please check RBAC permissions."
            )
        elif e.status == 500:
            error_msg = "Kubernetes API server internal error."
        else:
            error_msg = f"Kubernetes API error ({e.status}): {e.reason}"

        log_error(
            "kubernetes_pods",
            error_msg,
            {"status_code": e.status, "total_time_ms": round(total_time_ms, 2)},
        )
        return PaginatedKubernetesResponse(pods=[], pagination={}, total_count=0, error=error_msg)
    except Exception as e:
        total_time_ms = (time.time() - start_time) * 1000
        error_msg = f"Failed to get Kubernetes pods: {str(e)}"

        # Provide more specific error messages for common issues
        if "connection" in str(e).lower():
            error_msg = (
                "Unable to connect to Kubernetes API server. Please ensure the "
                "application is running inside a Kubernetes cluster or has proper "
                "kubeconfig setup."
            )
        elif "timeout" in str(e).lower():
            error_msg = (
                "Timeout connecting to Kubernetes API server. Please check network "
                "connectivity."
            )
        elif "certificate" in str(e).lower():
            error_msg = (
                "SSL/TLS certificate error when connecting to Kubernetes API. Please "
                "check certificate configuration."
            )

        log_error(
            "kubernetes_pods", error_msg, {"total_time_ms": round(total_time_ms, 2)}
        )
        return PaginatedKubernetesResponse(pods=[], pagination={}, total_count=0, error=error_msg)

// ... existing code ...
```

The linter errors are mostly about missing type stubs and the import issue. Let me fix the import issue first:


```python
from .models import (
    CommandResponse,
    DeletePodRequest,
    DeletePodResponse,
    HealthCheck,
    HttpRequest,
    HttpResponse,
    KubernetesResponse,
    NetworkCheck,
    PaginatedKubernetesResponse,
    PodInfo,
    ServiceStatus,
)
from .networking import HTTP_TIMEOUT, is_imds_endpoint
from .utils import (
    MAX_REQUESTS_PER_MINUTE,
    log_debug,
    log_error,
    log_info,
    log_rate_limit,
    log_request_metrics,
    log_response,
    log_warning,
    rate_limit,
)

__all__ = [
    "log_debug",
    "log_info",
    "log_warning",
    "log_response",
    "log_error",
    "log_rate_limit",
    "log_request_metrics",
    "rate_limit",
    "MAX_REQUESTS_PER_MINUTE",
    "CommandResponse",
    "ServiceStatus",
    "HealthCheck",
    "NetworkCheck",
    "HttpRequest",
    "HttpResponse",
    "PodInfo",
    "KubernetesResponse",
    "PaginatedKubernetesResponse",
    "DeletePodRequest",
    "DeletePodResponse",
    "is_imds_endpoint",
    "HTTP_TIMEOUT",
]
```

Now let's update the frontend to handle the new paginated response format:


```typescriptreact
interface PodInfo {
  id: string;
  name: string;
  namespace: string;
  created_timestamp: string;
  phase: string;
  healthy: boolean;
  ready: string;
  restart_count: number;
  image: string;
  node_name?: string;
  pod_ip?: string;
  host_ip?: string;
  app_name?: string;
}

interface PaginationInfo {
  limit: number;
  offset: number;
  has_more: boolean;
  total_pages: number;
}

interface KubernetesResponse {
  pods: PodInfo[];
  pagination: PaginationInfo;
  total_count: number;
  error?: string;
}
```

Now let's update the f
