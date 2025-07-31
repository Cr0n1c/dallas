# Dallas Debugger - Makefile
# Development and deployment commands for the Dallas Debugger project

.PHONY: help install clean dev docker-build docker-run docker-all helm-update helm-clean kube-lint pre-commit-all pre-commit-update update-deps check-deps-only

# Colors for output
GREEN=\033[0;32m
YELLOW=\033[1;33m
RED=\033[0;31m
NC=\033[0m # No Color

# Default target
help: ## Show all available commands
	@echo "$(GREEN)Dallas Debugger - Available Commands$(NC)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "$(YELLOW)%-20s$(NC) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(GREEN)Quick Start:$(NC)"
	@echo "  make install    # Install all dependencies"
	@echo "  make dev        # Start development servers"

install: ## Install all dependencies and setup development environment
	@echo "$(GREEN)📦 Installing all dependencies...$(NC)"
	@echo "$(YELLOW)Installing kube-linter...$(NC)"
	brew install kube-linter || echo "$(RED)Warning: Failed to install kube-linter. You may need to install it manually.$(NC)"
	@echo "$(YELLOW)Installing pre-commit...$(NC)"
	brew install pre-commit || echo "$(RED)Warning: Failed to install pre-commit. You may need to install it manually.$(NC)"
	@echo "$(YELLOW)Installing trivy...$(NC)"
	brew install trivy || echo "$(RED)Warning: Failed to install trivy. You may need to install it manually.$(NC)"
	@echo "$(YELLOW)Installing Python backend dependencies...$(NC)"
	cd app/backend && python3 -m venv venv && source venv/bin/activate && pip install --upgrade pip && pip install -r requirements.txt
	@echo "$(YELLOW)Installing Node.js frontend dependencies...$(NC)"
	cd app/ui && npm install
	@echo "$(YELLOW)Installing pre-commit hooks...$(NC)"
	pre-commit install || echo "$(RED)Warning: pre-commit not found, install with: pip install pre-commit$(NC)"
	@echo "$(GREEN)✅ Installation complete!$(NC)"

clean: ## Clean build artifacts (includes Helm dependencies)
	@echo "$(GREEN)🧹 Cleaning build artifacts...$(NC)"
	@echo "$(YELLOW)Cleaning Python cache...$(NC)"
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true
	@echo "$(YELLOW)Cleaning Node.js artifacts...$(NC)"
	cd app/ui && rm -rf .next node_modules/.cache 2>/dev/null || true
	@echo "$(YELLOW)Cleaning Helm dependencies...$(NC)"
	$(MAKE) helm-clean
	@echo "$(GREEN)✅ Cleanup complete!$(NC)"

dev: ## Start development servers (both frontend and backend)
	@echo "$(GREEN)🚀 Starting development environment...$(NC)"
	@echo "$(YELLOW)This will start:$(NC)"
	@echo "  - Frontend: http://localhost:3000"
	@echo "  - Backend: http://localhost:8000"
	@echo "  - API Docs: http://localhost:8000/docs"
	@echo ""
	cd app/ui && npm run dev

docker-build: ## Build the Docker image
	@echo "$(GREEN)🐳 Building Docker image...$(NC)"
	docker build -t dallas-debugger:latest -f docker/Dockerfile .
	@echo "$(GREEN)✅ Docker image built: dallas-debugger:latest$(NC)"

docker-run: ## Run the Docker image locally
	@echo "$(GREEN)🐳 Running Docker container...$(NC)"
	@echo "$(YELLOW)Starting container on:$(NC)"
	@echo "  - Frontend: http://localhost:3000"
	docker run -p 3000:3000 --name dallas-debugger-container --rm dallas-debugger:latest

docker-all: docker-build docker-run ## Build and run the Docker image locally

helm-update: ## Validate Helm chart
	@echo "$(GREEN)⚓ Validating Helm chart...$(NC)"
	(cd charts/debugger && helm dependency update && helm lint . --strict)
	@echo "$(GREEN)🔍 Running kube-linter on Helm chart...$(NC)"
	(cd charts/debugger && helm template . | kube-linter lint --exclude latest-tag,use-namespace,minimum-three-replicas,no-rolling-update-strategy - || echo "$(RED)❌ kube-linter found issues$(NC)")
	@echo "$(GREEN)✅ Helm chart validation complete!$(NC)"

helm-clean: ## Clean Helm chart build artifacts
	@echo "$(GREEN)🧹 Cleaning Helm artifacts...$(NC)"
	rm -rf charts/debugger/charts/* 2>/dev/null || true
	rm -f charts/debugger/Chart.lock 2>/dev/null || true
	@echo "$(GREEN)✅ Helm cleanup complete!$(NC)"

pre-commit-all: ## Run pre-commit checks
	@echo "$(GREEN)✅ Running pre-commit checks...$(NC)"
	pre-commit run --all-files || echo "$(RED)Pre-commit checks failed. Fix issues and try again.$(NC)"

pre-commit-update: ## Update pre-commit hooks
	@echo "$(GREEN)🔄 Updating pre-commit hooks...$(NC)"
	pre-commit autoupdate
	@echo "$(GREEN)✅ Pre-commit hooks updated!$(NC)"

pre-commit-deps: ## Run dependency update as pre-commit hook
	@echo "$(GREEN)📦 Running dependency update check...$(NC)"
	pre-commit run update-dependencies --all-files || echo "$(RED)Dependency update check failed.$(NC)"

update-deps: ## Update all dependencies to latest compatible versions
	@echo "$(GREEN)📦 Updating all dependencies...$(NC)"
	./scripts/update-packages.sh

check-deps-only: ## Check for outdated dependencies without updating
	@echo "$(GREEN)📋 Checking for outdated dependencies...$(NC)"
	@echo "$(YELLOW)Python packages:$(NC)"
	@cd app/backend && pip list --outdated || echo "  No outdated packages found"
	@echo "$(YELLOW)Node.js packages:$(NC)"
	@cd app/ui && npm outdated || echo "  No outdated packages found"

# Development helpers
lint: ## Run linting checks manually
	@echo "$(GREEN)🔍 Running linting checks...$(NC)"
	./scripts/lint.sh

backend-dev: ## Start only the backend development server
	@echo "$(GREEN)🔧 Starting backend development server...$(NC)"
	cd app/backend && bash setup.sh

frontend-dev: ## Start only the frontend development server
	@echo "$(GREEN)🌐 Starting frontend development server...$(NC)"
	cd app/ui && npm run dev:frontend

# Docker helpers
docker-stop: ## Stop and remove Docker container
	@echo "$(GREEN)🛑 Stopping Docker container...$(NC)"
	docker stop dallas-debugger-container 2>/dev/null || true
	docker rm dallas-debugger-container 2>/dev/null || true

docker-logs: ## Show Docker container logs
	@echo "$(GREEN)📋 Docker container logs:$(NC)"
	docker logs dallas-debugger-container

# Utility commands
check-deps: ## Check if all required dependencies are installed
	@echo "$(GREEN)🔍 Checking dependencies...$(NC)"
	@echo "$(YELLOW)Python version:$(NC)"
	python3 --version || echo "$(RED)❌ Python 3 not found$(NC)"
	@echo "$(YELLOW)Node.js version:$(NC)"
	node --version || echo "$(RED)❌ Node.js not found$(NC)"
	@echo "$(YELLOW)Docker version:$(NC)"
	docker --version || echo "$(RED)❌ Docker not found$(NC)"
	@echo "$(YELLOW)Helm version:$(NC)"
	helm version --short 2>/dev/null || echo "$(RED)❌ Helm not found$(NC)"
	@echo "$(GREEN)✅ Dependency check complete!$(NC)"

status: ## Show project status
	@echo "$(GREEN)📊 Project Status:$(NC)"
	@echo "$(YELLOW)Backend status:$(NC)"
	@cd app/backend && (test -d venv && echo "  ✅ Virtual environment exists" || echo "  ❌ Virtual environment missing")
	@echo "$(YELLOW)Frontend status:$(NC)"
	@cd app/ui && (test -d node_modules && echo "  ✅ Node modules installed" || echo "  ❌ Node modules missing")
	@echo "$(YELLOW)Pre-commit status:$(NC)"
	@(pre-commit --version >/dev/null 2>&1 && echo "  ✅ Pre-commit available" || echo "  ❌ Pre-commit not installed")
