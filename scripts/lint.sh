#!/bin/bash

# Script to run all linting and formatting checks
# This matches what pre-commit hooks will run

set -e  # Exit on any error

echo "🔍 Running code quality checks..."

# Change to project root
cd "$(dirname "$0")/.."

echo ""
echo "📁 Backend Python checks..."
echo "  🐍 Running black..."
cd app/backend
black .

echo "  📦 Running isort..."
isort --profile black .

echo "  🧹 Running flake8..."
flake8 .

echo "  🔒 Running bandit security check..."
bandit -r . -f json -o /tmp/bandit-report.json || echo "  ⚠️  Bandit found security issues, check /tmp/bandit-report.json"

echo "  🛡️  Running safety check..."
safety scan -r requirements.txt || echo "  ⚠️  Safety found vulnerable packages"

# Return to project root
cd ../..

echo ""
echo "🌐 Frontend checks..."
echo "  ✨ Running ESLint..."
cd app/ui
npm run lint

echo "  🔍 Running npm audit..."
npm audit --audit-level=moderate || echo "  ⚠️  npm audit found issues"

# Return to project root
cd ../..

echo ""
echo "🐳 Docker checks..."
echo "  📋 Running hadolint..."
if command -v hadolint &> /dev/null; then
    hadolint docker/Dockerfile || echo "  ⚠️  Dockerfile issues found"
else
    echo "  ℹ️  hadolint not installed, skipping Dockerfile check"
fi

echo ""
echo "✅ All checks completed!"
echo "💡 To install hadolint: brew install hadolint"
