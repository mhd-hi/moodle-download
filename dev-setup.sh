#!/bin/bash

# Development helper script for Moodle Downloader Chrome Extension

echo "🔧 Moodle Downloader - Development Helper"
echo "========================================"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "✅ Node.js and npm are available"

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Failed to install dependencies"
        exit 1
    fi
    echo "✅ Dependencies installed successfully"
else
    echo "✅ Dependencies already installed"
fi

# Build the extension
echo "🔨 Building extension..."
npm run build
if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi

echo "✅ Extension built successfully"

# Check if dist folder exists and has required files
if [ -d "dist" ] && [ -f "dist/manifest.json" ] && [ -f "dist/background.js" ] && [ -f "dist/contentScript.js" ]; then
    echo "✅ All required files are present in dist/"
else
    echo "❌ Missing required files in dist/"
    exit 1
fi

echo ""
echo "🎉 Extension is ready to load!"
echo ""
echo "Next steps:"
echo "1. Open Chrome and go to chrome://extensions/"
echo "2. Enable 'Developer mode' (toggle in top right)"
echo "3. Click 'Load unpacked'"
echo "4. Select the 'dist/' folder from this project"
echo "5. Navigate to https://ena.etsmtl.ca/ to test"
echo ""
echo "For development with auto-rebuild, run: npm run watch"
