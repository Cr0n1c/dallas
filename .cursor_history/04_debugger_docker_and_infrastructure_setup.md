# Debugger Docker and Infrastructure Setup
_Compiled from multiple cursor history conversations about Docker configuration and infrastructure setup_

This document captures the Docker configuration, infrastructure setup, and deployment processes for the Dallas Debugger application.

---

## Docker Configuration Overview

The Dallas Debugger uses a multi-stage Docker build process with comprehensive security hardening and CIS compliance measures.

### Dockerfile Structure

#### Multi-Stage Build Process
The Dockerfile uses multiple stages for optimization:
1. **Base Stage**: Sets up the foundational environment
2. **Backend Dependencies**: Installs Python dependencies
3. **Frontend Dependencies**: Installs Node.js dependencies and builds the frontend
4. **Final Stage**: Combines everything with security hardening

#### Key Security Features
- **Non-root user**: Runs as user 1001 (appuser)
- **Shell hardening**: Removes shell access for security
- **CIS compliance**: Follows CIS Docker Benchmark guidelines
- **Minimal attack surface**: Removes unnecessary tools and binaries

### Backend Setup
```dockerfile
# Copy backend application with proper ownership and permissions
COPY --chown=appuser:appuser app/backend/ ./backend/
RUN chmod -R 755 ./backend/ && chmod +x ./backend/main.py
```

**Key Fix**: Initially had permission issues with `--chmod=644` which prevented Python from importing modules from directories. Fixed by using `chmod -R 755` to ensure directories are executable.

### Frontend Setup
```dockerfile
# Build frontend
WORKDIR /app/ui
COPY app/ui/package*.json ./
RUN npm ci --only=production

COPY app/ui/ ./
RUN npm run build
```

### Supervisor Configuration
Uses supervisord to manage both frontend and backend processes:

```ini
[supervisord]
nodaemon=true
user=appuser
logfile=/var/log/supervisor/supervisord.log
pidfile=/var/run/supervisor/supervisord.pid

[program:backend]
command=python main.py
directory=/app/backend
user=appuser
stdout_logfile=/var/log/supervisor/backend_stdout.log
stderr_logfile=/var/log/supervisor/backend_stderr.log
autorestart=true

[program:frontend]
command=npm start
directory=/app/ui
user=appuser
stdout_logfile=/var/log/supervisor/frontend_stdout.log
stderr_logfile=/var/log/supervisor/frontend_stderr.log
autorestart=true
```

## Build and Deployment Commands

### Local Development
```bash
# Install all dependencies
make install

# Start development servers
make dev

# Build Docker image
make docker-build

# Run Docker container locally
make docker-run

# Build and run (complete workflow)
make docker-all
```

### Docker Commands
```bash
# Build the debugger image
docker build -t dallas-debugger:latest .

# Run with port mapping
docker run -p 3000:3000 --name dallas-debugger-container --rm dallas-debugger:latest

# Run in background
docker run -d -p 3000:3000 --name dallas-debugger-container dallas-debugger:latest

# Check container status
docker ps

# View logs
docker logs dallas-debugger-container

# Stop container
docker stop dallas-debugger-container
```

### Debugging Container Issues
```bash
# Access container (when shell is available)
docker exec -it dallas-debugger-container /bin/bash

# View supervisor logs
docker exec dallas-debugger-container cat /var/log/supervisor/backend_stderr.log
docker exec dallas-debugger-container cat /var/log/supervisor/frontend_stdout.log

# Check file permissions
docker exec dallas-debugger-container ls -la /app/backend/routes/

# Test application endpoints
curl http://localhost:3000/api/health
curl http://localhost:3000/api/ready
```

## Infrastructure Architecture

### Service Architecture
The application consists of two main services:
- **Frontend**: Next.js application serving the UI (port 3000)
- **Backend**: FastAPI service providing APIs (port 8000, internal)

### Communication Flow
```
User Request → Frontend (port 3000) → Backend APIs (internal) → Kubernetes API
```

### Volume Mounts
The container uses several volume mounts for runtime data:
```yaml
volumeMounts:
  - name: tmp-volume
    mountPath: /tmp
  - name: var-tmp-volume
    mountPath: /var/tmp
  - name: usr-tmp-volume
    mountPath: /usr/tmp
  - name: supervisor-logs
    mountPath: /var/log/supervisor
  - name: supervisor-run
    mountPath: /var/run/supervisor
```

## Security Hardening

### CIS Compliance Features
```dockerfile
# Final security hardening - remove shell access, HTTP download tools, and interactive tools
RUN set -e; \
    # Remove HTTP download tools (ignore if not present)
    { rm -f /usr/bin/curl /usr/bin/wget /usr/bin/fetch /bin/curl /bin/wget /bin/fetch; } 2>/dev/null || true; \
    # Remove interactive tools (ignore if not present)
    { rm -f /usr/bin/vi /usr/bin/vim /usr/bin/nano /usr/bin/emacs; } 2>/dev/null || true; \
    # Remove shell-like tools (ignore if not present)
    { rm -f /usr/bin/script /usr/bin/scriptreplay; } 2>/dev/null || true; \
    # Disable shell binaries (ignore if not present)
    { chmod 000 /bin/bash /bin/dash /usr/bin/bash; } 2>/dev/null || true; \
    { rm -f /bin/bash /bin/dash /usr/bin/bash /usr/bin/sh; } 2>/dev/null || true; \
    # Create fallback links (ignore if not possible)
    { ln -sf /bin/false /bin/bash; } 2>/dev/null || true; \
    { ln -sf /bin/false /bin/sh; } 2>/dev/null || true; \
    { ln -sf /bin/false /usr/bin/bash; } 2>/dev/null || true
```

### User Security
```dockerfile
# Create non-root user with comprehensive network access groups and NO SHELL ACCESS
RUN groupadd -r appuser && useradd -r -g appuser -u 1001 -s /bin/false appuser
```

### CIS Compliance Validation
```bash
# Run CIS compliance check
./docker/cis-compliance-check.sh

# Example checks performed:
# - Non-root user verification
# - No shell access verification
# - File permission validation
# - Security configuration verification
```

## Environment Configuration

### Environment Variables
```dockerfile
ENV LOG_LEVEL=INFO
ENV PYTHONPATH=/app/backend
ENV NODE_ENV=production
```

### Runtime Configuration
- **Log Level**: Configurable via Helm values or environment variable
- **Python Path**: Set to backend directory for module imports
- **Node Environment**: Set to production for optimized builds

## Image Management

### ECR Integration
The Helm chart is configured to pull from Amazon ECR:
```yaml
image: "{{ .Values.image.ecrRegistry }}.dkr.ecr.us-east-1.amazonaws.com/debugger:{{ .Values.image.tag }}"
imagePullPolicy: Always
```

### Tagging Strategy
- **Latest**: For development and testing
- **Version tags**: For production deployments (e.g., v1.0.0)
- **SHA tags**: For specific commit deployments

## Performance Optimizations

### Build Optimizations
- **Multi-stage builds**: Reduces final image size
- **Layer caching**: Optimized COPY order for better caching
- **Production dependencies only**: Excludes development tools

### Runtime Optimizations
- **Supervisor process management**: Efficient process lifecycle management
- **Non-interactive mode**: Reduces resource overhead
- **Structured logging**: Efficient log processing and storage

## Troubleshooting Common Issues

### Permission Problems
**Symptom**: Backend fails to start with import errors
**Solution**: Ensure directories have execute permissions (755)

### Container Won't Start
**Symptom**: Container exits immediately
**Solution**: Check supervisor logs and validate Dockerfile syntax

### Network Connectivity Issues
**Symptom**: Cannot reach internal services
**Solution**: Verify port mappings and internal service configuration

### Security Access Issues
**Symptom**: Cannot exec into container
**Solution**: Security hardening removes shell access by design - use log viewing instead

### Memory/Resource Issues
**Symptom**: Container OOM or CPU throttling
**Solution**: Adjust resource limits in Helm values

## Best Practices

### Development Workflow
1. **Local Testing**: Always test Docker builds locally before deployment
2. **Layer Optimization**: Order Dockerfile commands for optimal caching
3. **Security Scanning**: Run CIS compliance checks before pushing images
4. **Resource Planning**: Set appropriate CPU and memory limits

### Production Deployment
1. **Image Versioning**: Use specific version tags, not 'latest'
2. **Health Checks**: Configure appropriate probe timeouts
3. **Resource Monitoring**: Monitor container resource usage
4. **Log Management**: Ensure structured logging is properly configured

### Security Considerations
1. **Regular Updates**: Keep base images and dependencies updated
2. **Vulnerability Scanning**: Regularly scan images for vulnerabilities
3. **Access Control**: Implement proper RBAC for Kubernetes deployments
4. **Secret Management**: Use Kubernetes secrets for sensitive data

This Docker and infrastructure setup provides a secure, scalable foundation for the Dallas Debugger application with comprehensive monitoring and debugging capabilities.
