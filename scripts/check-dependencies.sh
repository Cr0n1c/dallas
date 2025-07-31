#!/bin/bash

echo "🔍 Checking dependencies..."

# Check kube-linter
if ! command -v kube-linter &> /dev/null; then
    echo "📦 Installing kube-linter..."
    brew install kube-linter || { echo "❌ Failed to install kube-linter"; exit 1; }
fi

# Check pre-commit
if ! command -v pre-commit &> /dev/null; then
    echo "📦 Installing pre-commit..."
    brew install pre-commit || { echo "❌ Failed to install pre-commit"; exit 1; }
fi

# Check helm
if ! command -v helm &> /dev/null; then
    echo "❌ Helm is required but not installed. Please install with: brew install helm"
    exit 1
fi

# Check docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is required but not installed. Please install Docker Desktop"
    exit 1
fi

# Check Python dependencies
if [ ! -d "app/backend/venv" ]; then
    echo "📦 Installing Python dependencies..."
    cd app/backend && python3 -m venv venv && source venv/bin/activate && pip install --upgrade pip && pip install -r requirements.txt
    cd ../..
fi

# Check Node.js dependencies
if [ ! -d "app/ui/node_modules" ]; then
    echo "📦 Installing Node.js dependencies..."
    cd app/ui && npm install
    cd ../..
fi

echo "✅ All dependencies are installed and ready"
