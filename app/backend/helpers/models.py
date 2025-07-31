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


class PaginationInfo(BaseModel):
    page: int
    page_size: int
    total_items: int
    total_pages: int
    has_next: bool
    has_previous: bool
    max_limit_reached: bool = False


class KubernetesResponse(BaseModel):
    pods: List[PodInfo]
    pagination: Optional[PaginationInfo] = None
    error: Optional[str] = None
    max_limit_reached: bool = False


class DeletePodRequest(BaseModel):
    name: str
    namespace: str


class DeletePodResponse(BaseModel):
    success: bool
    message: str
    error: Optional[str] = None
