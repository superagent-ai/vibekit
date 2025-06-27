#!/bin/bash

# Script to run unit tests for task creation and runner process

echo "🧪 Running Task Creation and Runner Tests..."
echo "=========================================="

# Install test dependencies if not already installed
if ! npm list vitest &>/dev/null; then
  echo "📦 Installing test dependencies..."
  npm install --save-dev vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
fi

# Run all tests
echo ""
echo "🏃 Running all tests..."
npm run test

# Run specific test suites with coverage
echo ""
echo "📊 Running tests with coverage..."
npm run test:coverage

# Run tests in watch mode for development
if [ "$1" == "--watch" ]; then
  echo ""
  echo "👀 Running tests in watch mode..."
  npm run test:watch
fi

echo ""
echo "✅ Test run complete!"