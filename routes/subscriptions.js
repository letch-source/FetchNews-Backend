const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const mongoose = require('mongoose');
const fallbackAuth = require('../utils/fallbackAuth');

const router = express.Router();

// Validate iOS receipt with Apple
router.post('/validate-receipt', authenticateToken, async (req, res) => {
  try {
    const { receipt, transactionID, platform } = req.body;
    const user = req.user;

    if (!receipt || !transactionID) {
      return res.status(400).json({ error: 'Receipt and transaction ID are required' });
    }

    // For now, we'll simulate receipt validation
    // In production, you would validate with Apple's servers
    const isValidReceipt = await validateReceiptWithApple(receipt, transactionID);

    if (!isValidReceipt) {
      return res.status(400).json({ error: 'Invalid receipt' });
    }

    // Update user's subscription status
    const subscriptionId = `ios_${transactionID}`;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now

    if (mongoose.connection.readyState === 1) {
      await user.updateSubscription(true, subscriptionId, expiresAt);
    } else {
      await fallbackAuth.updateSubscription(user, true, subscriptionId, expiresAt);
    }

    res.json({
      message: 'Subscription activated successfully',
      user: {
        id: user._id,
        email: user.email,
        isPremium: user.isPremium,
        subscriptionId: user.subscriptionId,
        subscriptionExpiresAt: user.subscriptionExpiresAt
      }
    });
  } catch (error) {
    console.error('Receipt validation error:', error);
    res.status(500).json({ error: 'Failed to validate receipt' });
  }
});

// Simulate Apple receipt validation
async function validateReceiptWithApple(receipt, transactionID) {
  // In production, you would:
  // 1. Send receipt to Apple's validation servers
  // 2. Verify the receipt signature
  // 3. Check transaction status
  // 4. Validate subscription status
  
  // For now, we'll accept all receipts (for testing)
  // In production, implement proper Apple validation:
  
  /*
  const https = require('https');
  
  const validationData = {
    'receipt-data': receipt,
    'password': process.env.APPLE_SHARED_SECRET, // Your App Store Connect shared secret
    'exclude-old-transactions': true
  };
  
  const options = {
    hostname: 'buy.itunes.apple.com',
    port: 443,
    path: '/verifyReceipt',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  };
  
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve(response.status === 0); // 0 means valid
        } catch (error) {
          reject(error);
        }
      });
    });
    
    req.on('error', reject);
    req.write(JSON.stringify(validationData));
    req.end();
  });
  */
  
  // For testing, always return true
  return true;
}

module.exports = router;
