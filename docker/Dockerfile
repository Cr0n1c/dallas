# Multi-stage Dockerfile for Infrastructure Debugger - CIS Compliant & Shell-Hardened
# Builds both UI (Next.js) and Backend (FastAPI) applications with security hardening

# Stage 1: Build Next.js frontend
FROM node:18.20.4-alpine3.20 AS frontend-builder

# Configure shell for consistency and safety
SHELL ["/bin/sh", "-o", "pipefail", "-c"]

# Create non-root user for build process
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

WORKDIR /app/ui

# Ensure proper ownership of work directory
RUN chown -R nextjs:nodejs /app

# Copy package files with proper ownership
COPY --chown=nextjs:nodejs app/ui/package*.json ./

# Switch to non-root user for npm operations
USER nextjs

# Install all dependencies (including dev dependencies for build)
RUN npm ci --no-audit --no-fund

# Copy source code with proper ownership
COPY --chown=nextjs:nodejs app/ui/ ./

# Ensure public directory exists and is not empty (in case it's empty)
RUN mkdir -p public && touch public/.gitkeep

# Set environment variable for build time
ENV BACKEND_URL=http://127.0.0.1:8000

# Build the application
RUN npm run build

# Stage 2: Prepare Python backend dependencies
FROM python:3.12.8-slim-bookworm AS backend-builder

# Configure shell for consistency and safety
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Install security updates and minimal dependencies
RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get install -y --no-install-recommends \
        gcc \
        libc6-dev && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Create non-root user
RUN groupadd -r appuser && useradd -r -g appuser appuser

WORKDIR /app/backend

# Copy requirements first for better caching
COPY app/backend/requirements.txt ./

# Install Python dependencies with pinned pip version
RUN pip install --no-cache-dir --upgrade "pip>=24.0,<25.0" && \
    pip install --no-cache-dir -r requirements.txt && \
    pip list --format=freeze > installed_packages.txt

# Stage 3: Final runtime image with security hardening and no shell access
FROM python:3.12.8-slim-bookworm AS runtime

# Configure shell for consistency and safety
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Install security updates and comprehensive network tools for socket operations
RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get install -y --no-install-recommends \
        supervisor \
        ca-certificates \
        gnupg2 \
        netbase \
        iproute2 \
        procps && \
    # Install Node.js with specific version using direct package installation
    echo "deb https://deb.nodesource.com/node_18.x bookworm main" > /etc/apt/sources.list.d/nodesource.list && \
    apt-key adv --keyserver keyserver.ubuntu.com --recv-keys 1655A0AB68576280 && \
    apt-get update && \
    apt-get install -y --no-install-recommends nodejs && \
    # Security cleanup - remove HTTP download tools and unnecessary packages
    { apt-get purge -y --auto-remove gnupg2 curl wget fetch; } 2>/dev/null || true && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* /var/cache/* && \
    # Remove HTTP download tool binaries if they exist
    { rm -f /usr/bin/curl /usr/bin/wget /usr/bin/fetch /bin/curl /bin/wget /bin/fetch; } 2>/dev/null || true && \
    # Remove unnecessary files
    find /usr -name "*.pyc" -delete && \
    find /usr -name "__pycache__" -delete

# Create non-root user with comprehensive network access groups and NO SHELL ACCESS
RUN groupadd -r appuser && useradd -r -g appuser -u 1001 -s /bin/false appuser && \
    # Add user to groups that enable network operations and localhost communication
    usermod -a -G users,dialout,netdev appuser && \
    # Ensure network configuration files are readable
    chmod 644 /etc/services /etc/protocols && \
    # Create /etc/netgroup if it doesn't exist (required by some network operations)
    touch /etc/netgroup && chmod 644 /etc/netgroup && \
    # Ensure localhost/loopback interface configuration
    echo "127.0.0.1 localhost" >> /etc/hosts && \
    echo "::1 localhost ip6-localhost ip6-loopback" >> /etc/hosts && \
    # Configure loopback interface permissions (ignore errors if file is read-only)
    { echo "net.ipv4.ip_unprivileged_port_start = 0" >> /etc/sysctl.conf; } || true

# Create application directories with proper permissions
RUN mkdir -p /app/backend /app/ui /var/log/supervisor /var/run/supervisor && \
    chown -R appuser:appuser /app && \
    chown -R appuser:appuser /var/log/supervisor /var/run/supervisor && \
    chmod 755 /app && \
    chmod 750 /var/log/supervisor /var/run/supervisor

# Create writable directories for Python and supervisor
RUN mkdir -p /tmp /var/tmp /usr/tmp && \
    chown -R appuser:appuser /tmp /var/tmp /usr/tmp && \
    chmod 1777 /tmp /var/tmp /usr/tmp

# Set Python environment variables to use writable directories
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app/backend \
    TMPDIR=/tmp \
    TEMP=/tmp \
    TMP=/tmp \
    BACKEND_URL=http://127.0.0.1:8000

WORKDIR /app

# Copy Python dependencies from backend-builder
COPY --from=backend-builder --chown=appuser:appuser /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=backend-builder --chown=appuser:appuser /usr/local/bin /usr/local/bin

# Copy backend application with proper ownership and permissions
COPY --chown=appuser:appuser app/backend/ ./backend/
RUN chmod -R 755 ./backend/ && chmod +x ./backend/main.py

# Copy built frontend from frontend-builder with appuser ownership
RUN mkdir -p ./ui ./ui/public
COPY --from=frontend-builder --chown=appuser:appuser /app/ui/.next ./ui/.next
COPY --from=frontend-builder --chown=appuser:appuser /app/ui/public ./ui/public
COPY --from=frontend-builder --chown=appuser:appuser /app/ui/package*.json ./ui/
COPY --from=frontend-builder --chown=appuser:appuser /app/ui/node_modules ./ui/node_modules
COPY --from=frontend-builder --chown=appuser:appuser /app/ui/tailwind.config.js ./ui/
COPY --from=frontend-builder --chown=appuser:appuser /app/ui/postcss.config.js ./ui/
COPY --from=frontend-builder --chown=appuser:appuser /app/ui/tsconfig.json ./ui/
COPY --from=frontend-builder --chown=appuser:appuser /app/ui/next-env.d.ts ./ui/
COPY --from=frontend-builder --chown=appuser:appuser /app/ui/.eslintrc.json ./ui/

# Create and configure supervisor with security settings
COPY --chown=root:root --chmod=644 docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Configure localhost networking and permissions
RUN echo "# Allow localhost communication for application services" > /etc/security/limits.d/localhost.conf && \
    echo "appuser soft nofile 65536" >> /etc/security/limits.d/localhost.conf && \
    echo "appuser hard nofile 65536" >> /etc/security/limits.d/localhost.conf && \
    chmod 644 /etc/security/limits.d/localhost.conf

# Security: Remove setuid/setgid permissions from binaries (keep network tools functional)
RUN find /usr -perm /6000 -type f -not -path "*/ping*" -not -path "*/su*" -exec chmod a-s {} + 2>/dev/null || true

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

# Expose necessary ports for both frontend and backend
EXPOSE 3000 8000

# Add security labels including shell-hardened and download-tools-disabled designation
LABEL security.scan="enabled" \
      security.non-root="true" \
      security.network="localhost-enabled" \
      security.shell="disabled" \
      security.download-tools="disabled" \
      security.hardened="true" \
      maintainer="cr0n1c" \
      version="1.0" \
      description="CIS compliant Infrastructure Debugger container with shell and HTTP download tools disabled"

# Health check with localhost connectivity verification using Python socket
HEALTHCHECK --interval=60s --timeout=10s --start-period=60s --retries=3 \
    CMD python -c "import socket,sys; s1=socket.socket(); s1.settimeout(5); r1=s1.connect_ex(('localhost',8000)); s1.close(); sys.exit(0 if r1==0 else 1)" || exit 1

# Switch to non-root user with no shell access before running
USER appuser

# Use exec form and run supervisor with limited privileges
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf", "-n"]
