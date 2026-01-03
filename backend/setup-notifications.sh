#!/bin/bash

# Backend Notification Setup Script
# This script helps you set up APNs for push notifications

echo "=========================================="
echo "Backend Notification Setup"
echo "=========================================="
echo ""
echo "This script will help you configure APNs for push notifications."
echo "You'll need:"
echo "  1. Apple Developer account access"
echo "  2. Your Team ID"
echo "  3. An APNs key (.p8 file)"
echo ""
read -p "Press Enter to continue or Ctrl+C to exit..."

echo ""
echo "Step 1: Get Your Apple Team ID"
echo "--------------------------------"
echo "1. Go to: https://developer.apple.com/account/"
echo "2. Sign in with your Apple Developer account"
echo "3. Look at the top right corner for your Team ID"
echo "   (Format: ABC123DEFG - 10 characters)"
echo ""
read -p "Enter your Team ID: " TEAM_ID

if [ -z "$TEAM_ID" ]; then
    echo "❌ Team ID is required. Exiting."
    exit 1
fi

echo ""
echo "Step 2: Create APNs Key"
echo "----------------------"
echo "1. Go to: https://developer.apple.com/account/resources/authkeys/list"
echo "2. Click the '+' button"
echo "3. Name it: 'FetchNews APNs Key'"
echo "4. Check 'Apple Push Notifications service (APNs)'"
echo "5. Click Continue → Register"
echo "6. Download the .p8 file immediately (you can only download once!)"
echo "7. Note the Key ID shown on the page"
echo ""
read -p "Enter your Key ID: " KEY_ID

if [ -z "$KEY_ID" ]; then
    echo "❌ Key ID is required. Exiting."
    exit 1
fi

echo ""
echo "Step 3: Locate Your .p8 Key File"
echo "---------------------------------"
echo "The downloaded file should be named: AuthKey_${KEY_ID}.p8"
read -p "Enter the full path to your .p8 file: " KEY_PATH

if [ ! -f "$KEY_PATH" ]; then
    echo "❌ File not found: $KEY_PATH"
    echo "Please check the path and try again."
    exit 1
fi

echo ""
echo "Step 4: Reading Key Content..."
KEY_CONTENT=$(cat "$KEY_PATH")

if [ -z "$KEY_CONTENT" ]; then
    echo "❌ Could not read key file. Exiting."
    exit 1
fi

echo "✅ Key file read successfully"

echo ""
echo "Step 5: Creating .env file..."
echo "----------------------------"

# Check if .env already exists
if [ -f ".env" ]; then
    echo "⚠️  .env file already exists!"
    read -p "Do you want to add APNs config to existing .env? (y/n): " ADD_TO_EXISTING
    if [ "$ADD_TO_EXISTING" != "y" ]; then
        echo "Creating .env.backup..."
        cp .env .env.backup
    fi
fi

# Append or create .env with APNs config
cat >> .env << EOF

# APNs Configuration (added by setup script)
APN_KEY_ID=$KEY_ID
APN_TEAM_ID=$TEAM_ID
APN_BUNDLE_ID=com.finlaysmith.FetchNews
APN_KEY_CONTENT=$KEY_CONTENT
NODE_ENV=development
EOF

echo "✅ .env file updated with APNs configuration"
echo ""
echo "Step 6: Verifying Configuration..."
echo "----------------------------------"

# Test the configuration
node -e "
require('dotenv').config();
const apnKeyId = process.env.APN_KEY_ID;
const apnTeamId = process.env.APN_TEAM_ID;
const apnBundleId = process.env.APN_BUNDLE_ID;
const apnKeyContent = process.env.APN_KEY_CONTENT;

if (apnKeyId && apnTeamId && apnKeyContent) {
    console.log('✅ All APNs variables are set');
    console.log('   Key ID:', apnKeyId);
    console.log('   Team ID:', apnTeamId);
    console.log('   Bundle ID:', apnBundleId || 'com.finlaysmith.FetchNews');
    console.log('   Key Content:', apnKeyContent.substring(0, 30) + '...');
    console.log('');
    console.log('✅ Configuration looks good!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Restart your backend server');
    console.log('2. Check logs for: [NOTIFICATIONS] APNs initialized');
    console.log('3. Test with: GET /api/notifications/diagnostics');
} else {
    console.log('❌ Configuration incomplete');
    console.log('   Missing:', !apnKeyId ? 'APN_KEY_ID' : '', !apnTeamId ? 'APN_TEAM_ID' : '', !apnKeyContent ? 'APN_KEY_CONTENT' : '');
}
" 2>/dev/null || echo "⚠️  Could not verify (node/dotenv may not be available)"

echo ""
echo "=========================================="
echo "Setup Complete!"
echo "=========================================="
echo ""
echo "Your .env file has been configured with:"
echo "  - APN_KEY_ID: $KEY_ID"
echo "  - APN_TEAM_ID: $TEAM_ID"
echo "  - APN_BUNDLE_ID: com.finlaysmith.FetchNews"
echo "  - APN_KEY_CONTENT: (key content added)"
echo "  - NODE_ENV: development"
echo ""
echo "Next steps:"
echo "1. Restart your backend server"
echo "2. Check server logs for: [NOTIFICATIONS] APNs initialized"
echo "3. Test notifications with the diagnostic endpoint"
echo ""
echo "For production, change NODE_ENV=production in .env"
echo ""



