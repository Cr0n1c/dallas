import time
from datetime import datetime

from fastapi import APIRouter, Query, Request
from helpers import (
    DeletePodRequest,
    DeletePodResponse,
    KubernetesResponse,
    PaginationInfo,
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

# Cache for pods data to improve performance (disabled for server-side pagination)
# _pods_cache = None
# _cache_timestamp = None
# _cache_ttl = 10  # Cache for 10 seconds

# Circuit breaker for handling slow requests
_last_slow_request_time = None
_slow_request_threshold = 5.0  # seconds
_circuit_breaker_duration = 30  # seconds


def get_kubernetes_client():
    """Get or create a Kubernetes API client with proper connection pooling."""
    global _kubernetes_client
    if _kubernetes_client is None:
        log_debug("Initializing Kubernetes API client with connection pooling")
        # Configure connection pooling for low concurrency (max 5 users)
        configuration = client.Configuration()
        configuration.connection_pool_maxsize = (
            5  # Optimized for max 5 concurrent users
        )
        configuration.connection_pool_block = False
        configuration.retries = 1  # Reduced retries for faster failure
        configuration.timeout = 8  # 8 second timeout for faster failure detection
        configuration.verify_ssl = False  # Skip SSL verification for faster connection
        configuration.connection_pool_connections = 2  # Reduced connections per host

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


@router.get("/kubernetes/pods", response_model=KubernetesResponse)
@rate_limit()
async def get_kubernetes_pods(
    request: Request,
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(
        50, ge=1, le=3000, description="Number of items per page (max 3000)"
    ),
    sort_by: str = Query("name", description="Field to sort by"),
    sort_order: str = Query(
        "asc", regex="^(asc|desc)$", description="Sort order (asc or desc)"
    ),
    namespace_filter: str = Query(
        None, description="Comma-separated list of namespaces to filter by"
    ),
    status_filter: str = Query(
        None, description="Comma-separated list of statuses to filter by"
    ),
):
    """Get Kubernetes pod information with true server-side pagination and multiselect filters."""
    start_time = time.time()

    # Parse multiselect filters
    # Understand an attacker could put arbitrary code in the namespace_filter or status_filter
    # but it would not cause an issue as it will just say the namespace/status is not found
    namespaces = []
    if namespace_filter:
        namespaces = [ns.strip() for ns in namespace_filter.split(",") if ns.strip()]

    statuses = []
    if status_filter:
        statuses = [
            status.strip() for status in status_filter.split(",") if status.strip()
        ]

    log_debug(
        "Kubernetes pods endpoint called",
        {
            "url_path": request.url.path,
            "method": request.method,
            "client_ip": request.client.host if request.client else "unknown",
            "page": page,
            "page_size": page_size,
            "namespaces": namespaces,
            "statuses": statuses,
        },
    )

    try:
        log_debug(
            "Starting Kubernetes pods request with server-side pagination and multiselect filters"
        )

        # Get API client
        v1 = get_kubernetes_client()

        # Build field selectors for server-side filtering
        field_selectors = []
        if statuses:
            if len(statuses) == 1:
                # Optimize for single status using server-side field selector
                field_selectors.append(f"status.phase={statuses[0]}")
            else:
                # For multiple statuses, we'll need to fetch all and filter client-side
                # since Kubernetes API doesn't support OR conditions in field selectors
                pass

        # Build label selectors if needed
        label_selectors: list[str] = []

        # Combine field selectors
        field_selector = None
        if field_selectors:
            field_selector = ",".join(field_selectors)
            log_debug("Using field selector", {"field_selector": field_selector})

        # Determine if we need to fetch all namespaces or specific namespaces
        all_pods = []
        max_limit_reached = False

        if namespaces:
            # Multiple specific namespaces - fetch from each
            log_debug(f"Fetching pods from specific namespaces: {namespaces}")
            api_start_time = time.time()

            for namespace in namespaces:
                try:
                    pods_response = v1.list_namespaced_pod(
                        namespace=namespace,
                        field_selector=field_selector,
                        label_selector=(
                            ",".join(label_selectors) if label_selectors else None
                        ),
                        limit=page_size,
                        timeout_seconds=15,
                    )
                    all_pods.extend(pods_response.items)

                    # Check if we've reached the max limit
                    if len(all_pods) >= 1000:
                        max_limit_reached = True
                        log_warning(
                            "Max limit of 1000 pods reached",
                            {"total_pods": len(all_pods)},
                        )
                        break

                except Exception as e:
                    log_warning(
                        f"Failed to fetch pods from namespace {namespace}",
                        {"error": str(e)},
                    )
                    continue
        else:
            # All namespaces - use pagination to avoid timeouts
            log_debug("Fetching pods from all namespaces with pagination")
            api_start_time = time.time()

            pods_response = v1.list_pod_for_all_namespaces(
                field_selector=field_selector,
                label_selector=",".join(label_selectors) if label_selectors else None,
                limit=min(page_size * 10, 1000),  # Limit to 1000 max
                timeout_seconds=20,
            )
            all_pods = pods_response.items

            # Check if we've reached the max limit
            if len(all_pods) >= 1000:
                max_limit_reached = True
                log_warning(
                    "Max limit of 1000 pods reached", {"total_pods": len(all_pods)}
                )

        api_time_ms = (time.time() - api_start_time) * 1000

        # Track very slow requests for circuit breaker
        if api_time_ms > (_slow_request_threshold * 1000):  # >5 seconds
            global _last_slow_request_time
            _last_slow_request_time = datetime.now()
            log_warning(
                "Very slow API request detected",
                {
                    "api_time_ms": round(api_time_ms, 2),
                    "threshold_ms": _slow_request_threshold * 1000,
                    "circuit_breaker_activated": True,
                },
            )

        log_debug(
            "Kubernetes API call completed",
            {
                "api_time_ms": round(api_time_ms, 2),
                "pods_returned": len(all_pods),
                "max_limit_reached": max_limit_reached,
            },
        )

        # Process pods
        pods = []
        processing_start_time = time.time()
        for pod in all_pods:
            # Apply client-side status filtering if multiple statuses were requested
            if statuses and pod.status.phase not in statuses:
                continue

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
            },
        )

        # Apply server-side sorting
        reverse_sort = sort_order.lower() == "desc"
        if sort_by == "name":
            pods.sort(key=lambda x: x.name, reverse=reverse_sort)
        elif sort_by == "namespace":
            pods.sort(key=lambda x: x.namespace, reverse=reverse_sort)
        elif sort_by == "phase":
            pods.sort(key=lambda x: x.phase, reverse=reverse_sort)
        elif sort_by == "created_timestamp":
            pods.sort(key=lambda x: x.created_timestamp, reverse=reverse_sort)
        elif sort_by == "restart_count":
            pods.sort(key=lambda x: x.restart_count, reverse=reverse_sort)
        else:
            # Default to name sorting
            pods.sort(key=lambda x: x.name, reverse=reverse_sort)

        # Apply server-side pagination
        total_items = len(pods)
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        paginated_pods = pods[start_idx:end_idx]

        # Check if we fetched the maximum allowed pods (1000), indicating there are more available
        max_fetch_limit = min(page_size * 10, 1000)
        if len(all_pods) >= max_fetch_limit:
            max_limit_reached = True
            total_items = 1000  # Always show 1000+ when we hit the limit
        elif max_limit_reached:
            # We fetched 1000 pods but only returning page_size, so indicate there are more
            total_items = max(1000, total_items)

        total_pages = (
            (total_items + page_size - 1) // page_size if total_items > 0 else 1
        )
        has_next = end_idx < total_items
        has_previous = page > 1

        # Create pagination info
        pagination_info = PaginationInfo(
            page=page,
            page_size=page_size,
            total_items=total_items,
            total_pages=total_pages,
            has_next=has_next,
            has_previous=has_previous,
            max_limit_reached=max_limit_reached,
        )

        total_time_ms = (time.time() - start_time) * 1000
        log_info(
            "Successfully retrieved Kubernetes pods with server-side pagination and multiselect filters",
            {
                "pod_count": len(paginated_pods),
                "total_pods": total_items,
                "total_time_ms": round(total_time_ms, 2),
                "api_time_ms": round(api_time_ms, 2),
                "processing_time_ms": round(processing_time_ms, 2),
                "page": page,
                "page_size": page_size,
                "total_pages": total_pages,
                "has_next": has_next,
                "max_limit_reached": max_limit_reached,
            },
        )

        return KubernetesResponse(
            pods=paginated_pods,
            pagination=pagination_info,
            max_limit_reached=max_limit_reached,
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
        return KubernetesResponse(pods=[], error=error_msg)
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
        return KubernetesResponse(pods=[], error=error_msg)


@router.post("/kubernetes/pods/delete", response_model=DeletePodResponse)
@rate_limit()
async def delete_kubernetes_pod(delete_request: DeletePodRequest, request: Request):
    """Delete a Kubernetes pod."""
    start_time = time.time()
    log_debug(
        "Kubernetes pod deletion endpoint called",
        {
            "url_path": request.url.path,
            "method": request.method,
            "client_ip": request.client.host if request.client else "unknown",
            "pod_name": delete_request.name,
            "namespace": delete_request.namespace,
        },
    )

    try:
        log_debug(
            "Starting Kubernetes pod deletion",
            {"pod_name": delete_request.name, "namespace": delete_request.namespace},
        )

        # Get API client
        v1 = get_kubernetes_client()

        # First, check the pod's current phase
        try:
            log_debug(
                "Checking pod phase before deletion",
                {
                    "pod_name": delete_request.name,
                    "namespace": delete_request.namespace,
                },
            )

            pod = v1.read_namespaced_pod(
                name=delete_request.name,
                namespace=delete_request.namespace,
                timeout_seconds=30,
            )

            pod_phase = pod.status.phase
            log_debug(
                "Pod phase retrieved",
                {
                    "pod_name": delete_request.name,
                    "namespace": delete_request.namespace,
                    "phase": pod_phase,
                },
            )

            # Check if pod is in a deletable state
            if pod_phase in ["Running", "Succeeded"]:
                error_msg = (
                    f"Cannot delete pod {delete_request.name} in namespace "
                    f"{delete_request.namespace}. Pod is in '{pod_phase}' phase. "
                    f"Only pods that are not Running or Succeeded can be deleted."
                )
                log_warning(
                    "Pod deletion blocked due to phase",
                    {
                        "pod_name": delete_request.name,
                        "namespace": delete_request.namespace,
                        "phase": pod_phase,
                    },
                )
                return DeletePodResponse(
                    success=False, message="Cannot delete pod", error=error_msg
                )

        except ApiException as e:
            if e.status == 404:
                error_msg = (
                    f"Pod {delete_request.name} not found in "
                    f"namespace {delete_request.namespace}"
                )
                log_warning(
                    "Pod not found during phase check",
                    {
                        "pod_name": delete_request.name,
                        "namespace": delete_request.namespace,
                        "status_code": e.status,
                    },
                )
                return DeletePodResponse(
                    success=False, message="Pod not found", error=error_msg
                )
            else:
                error_msg = f"Failed to check pod phase: {e.reason}"
                log_error(
                    "kubernetes_pod_phase_check",
                    error_msg,
                    {
                        "pod_name": delete_request.name,
                        "namespace": delete_request.namespace,
                        "status_code": e.status,
                    },
                )
                return DeletePodResponse(
                    success=False, message="Failed to check pod phase", error=error_msg
                )

        # Delete the pod (only reaches here if pod is in a deletable state)
        try:
            api_start_time = time.time()
            v1.delete_namespaced_pod(
                name=delete_request.name,
                namespace=delete_request.namespace,
                timeout_seconds=30,
            )
            api_time_ms = (time.time() - api_start_time) * 1000

            success_msg = f"Pod {delete_request.name} in namespace {delete_request.namespace} deleted successfully"
            total_time_ms = (time.time() - start_time) * 1000
            log_info(
                "Successfully deleted Kubernetes pod",
                {
                    "pod_name": delete_request.name,
                    "namespace": delete_request.namespace,
                    "api_time_ms": round(api_time_ms, 2),
                    "total_time_ms": round(total_time_ms, 2),
                },
            )

            return DeletePodResponse(success=True, message=success_msg)

        except ApiException as e:
            api_time_ms = (time.time() - api_start_time) * 1000
            error_msg = f"Failed to delete pod: {e.reason}"
            log_error(
                "kubernetes_pod_delete",
                error_msg,
                {
                    "pod_name": delete_request.name,
                    "namespace": delete_request.namespace,
                    "status_code": e.status,
                    "api_time_ms": round(api_time_ms, 2),
                },
            )

            return DeletePodResponse(
                success=False, message="Failed to delete pod", error=error_msg
            )

    except Exception as e:
        total_time_ms = (time.time() - start_time) * 1000
        error_msg = f"Failed to delete Kubernetes pod: {str(e)}"
        log_error(
            "kubernetes_pod_delete",
            error_msg,
            {
                "pod_name": delete_request.name,
                "namespace": delete_request.namespace,
                "total_time_ms": round(total_time_ms, 2),
            },
        )
        return DeletePodResponse(
            success=False, message="Failed to delete pod", error=error_msg
        )


@router.get("/kubernetes/namespaces")
async def get_kubernetes_namespaces(request: Request):
    """Get all available namespaces from the Kubernetes cluster."""
    start_time = time.time()
    log_debug(
        "Kubernetes namespaces endpoint called",
        {
            "url_path": request.url.path,
            "method": request.method,
            "client_ip": request.client.host if request.client else "unknown",
        },
    )

    try:
        log_debug("Starting Kubernetes namespaces request")

        # Get API client
        v1 = get_kubernetes_client()

        # Fetch all namespaces
        api_start_time = time.time()
        namespaces_response = v1.list_namespace(
            timeout_seconds=15,
        )
        api_time_ms = (time.time() - api_start_time) * 1000

        log_debug(
            "Kubernetes namespaces API call completed",
            {
                "api_time_ms": round(api_time_ms, 2),
                "namespaces_returned": len(namespaces_response.items),
            },
        )

        # Extract namespace names
        namespaces = []
        for namespace in namespaces_response.items:
            namespaces.append(namespace.metadata.name)

        # Sort namespaces alphabetically
        namespaces.sort()

        total_time_ms = (time.time() - start_time) * 1000
        log_info(
            "Successfully retrieved Kubernetes namespaces",
            {
                "namespace_count": len(namespaces),
                "total_time_ms": round(total_time_ms, 2),
                "api_time_ms": round(api_time_ms, 2),
            },
        )

        return {"namespaces": namespaces}

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
            "kubernetes_namespaces",
            error_msg,
            {"total_time_ms": round(total_time_ms, 2)},
        )
        return {"namespaces": [], "error": error_msg}

    except Exception as e:
        total_time_ms = (time.time() - start_time) * 1000
        log_error(
            "kubernetes_namespaces",
            f"Exception occurred: {str(e)}",
            {"total_time_ms": round(total_time_ms, 2)},
        )

        error_msg = (
            "An internal error occurred while retrieving Kubernetes namespaces. Please "
            "contact the administrator for assistance."
        )
        return {"namespaces": [], "error": error_msg}


@router.get("/kubernetes/diagnostic")
async def kubernetes_diagnostic(request: Request):
    """Diagnostic endpoint to check Kubernetes connectivity and configuration."""
    diagnostic_info: dict[str, object] = {
        "timestamp": time.time(),
        "client_ip": request.client.host if request.client else "unknown",
        "config_status": "unknown",
        "api_connectivity": "unknown",
        "details": {},
    }

    try:
        # Test configuration loading
        config_loaded = False
        config_method = "none"

        # Try in-cluster config
        try:
            config.load_incluster_config()
            config_loaded = True
            config_method = "in-cluster"
            diagnostic_info["details"]["in_cluster_config"] = "available"
        except config.ConfigException as e:
            diagnostic_info["details"]["in_cluster_config"] = f"not available: {str(e)}"

        # Try kubeconfig
        if not config_loaded:
            try:
                config.load_kube_config()
                config_loaded = True
                config_method = "kubeconfig"
                diagnostic_info["details"]["kubeconfig"] = "available"
            except config.ConfigException as e:
                diagnostic_info["details"]["kubeconfig"] = f"not available: {str(e)}"

        # Try environment config
        if not config_loaded:
            try:
                config.load_config()
                config_loaded = True
                config_method = "environment"
                diagnostic_info["details"]["environment_config"] = "available"
            except config.ConfigException as e:
                diagnostic_info["details"][
                    "environment_config"
                ] = f"not available: {str(e)}"

        diagnostic_info["config_status"] = "loaded" if config_loaded else "failed"
        diagnostic_info["details"]["config_method"] = config_method

        # Test API connectivity
        if config_loaded:
            try:
                v1 = client.CoreV1Api()
                # Try a simple API call
                v1.list_namespace(watch=False, limit=1)
                diagnostic_info["api_connectivity"] = "success"
                diagnostic_info["details"]["api_test"] = "passed"
            except Exception as e:
                diagnostic_info["api_connectivity"] = "failed"
                diagnostic_info["details"]["api_test"] = f"failed: {str(e)}"
        else:
            diagnostic_info["api_connectivity"] = "not tested"
            diagnostic_info["details"]["api_test"] = "skipped - no config"

        return {"status": "success", "diagnostic": diagnostic_info}

    except Exception as e:
        diagnostic_info["config_status"] = "error"
        diagnostic_info["details"]["error"] = str(e)
        return {"status": "error", "diagnostic": diagnostic_info}
