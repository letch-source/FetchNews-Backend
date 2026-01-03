#!/bin/bash

# Google Sign-In Setup Script for FetchNews
# This script helps set up Google Sign-In for the FetchNews app

set -e

echo "🚀 FetchNews Google Sign-In Setup"
echo "=================================="
echo ""

# Check if CocoaPods is installed
if ! command -v pod &> /dev/null; then
    echo "❌ CocoaPods is not installed."
    echo ""
    echo "Please install CocoaPods using one of these methods:"
    echo ""
    echo "Option 1: Using Homebrew (recommended):"
    echo "  brew install cocoapods"
    echo ""
    echo "Option 2: Using RubyGems:"
    echo "  sudo gem install cocoapods"
    echo ""
    echo "After installing, run this script again."
    exit 1
fi

echo "✅ CocoaPods is installed"
echo ""

# Navigate to project directory
cd "$(dirname "$0")"

# Install pods
echo "📦 Installing CocoaPods dependencies..."
pod install

echo ""
echo "✅ CocoaPods dependencies installed!"
echo ""
echo "⚠️  IMPORTANT NEXT STEPS:"
echo ""
echo "1. Set up Google Cloud Console:"
echo "   - Go to https://console.cloud.google.com/"
echo "   - Create OAuth 2.0 credentials (iOS and Web)"
echo "   - Save the Client IDs"
echo ""
echo "2. Add GoogleService-Info.plist:"
echo "   - Copy GoogleService-Info.plist.template to GoogleService-Info.plist"
echo "   - Fill in your iOS Client ID and Reversed Client ID"
echo "   - Add the file to your Xcode project"
echo ""
echo "3. Update Info.plist:"
echo "   - Replace 'REVERSED_CLIENT_ID' with your actual reversed client ID"
echo ""
echo "4. Configure backend .env:"
echo "   - Add GOOGLE_CLIENT_ID=your-web-client-id to backend/.env"
echo ""
echo "5. Open workspace (not project):"
echo "   - Always open FetchNews.xcworkspace (not .xcodeproj)"
echo ""
echo "📖 See GOOGLE_SIGNIN_SETUP.md for detailed instructions"



