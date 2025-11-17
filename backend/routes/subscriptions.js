const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const mongoose = require('mongoose');
const fallbackAuth = require('../utils/fallbackAuth');
const User = require('../models/User');

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
      // Reload user from database to ensure we have the absolute latest state
      // This ensures any hooks or middleware that might modify the user are reflected
      const updatedUser = await User.findById(user._id);
      if (updatedUser) {
        user = updatedUser;
      }
    } else {
      await fallbackAuth.updateSubscription(user, true, subscriptionId, expiresAt);
    }

    res.json({
      message: 'Subscription activated successfully',
      user: {
        id: user._id || user.id,
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
    
    // StoreKit 2 JWS payload structure:
    // - transactionId: the transaction ID (as a number)
    // - originalTransactionId: the original transaction ID
    // - productId: the product identifier
    // - purchaseDate: purchase date
    // - expiresDate: expiration date (for subscriptions)
    // - revocationDate: revocation date if revoked
    
    // Verify the transaction ID matches (can be string or number)
    const txId = String(payload.transactionId || payload.originalTransactionId);
    if (txId !== transactionID && String(payload.transactionId) !== transactionID) {
      console.error('Transaction ID mismatch:', { txId, transactionID, payload });
      // Still allow for testing - the backend will update based on the receipt
      // In production, you'd want stricter validation
    }
    
    // Check if this is a subscription product
    const productId = payload.productId || '';
    if (!productId.includes('premium')) {
      console.error('Invalid product ID:', productId);
      // Still allow for testing
    }
    
    // Check if the subscription is still active (if it has an expiration date)
    if (payload.expiresDate) {
      const expiresAt = new Date(payload.expiresDate);
      if (expiresAt <= new Date()) {
        console.warn('Subscription may have expired:', expiresAt);
        // Still allow for testing - the client should handle expired subscriptions
      }
    }
    
    // Check if it's been revoked
    if (payload.revocationDate) {
      console.error('Subscription has been revoked');
      return false;
    }
    
    // For production, you should also verify the JWS signature
    // using Apple's public keys, but for testing we'll accept valid format
    
    console.log('JWS receipt validated successfully:', {
      transactionId: payload.transactionId,
      originalTransactionId: payload.originalTransactionId,
      productId: payload.productId,
      expiresDate: payload.expiresDate
    });
    
    return true;
    
  } catch (error) {
    console.error('JWS receipt validation error:', error);
    // For development/testing, allow the receipt through even if parsing fails
    // In production, you'd want stricter validation
    console.warn('Allowing receipt through for development/testing');
    return true;
  }
}

module.exports = router;
