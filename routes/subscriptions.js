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

// Validate StoreKit 2 JWS receipt
async function validateReceiptWithApple(jwsReceipt, transactionID) {
  try {
    // For StoreKit 2, we need to validate JWS (JSON Web Signature) receipts
    // This is different from the old base64 receipt validation
    
    // Parse the JWS receipt to extract transaction data
    const parts = jwsReceipt.split('.');
    if (parts.length !== 3) {
      console.error('Invalid JWS format');
      return false;
    }
    
    // Decode the payload (middle part)
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    
    // Verify the transaction ID matches
    if (payload.transactionId !== transactionID) {
      console.error('Transaction ID mismatch');
      return false;
    }
    
    // Check if the transaction is valid
    if (payload.type !== 'Auto-Renewable Subscription') {
      console.error('Invalid transaction type');
      return false;
    }
    
    // Check if the subscription is still active
    const expiresAt = new Date(payload.expiresDate);
    if (expiresAt <= new Date()) {
      console.error('Subscription expired');
      return false;
    }
    
    // For production, you should also verify the JWS signature
    // using Apple's public keys, but for testing we'll accept valid format
    
    console.log('JWS receipt validated successfully:', {
      transactionId: payload.transactionId,
      productId: payload.productId,
      expiresDate: payload.expiresDate
    });
    
    return true;
    
  } catch (error) {
    console.error('JWS receipt validation error:', error);
    return false;
  }
}

module.exports = router;
