# Initial Debugger Backend Setup and Troubleshooting
_Recreated from cursor_debugging_backend_service_failur.md - Original export on 7/31/2025 at 09:28:15 CDT from Cursor (1.3.6)_

This conversation covers the initial setup and troubleshooting of the Dallas Debugger backend service when running in Docker containers and Kubernetes pods.

---

## Problem: Backend Service Failing in Kubernetes

**User reported issue:**
When running the application in docker as a pod via the helm chart, the backend service was failing with the following errors:

```
2025-07-02 01:36:46,854 INFO Set uid to user 1001 succeeded
2025-07-02 01:36:46,869 INFO RPC interface 'supervisor' initialized
2025-07-02 01:36:46,869 CRIT Server 'unix_http_server' running without any HTTP authentication checking
2025-07-02 01:36:46,869 INFO supervisord started with pid 1
2025-07-02 01:36:47,872 INFO spawned: 'backend' with pid 7
2025-07-02 01:36:47,873 INFO spawned: 'frontend' with pid 8
2025-07-02 01:36:48,667 WARN exited: backend (exit status 1; not expected)
2025-07-02 01:36:49,669 INFO spawned: 'backend' with pid 19
2025-07-02 01:36:50,476 WARN exited: backend (exit status 1; not expected)
2025-07-02 01:36:52,479 INFO spawned: 'backend' with pid 20
2025-07-02 01:36:53,278 WARN exited: backend (exit status 1; not expected)
2025-07-02 01:36:56,283 INFO spawned: 'backend' with pid 21
2025-07-02 01:36:57,072 WARN exited: backend (exit status 1; not expected)
2025-07-02 01:36:58,073 INFO gave up: backend entered FATAL state, too many start retries too quickly
2025-07-02 01:37:03,078 INFO success: frontend entered RUNNING state, process has stayed up for > than 15 seconds (startsecs)
```

## Root Cause Analysis

### Initial Investigation
The investigation revealed that the backend was failing to start due to **incorrect file permissions** on the backend routes directory.

### Problem Details
1. **ImportError**: The main error was `ImportError: cannot import name 'kubernetes_router' from 'routes' (unknown location)`
2. **Permission Issues**: The routes directory and its files had incorrect permissions (644 instead of 755 for directories)
3. **Docker Configuration**: The Dockerfile was copying backend files with `--chmod=644`, which didn't set execute permissions on directories

### Technical Details
Python needs execute permissions on directories to traverse them and import modules. The Dockerfile was using:
```dockerfile
COPY --chown=appuser:appuser --chmod=644 app/backend/ ./backend/
```

This set read/write permissions for the owner but didn't set execute permissions on directories, preventing Python from accessing the routes module.

## Solution Implementation

### The Fix
Modified the Dockerfile to ensure proper directory permissions:

```dockerfile
# Before:
COPY --chown=appuser:appuser --chmod=644 app/backend/ ./backend/
RUN chmod +x ./backend/main.py

# After:
COPY --chown=appuser:appuser app/backend/ ./backend/
RUN chmod -R 755 ./backend/ && chmod +x ./backend/main.py
```

### Changes Made
1. **Removed restrictive chmod**: Removed the `--chmod=644` parameter when copying backend files
2. **Added explicit permission setting**: Used `chmod -R 755 ./backend/` to ensure all directories are executable
3. **Maintained security**: Kept the appuser ownership and maintained execute permissions on the main script

## Verification
After rebuilding the Docker image, both services started successfully:
- ✅ Backend enters RUNNING state
- ✅ Frontend enters RUNNING state
- ✅ Health check endpoint returns healthy status for both services
- ✅ Frontend serves HTML content properly

## Kubernetes Configuration Issues

### Secondary Problem: Kubernetes API Access
After fixing the permission issue, encountered: `{"pods":[],"error":"Unable to load Kubernetes configuration"}`

### Cause
The application was trying to use `load_kube_config()` as a fallback when `load_incluster_config()` failed, but kubeconfig files aren't available inside Kubernetes pods.

### Solution
1. **RBAC Configuration**: Created ClusterRole and ClusterRoleBinding for the service account
2. **Code Improvement**: Modified Kubernetes route code to only use in-cluster configuration

#### RBAC Resources Created
- **ClusterRole** (`charts/templates/clusterrole.yaml`): Permissions to get, list, and delete pods, and get/list namespaces
- **ClusterRoleBinding** (`charts/templates/clusterrolebinding.yaml`): Binds the ClusterRole to the ServiceAccount

#### Code Changes
```python
# Before:
try:
    config.load_incluster_config()
except config.ConfigException:
    try:
        config.load_kube_config()  # This won't work in-cluster
    except config.ConfigException:
        error_msg = "Unable to load Kubernetes configuration"

# After:
try:
    config.load_incluster_config()
except config.ConfigException as e:
    error_msg = f"Unable to load in-cluster Kubernetes configuration: {str(e)}"
```

## Key Learnings

1. **Docker Permissions**: Always ensure directories have execute permissions (755) for Python module imports
2. **Kubernetes Configuration**: Use only `load_incluster_config()` when running inside Kubernetes clusters
3. **RBAC Requirements**: Service accounts need proper ClusterRole permissions for Kubernetes API access
4. **Debugging Techniques**: Use `docker exec` to access running containers for troubleshooting (when shell access is available)

## Commands Used for Troubleshooting

```bash
# Check if container is running
docker ps

# Access container logs
docker logs dallas-debugger-container

# View supervisor logs inside container (when shell access is disabled)
docker exec dallas-debugger-container cat /var/log/supervisor/backend_stderr.log

# Test the application
curl http://localhost:3000/api/health
curl http://localhost:3000/api/kubernetes/pods
```

This troubleshooting session was crucial for establishing the proper Docker and Kubernetes configuration for the Dallas Debugger application.
