#!/bin/bash

# Development Server Startup Script
# This script checks your environment and starts the dev server

echo "🚀 Starting FetchNews Development Environment"
echo ""

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "⚠️  .env file not found!"
    echo ""
    echo "Creating .env file with development defaults..."
    node scripts/setup-dev-env.js
    echo ""
    echo "✋ Please edit .env and add your API keys, then run this script again."
    exit 1
fi

# Check if MongoDB is running
echo "🔍 Checking MongoDB..."
if ! pgrep -x "mongod" > /dev/null; then
    echo "⚠️  MongoDB is not running. Starting MongoDB..."
    brew services start mongodb-community 2>/dev/null || {
        echo "❌ Could not start MongoDB. Please start it manually:"
        echo "   brew services start mongodb-community"
        exit 1
    }
    sleep 2
fi
echo "✓ MongoDB is running"

# Check if Redis is running (optional)
echo "🔍 Checking Redis..."
if pgrep -x "redis-server" > /dev/null; then
    echo "✓ Redis is running"
else
    echo "⚠️  Redis is not running (optional, will use in-memory cache)"
    echo "   To start Redis: brew services start redis"
fi

# Check environment configuration
echo ""
echo "🔍 Validating environment configuration..."
if node scripts/check-environment.js; then
    echo ""
    echo "✅ Environment configuration looks good!"
    echo ""
    echo "🎯 Starting development server on port 3001..."
    echo "   Press Ctrl+C to stop"
    echo ""
    sleep 1
    
    # Start the dev server
    NODE_ENV=development npm run dev
else
    echo ""
    echo "❌ Environment configuration has issues."
    echo "   Please fix the errors above and try again."
    exit 1
fi

