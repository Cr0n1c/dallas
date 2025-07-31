#!/bin/bash

# Script to update packages and check for outdated dependencies
# This helps ensure packages are fully up to date

set -e  # Exit on any error

echo "📦 Checking and updating packages..."

# Change to project root
cd "$(dirname "$0")/.."

echo ""
echo "🐍 Backend Python packages..."
echo "  📋 Checking for outdated packages..."
cd app/backend

# Check for outdated packages
echo "Current package versions:"
pip list --outdated || true

echo ""
echo "  🔄 Updating packages..."
# Update pip first
pip install --upgrade pip

# Update all packages in requirements.txt
echo "  📦 Updating packages from requirements.txt..."
pip install --upgrade -r requirements.txt

echo "  ✅ Python packages updated!"

# Return to project root
cd ../..

echo ""
echo "📱 Frontend Node.js packages..."
echo "  📋 Checking for outdated packages..."
cd app/ui

# Check for outdated packages
echo "Current package versions:"
npm outdated || true

echo ""
echo "  🔄 Updating packages..."
# Update all packages to latest compatible versions
npm update

echo "  ✅ Node.js packages updated!"

# Return to project root
cd ../..

echo ""
echo "🔒 Security checks..."
echo "  🛡️  Python security audit..."
cd app/backend
safety scan -r requirements.txt || echo "  ⚠️  Security vulnerabilities found in Python packages"

cd ../ui
echo "  🔍 Node.js security audit..."
npm audit || echo "  ⚠️  Security vulnerabilities found in Node.js packages"

cd ../..

echo ""
echo "✅ Package update completed!"
echo ""
echo "📝 Next steps:"
echo "  1. Review the updated packages above"
echo "  2. Run './scripts/lint.sh' to verify everything works"
echo "  3. Test your application thoroughly after updates"
echo "  4. Commit the updated package files (package-lock.json, requirements.txt)"
