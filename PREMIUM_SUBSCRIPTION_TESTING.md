# Premium Subscription Testing Guide

## Current Issue
The `SubscriptionView` is currently bypassing StoreKit and using a beta testing approach (`setUserPremiumStatus`). For production, you need to use the actual StoreKit purchase flow.

## How to Test Premium Subscriptions

### 1. **Sandbox Testing (Recommended for Development)**

**Setup:**
1. In App Store Connect, create a Sandbox Tester account:
   - Go to Users and Access → Sandbox → Testers
   - Create a new sandbox tester (use a test email)
   - **Important:** Do NOT use a real Apple ID that you use for anything else

2. On your test device:
   - Sign out of your regular Apple ID in Settings → App Store
   - Keep the sandbox tester signed out until prompted
   - When you try to purchase, iOS will prompt you to sign in with the sandbox account

**Testing Process:**
1. Build and run the app on a physical device (subscriptions don't work in simulator)
2. Navigate to the Subscription screen
3. Tap "Upgrade" button
4. When prompted, sign in with your sandbox tester account
5. Complete the purchase (it won't charge real money)
6. Verify the subscription activates:
   - Check that `isPremium` becomes `true` in the Account page
   - Try making more than 3 fetches (should work unlimited)
   - Check backend logs for receipt validation

### 2. **What to Check**

**Frontend:**
- [ ] StoreKitManager loads products successfully
- [ ] Purchase flow triggers StoreKit purchase dialog
- [ ] Receipt validation is sent to backend after purchase
- [ ] `isPremium` status updates in AuthVM after successful purchase
- [ ] UI reflects premium status (Account page shows "Premium")

**Backend:**
- [ ] `/api/subscriptions/validate-receipt` endpoint receives JWS receipt
- [ ] Receipt validation parses JWS correctly
- [ ] User's `isPremium` flag is set to `true`
- [ ] `subscriptionId` and `subscriptionExpiresAt` are saved
- [ ] User object in database is updated correctly

**Console/Logs:**
- Check for any errors in Xcode console
- Check backend logs for receipt validation
- Look for any network errors in API calls

### 3. **Fix Required**

The current `SubscriptionView.purchasePremium()` needs to be updated to use StoreKit:

**Current (beta testing approach):**
```swift
// Upgrade user to premium for free (beta testing)
try await ApiClient.setUserPremiumStatus(email: authVM.currentUser?.email ?? "", isPremium: true)
```

**Should be:**
```swift
guard let product = storeKitManager.premiumProduct else {
    errorMessage = "Product not available"
    showingError = true
    return
}

do {
    let transaction = try await storeKitManager.purchase(product)
    // StoreKitManager will automatically validate receipt and update backend
    await authVM.refreshUser() // Refresh to get updated premium status
    dismiss() // Close subscription view on success
} catch {
    errorMessage = error.localizedDescription
    showingError = true
}
```

### 4. **Production Requirements**

Before releasing to production:
- [ ] Ensure the product ID `com.fetchnews.premium.monthly` exists in App Store Connect
- [ ] Product is approved and available
- [ ] Receipt validation logic properly validates JWS signatures
- [ ] Handle subscription expiration (check `subscriptionExpiresAt`)
- [ ] Handle subscription renewals
- [ ] Handle subscription cancellations
- [ ] Test with real production receipts (not sandbox)

### 5. **Debugging Tips**

**If purchases aren't working:**
1. Make sure you're on a physical device (not simulator)
2. Check that you're signed in with a sandbox account (not production)
3. Verify the product ID matches App Store Connect exactly
4. Check Xcode console for StoreKit errors
5. Check backend logs for receipt validation errors

**Common Issues:**
- "Product not available" → Product ID mismatch or product not configured in App Store Connect
- "Purchase failed" → Sandbox account issue or network error
- "Receipt validation failed" → Backend validation logic issue
- "isPremium not updating" → Backend not saving or AuthVM not refreshing

### 6. **Testing Checklist**

- [ ] Sandbox purchase completes successfully
- [ ] Receipt is sent to backend
- [ ] Backend validates receipt
- [ ] User premium status updates in database
- [ ] AuthVM refreshes and shows premium status
- [ ] App respects premium status (unlimited fetches, premium features)
- [ ] Restore purchases works correctly
- [ ] Subscription expiration is handled
- [ ] Subscription renewal is handled

## Next Steps

1. Update `SubscriptionView.purchasePremium()` to use StoreKit
2. Test the full purchase flow in sandbox
3. Verify receipt validation on backend
4. Test restore purchases functionality
5. Add error handling and user feedback


