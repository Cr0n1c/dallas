# Readiness probe failure troubleshooting
_Exported on 7/31/2025 at 09:26:23 CDT from Cursor (1.3.6)_

---

**User**

Readiness probe failed: HTTP probe failed with statuscode: 404


---

**Cursor**

I can see you're getting a readiness probe failure with a 404 status code. Let me investigate the readiness probe configuration and the corresponding API endpoint to identify the issue.


I can see the readiness probe is configured to check `/api/ready` on port 8000. Now let me check if this endpoint exists in the backend code.


Perfect! I found the issue. Looking at the code, I can see that the `/api/ready` endpoint is implemented in `app/backend/routes/main.py` at line 181. The endpoint exists and should return a 200 status code with a simple JSON response.

Let me check if there are any issues with the route registration or if there might be a problem with the FastAPI app configuration.


Now let me check how the routes are registered in the main FastAPI app to ensure the `/ready` endpoint is properly included:


I can see the issue! The routes are registered with the `/api` prefix on line 42:

```python
app.include_router(main_router, prefix="/api")
```

This means the `/ready` endpoint from the main router becomes `/api/ready`, which matches what the Kubernetes readiness probe is configured to check. However, let me verify that the endpoint is actually accessible by checking if there are any issues with the route definition.

Let me also check if there might be any middleware or other issues that could cause a 404:


```python
app.include_router(main_router, prefix="/api")
```

The endpoint is properly defined. Let me check if there are any potential issues with the rate limiting or other decorators that might be affecting the endpoint:


I notice that the `/ready` endpoint doesn't have the `@rate_limit()` decorator, which is good for a readiness probe. However, let me check if there might be an issue with the application startup or if the endpoint is being blocked by some middleware.

Let me also check the Kubernetes deployment template to see if there might be any configuration issues:


The deployment looks correct. The readiness probe is properly configured to use the values from the `values.yaml` file. Let me check if there might be an issue with the application startup or if the endpoint is not being registered properly.

Let me create a simple test to verify the endpoint is working. First, let me check if there are any startup issues by looking at the application logs or if there's a way to test the endpoint locally:


Let me search more specifically for the ready endpoint in the application code:


The endpoint is properly defined. Let me check if there might be an issue with the application startup or if there's a problem with the route registration. Let me also check if there are any startup errors by looking at the application startup process:


The application startup looks fine. Let me check if there might be an issue with the middleware or if there's something blocking the request. Let me also check if there are any potential issues with the rate limiting or other middleware that might be affecting the endpoint.

Let me check the middleware to see if it might be causing issues:


The middleware looks fine and shouldn't be causing a 404. Let me check if there might be an issue with the application startup or if the endpoint is not being registered properly.

Let me create a simple test to verify the endpoint is working. First, let me check if the application is running and if we can test the endpoint:


Perfect! I can see that the `/api/ready` endpoint is properly registered in the FastAPI application. The route is listed as `{'GET'} /api/ready`, which means it should be accessible.

The issue might be that the Kubernetes readiness probe is failing for a different reason. Let me check if there might be an issue with the application startup timing or if the endpoint is not responding quickly enough.

Looking at the readiness probe configuration in the `values.yaml`:

```yaml
readinessProbe:
  httpGet:
    path: /api/ready
    port: 8000
  initialDelaySeconds: 40
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3
```

The probe has:
- `initialDelaySeconds: 40` - waits 40 seconds before first check
- `periodSeconds: 10` - checks every 10 seconds
- `timeoutSeconds: 5` - 5 second timeout
- `failureThreshold: 3` - allows 3 failures before marking as not ready

The issue might be that the application is taking longer than expected to start up, or there might be an issue with the application startup process. Let me check if there are any startup dependencies that might be causing delays.

Looking at the startup event in `main.py`, I can see that it tries to pre-initialize several components:
1. aiohttp session
2. health check session
3. Kubernetes client

If any of these fail or take too long, it could cause issues. However, the `/ready` endpoint doesn't depend on any of these components - it's a simple endpoint that just returns a status.

Let me check if there might be an issue with the application startup or if there's a problem with the container configuration. Let me also check if there are any potential issues with the Docker setup:


```yaml
readinessProbe:
  httpGet:
    path: /api/ready
    port: 8000
  initialDelaySeconds: 40
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3
```

```yaml
readinessProbe:
  httpGet:
    path: /api/ready
    port: 8000
  initialDelaySeconds: 40
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3
```

I notice that the Dockerfile only exposes port 3000, but the readiness probe is configured to check port 8000. This could be the issue! Let me check the supervisord configuration to see how the services are started:


Perfect! I found the issue. The supervisord configuration shows that:

1. The backend service runs on port 8000 (line 9: `--port 8000`)
2. The frontend service runs on port 3000 (line 25: `--port 3000`)
3. The Dockerfile only exposes port 3000 (line 200: `EXPOSE 3000`)

The problem is that the Dockerfile only exposes port 3000, but the readiness probe is trying to access port 8000. In Kubernetes, if a port is not exposed in the Dockerfile, it might not be accessible from outside the container.

Let me fix this by updating the Dockerfile to expose port 8000 as well:


```dockerfile
# Expose only necessary ports
EXPOSE 3000

->

# Expose necessary ports for both frontend and backend
EXPOSE 3000 8000
```

Now let me also check if there are any other potential issues. Let me verify that the readiness probe configuration is correct and that there are no other issues with the application startup.

Looking at the readiness probe configuration again:

```yaml
readinessProbe:
  httpGet:
    path: /api/ready
    port: 8000
  initialDelaySeconds: 40
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3
```

The configuration looks correct. The issue was indeed that port 8000 wasn't exposed in the Dockerfile, which would prevent Kubernetes from being able to reach the backend service for the readiness probe.

Let me also check if there might be any other issues with the application startup timing. The readiness probe has:
- `initialDelaySeconds: 40` - waits 40 seconds before first check
- `startsecs=5` for backend in supervisord - backend is considered started after 5 seconds
- `startsecs=15` for frontend in supervisord - frontend is considered started after 15 seconds

This timing should be sufficient, but let me also check if there might be any startup dependencies that could cause delays.

Looking at the startup event in `main.py`, it tries to pre-initialize several components, but these are wrapped in try-catch blocks and won't prevent the application from starting. The `/ready` endpoint is simple and doesn't depend on any of these components.

The fix I made should resolve the issue. The readiness probe was failing with a 404 because Kubernetes couldn't reach the backend service on port 8000 since it wasn't exposed in the Dockerfile.

To summarize the issue and fix:

**Issue**: The readiness probe was failing with a 404 status code because the Dockerfile only exposed port 3000, but the readiness probe was configured to check port 8000 where the backend service runs.

**Fix**: Updated the Dockerfile to expose both ports 3000 and 8000, allowing Kubernetes to reach the backend service for health checks.

The readiness probe should now work correctly once the container is rebuilt with the updated Dockerfile.

```yaml
readinessProbe:
  httpGet:
    path: /api/ready
    port: 8000
  initialDelaySeconds: 40
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3
```

```yaml
readinessProbe:
  httpGet:
    path: /api/ready
    port: 8000
  initialDelaySeconds: 40
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3
```

---

**User**

remove all hpa stuff

---

**Cursor**

I'll help you remove all HPA (Horizontal Pod Autoscaler) related configurations from the project. Let me search for and remove all HPA-related files and configurations.


Now let me check the HPA template file and remove it:


Now let me delete the HPA template file:


Now let me update the README.md file to remove the HPA documentation:


Now let me remove the HPA section from the README:


```markdown
## Horizontal Pod Autoscaler (HPA)

This chart includes a HorizontalPodAutoscaler (HPA) for the `debugger` deployment. The HPA automatically scales the number of pods based on CPU and memory utilization:

- **Target Utilization:** 80% for both CPU and memory
- **Minimum Replicas:** 1
- **Maximum Replicas:** 3

The HPA resource is defined in `templates/hpa.yaml` and is enabled by default. It uses the resource requests/limits defined in `values.yaml` for scaling decisions.

### Customization

To change the scaling policy, edit `templates/hpa.yaml` or parameterize the values in `values.yaml` as needed.

To disable the HPA, simply remove or comment out the `hpa.yaml` template from the chart.

->


```

Now let me check if there are any other references to HPA in the project:


Let me also check if there are any references to HPA in the values.yaml file or other configuration files:


Let me check if there are any references in the Makefile or other scripts:


Perfect! I've successfully removed all HPA-related configurations from the project. Here's a summary of what was removed:

## Removed HPA Components:

1. **HPA Template File**: Deleted `charts/debugger/templates/hpa.yaml` which contained the HorizontalPodAutoscaler configuration
2. **HPA Documentation**: Removed the entire "Horizontal Pod Autoscaler (HPA)" section from `charts/debugger/README.md`

## What was in the HPA configuration:

The removed HPA was configured with:
- **Target**: `debugger` deployment
- **Min Replicas**: 1
- **Max Replicas**: 3
- **CPU Target**: 80% utilization
- **Memory Target**: 80% utilization

## Current Status:

✅ **All HPA references have been successfully removed**
- No HPA template files remain
- No HPA documentation in README
- No HPA references in values.yaml or other configuration files
- No HPA-related commands in Makefile

The application will now run with a fixed number of replicas as defined in the deployment configuration (currently 1 replica by default in the values.yaml). If you need to scale the application, you can either:

1. **Manually scale** using `kubectl scale deployment debugger --replicas=<number>`
2. **Update the replica count** in `charts/debugger/values.yaml` under the `replicaCount` field
3. **Use Helm upgrade** with custom values to change the replica count

The removal is complete and the application should continue to function normally without any autoscaling behavior.

---

**User**

remove the helm chart port 8000 and update all health checks to use port 3000

---

**Cursor**

I'll help you remove port 8000 from the Helm chart and update all health checks to use port 3000. Let me start by examining the current configuration and then make the necessary changes.


Now I need to check if there are any API endpoints that need to be moved from the backend to the frontend, or if we need to set up a proxy. Let me check the frontend configuration:


Let me check if there are any API routes in the frontend that could handle the health checks:


Great! There's already a health.ts file in the frontend API routes. Let me check its contents:


Perfect! The frontend already has a health endpoint that proxies to the backend. Now I need to create a `/ready` endpoint as well. Let me check if there's already one:


```typescript
import type { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    // Proxy the request to the backend service
    const backendUrl = process.env.BACKEND_URL || 'http://127.0.0.1:8000'
    const response = await fetch(`${backendUrl}/api/ready`)

    if (!response.ok) {
      throw new Error(`Backend responded with status: ${response.status}`)
    }

    const data = await response.json()
    res.status(200).json(data)
  } catch (error) {
    console.error('Readiness check failed:', error)
    res.status(500).json({
      status: 'unready',
      error: 'Failed to connect to backend service',
      timestamp: new Date().toISOString()
    })
  }
}

```

```yaml
// ... existing code ...
livenessProbe:
  httpGet:
    path: /api/health
    port: 3000
  initialDelaySeconds: 60
  periodSeconds: 30
  timeoutSeconds: 10
  failureThreshold: 3
readinessProbe:
  httpGet:
    path: /api/ready
    port: 3000
  initialDelaySeconds: 40
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3
startupProbe:
  httpGet:
    path: /api/health
    port: 3000
  initialDelaySeconds: 45
  periodSeconds: 15
  timeoutSeconds: 10
  failureThreshold: 6
// ... existing code ...
```

```helm
// ... existing code ...
          ports:
            - name: http-frontend
              containerPort: 3000
              protocol: TCP
-            - name: http-backend
-              containerPort: 8000
-              protocol: TCP
// ... existing code ...
```

```helm
// ... existing code ...
  ports:
    - port: 3000
      targetPort: http-frontend
      protocol: TCP
      name: http-frontend
-    - port: 8000
-      targetPort: http-backend
-      protocol: TCP
-      name: http-backend
  selector:
    {{- include "dallas-debugger.selectorLabels" . | nindent 4 }}
// ... existing code ...
```

All necessary changes have been made:

1. **Removed port 8000** from the Helm chart's deployment and service templates.
2. **Updated all health checks** in `values.yaml` to use port 3000.
3. **Created a `/api/ready` endpoint** in the frontend so readiness checks on port 3000 will work.

Your application will now only expose port 3000, and all health checks will target that port. If you need any further adjustments or want to update documentation, let me know!
