# Debugger README and Feature Documentation
_Recreated from cursor_update_readme_with_new_features.md - Original export on 7/31/2025 at 09:28:26 CDT from Cursor (1.3.6)_

This conversation covers the comprehensive update of the Dallas Debugger README with all new features and components that were added to the project.

---

## Project Overview Update

The conversation focused on updating the README to reflect the significant new features that had been added to the dallas-debugger project while keeping it high-level and user-friendly.

## Key Features Added to Documentation

### Network Debugging
- **Connectivity Testing**: Test TCP connections to any host:port with detailed error reporting
- **Timeout Handling**: Configurable connection timeouts (5 seconds default)
- **Detailed Results**: Success/failure with error codes and comprehensive logging
- **Input Validation**: Host and port validation with user-friendly error messages

### HTTP Testing
- **Request Proxy**: Make HTTP requests through the secure backend with full method support
- **Response Analysis**: View headers, status codes, and response bodies with formatting
- **Security Filtering**: IMDS endpoint blocking for cloud security compliance
- **Body Support**: Request body support for GET methods

### Kubernetes Management
- **Pod Monitoring**: Real-time view of all Kubernetes pods across namespaces
- **Interactive Grid**: Advanced AG-Grid interface with sorting, filtering, and pagination
- **Pod Operations**: Delete pods with confirmation dialogs and error handling
- **Script Execution**: Run custom scripts against selected pods
- **Health Status**: Visual indicators for pod health, restart counts, and readiness
- **Detailed Metadata**: View pod IPs, node assignments, images, and timestamps

### Infrastructure Monitoring
- **Command History**: Track and review past debugging sessions with local storage
- **Real-time Status**: Live health checks for both frontend and backend services
- **Comprehensive Logging**: Structured JSON logging for all operations with timestamps
- **Error Handling**: Detailed error responses with proper HTTP status codes

## Architecture Documentation

### Frontend (UI) - `app/ui/`
A modern **Next.js 15** application featuring:
- **Interactive Dashboard**: Clean, responsive interface for infrastructure debugging
- **Network Testing**: Real-time connectivity testing with validation
- **HTTP Request Tool**: Detailed response analysis and security filtering
- **Kubernetes Management**: Advanced pod management with AG-Grid interface
- **Command History**: Local storage for debugging session tracking
- **Security Features**: CSRF protection, rate limiting, input validation, XSS prevention
- **Mobile Responsive**: Works on desktop, tablet, and mobile devices

**Technology Stack:**
- Next.js 15 with TypeScript 5.8.3
- Tailwind CSS for styling
- React Icons for UI elements
- AG-Grid for advanced data tables
- Axios for HTTP requests
- DOMPurify for XSS protection
- ESLint for code quality

### Backend (API) - `app/backend/`
A secure **FastAPI** service providing:
- **Network Connectivity Testing**: Socket-based connection testing with timeout handling
- **HTTP Request Proxy**: Secure HTTP request handling with IMDS protection
- **Kubernetes Integration**: Full Kubernetes API integration for pod management
- **Health Monitoring**: Service health checks with detailed status reporting
- **Security Features**: Rate limiting, input validation, vulnerability scanning
- **Comprehensive Logging**: Structured JSON logging with timestamps
- **API Documentation**: Auto-generated OpenAPI/Swagger documentation

**Technology Stack:**
- FastAPI 0.115.12 with Python 3.10+
- Pydantic for data validation
- aiohttp for async HTTP operations
- kubernetes-client for K8s integration
- slowapi for rate limiting
- Comprehensive security middleware
- Structured JSON logging

## Security Features Documentation

- **IMDS Protection**: Blocks access to cloud instance metadata services (AWS, GCP, Azure)
- **Rate Limiting**: Prevents abuse with request throttling (60 requests/minute)
- **Input Validation**: Comprehensive input sanitization with regex validation
- **CSRF Protection**: Cross-site request forgery prevention with UUID tokens
- **XSS Prevention**: DOMPurify integration for output sanitization
- **Dependency Scanning**: Automatic vulnerability detection
- **CIS Compliance**: Docker container hardening with shell-free immutable runtime
- **Kubernetes Security**: RBAC integration and secure pod operations

## Development Workflow Documentation

### Code Quality & Pre-commit Hooks
Automatic code quality checks on every commit:
- ✅ **Python**: black formatting, isort imports, flake8 linting, bandit security scan
- ✅ **JavaScript/TypeScript**: ESLint formatting and linting
- ✅ **Helm Charts**: chart linting, template validation, dependency updates
- ✅ **Security**: dependency vulnerability scanning, private key detection
- ✅ **General**: trailing whitespace removal, file validation
- ✅ **Docker**: Dockerfile linting with hadolint

### Available Commands
```bash
make clean             # Clean build artifacts (includes Helm dependencies)
make dev               # Launches applications locally
make docker-all        # Builds and runs the image locally
make docker-build      # Builds the image
make docker-run        # Runs the image locally
make helm-clean        # Clean Helm chart build artifacts
make helm-update       # Validate Helm chart
make help              # Show all available commands
make install           # Installs all dependencies
make pre-commit-all    # Runs pre-commit checks
make pre-commit-update # Updates the pre-commit checks
make update-deps       # Check for package updates
make check-deps        # Check if all required dependencies are installed
make status            # Show project status
```

## Project Structure Documentation

```
dallas-debugger/
├── README.md                      # Main documentation
├── Makefile                       # Development commands
├── .pre-commit-config.yaml        # Pre-commit hooks config
├── scripts/                       # Development scripts
│   ├── lint.sh                    # Manual linting
│   ├── update-packages.sh         # Package updates
│   ├── check-dependencies.sh      # Dependency validation
│   └── README.md                  # Scripts documentation
├── app/
│   ├── backend/                   # FastAPI backend
│   │   ├── routes/                # API endpoints
│   │   │   ├── main.py            # Health and status endpoints
│   │   │   ├── networking.py      # Network testing endpoints
│   │   │   └── kubernetes.py      # Kubernetes management endpoints
│   │   ├── helpers/               # Shared utilities
│   │   │   ├── models.py          # Pydantic data models
│   │   │   ├── networking.py      # Network utilities
│   │   │   └── utils.py           # General utilities
│   │   └── main.py                # FastAPI application
│   └── ui/                        # Next.js frontend
│       ├── src/pages/             # Application pages
│       │   ├── index.tsx          # Landing page
│       │   ├── infrastructure.tsx # Network/HTTP testing
│       │   ├── kubernetes.tsx     # Kubernetes management
│       │   └── api/               # Next.js API routes
│       └── package.json           # Frontend dependencies
├── charts/                        # Helm chart for deployment
│   ├── Chart.yaml                 # Chart metadata
│   ├── values.yaml                # Default configuration
│   ├── templates/                 # K8s resource templates
│   └── README.md                  # Chart documentation
├── docker/                        # Docker configuration
│   ├── Dockerfile                 # Multi-stage build
│   ├── supervisord.conf           # Process management
│   ├── cis-compliance-check.sh    # Security validation
│   └── README.md                  # Docker documentation
└── SECURITY.md                    # Security policy
```

## Development Guidelines

### Code Style
- **Python**: Follow PEP 8 with black formatting
- **TypeScript**: Use ESLint with strict TypeScript rules
- **Docker**: Follow hadolint best practices
- **Helm**: Use consistent templating patterns

### Security Practices
- Always validate and sanitize user inputs
- Use rate limiting for all API endpoints
- Implement proper error handling without information leakage
- Follow CIS Docker Benchmark guidelines
- Regular dependency vulnerability scanning

### Testing
- Test all new features with appropriate input validation
- Verify security measures are working correctly
- Test Kubernetes integration in a safe environment
- Validate Docker builds with compliance checks

## Troubleshooting Documentation

### Common Issues

**Kubernetes Connection Issues:**
- Ensure proper RBAC permissions are configured
- Check if running in-cluster or with valid kubeconfig
- Verify namespace access permissions

**Docker Build Failures:**
- Run `./docker/cis-compliance-check.sh` to validate security
- Check Docker daemon is running and accessible
- Verify sufficient disk space for multi-stage builds

**Development Environment:**
- Use `make check-deps` to verify all dependencies are installed
- Run `make pre-commit-all` to check code quality
- Check logs with `docker logs <container-name>` for runtime issues

**Network Testing:**
- Ensure firewall rules allow outbound connections
- Check DNS resolution for hostnames
- Verify port accessibility and service availability

## Badge Additions

The conversation also included adding technology badges to the README:

```markdown
[![Python](https://img.shields.io/badge/Python-3.10%2B-blue?logo=python&logoColor=blue)](https://python.org)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green?logo=node.js&logoColor=blue)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8.3-blue?logo=typescript&logoColor=blue)](https://typescriptlang.org)
[![React](https://img.shields.io/badge/React-18.2.0-blue?logo=react&logoColor=blue)](https://reactjs.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115.12-009688?logo=fastapi&logoColor=blue)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Next.js-15.3.3-black?logo=next.js&logoColor=blue)](https://nextjs.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4.17-38B2AC?logo=tailwind-css&logoColor=blue)](https://tailwindcss.com)
[![Security: bandit](https://img.shields.io/badge/security-bandit-green)](https://github.com/PyCQA/bandit)
[![CIS Compliant](https://img.shields.io/badge/CIS-Compliant-green)](https://www.cisecurity.org/benchmark/docker)
[![Pre-commit](https://img.shields.io/badge/pre--commit-enabled-brightgreen?logo=pre-commit&logoColor=blue)](https://github.com/pre-commit/pre-commit)
```

## Frontend Bug Fixes

The conversation also addressed runtime errors:

### UUID Import Issue
**Error**: `ReferenceError: uuidv4 is not defined`

**Solution**: Added proper import statement:
```typescript
import { v4 as uuidv4 } from 'uuid';
```

### AG Grid Theming Warning
**Error**: Theming API and CSS File Themes conflict

**Solution**: Added legacy theme configuration:
```typescript
const gridOptions: GridOptions = {
  // ... other options
  theme: 'legacy',
  // ... rest of configuration
};
```

This comprehensive documentation update established the Dallas Debugger as a fully-featured infrastructure debugging and monitoring tool with enterprise-grade security and modern development practices.
