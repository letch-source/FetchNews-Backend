//
//  SubscriptionView.swift
//  FetchNews
//
//  Created by Finlay Smith on 8/14/25.
//

import SwiftUI
import StoreKit

struct SubscriptionView: View {
    @EnvironmentObject var vm: NewsVM
    @EnvironmentObject var authVM: AuthVM
    @StateObject private var storeKitManager = StoreKitManager()
    @Environment(\.dismiss) private var dismiss
    @State private var isPurchasing = false
    @State private var showingError = false
    @State private var errorMessage = ""
    @State private var showingBetaSuccess = false
    
    var body: some View {
        NavigationView {
            VStack(spacing: 30) {
                // Header
                VStack(spacing: 16) {
                    Image(systemName: "crown.fill")
                        .font(.system(size: 60))
                        .foregroundColor(.yellow)
                    
                    Text("Fetch News Premium")
                        .font(.largeTitle)
                        .fontWeight(.bold)
                    
                    Text("Unlock unlimited news summaries")
                        .font(.title3)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                }
                .padding(.top, 40)
                
                // Features
                VStack(spacing: 20) {
                    FeatureRow(icon: "infinity", text: "Unlimited Summaries")
                    FeatureRow(icon: "speaker.wave.3", text: "All Premium Voices")
                    FeatureRow(icon: "bolt.fill", text: "Priority Processing")
                    FeatureRow(icon: "star.fill", text: "Premium Support")
                }
                .padding(.horizontal, 20)
                
                Spacer()
                
                // Pricing
                VStack(spacing: 16) {
                    VStack(spacing: 8) {
                        if let product = storeKitManager.premiumProduct {
                            Text(product.displayPrice)
                                .font(.system(size: 48, weight: .bold))
                                .foregroundColor(.primary)
                        } else {
                            Text("$3.99")
                                .font(.system(size: 48, weight: .bold))
                                .foregroundColor(.primary)
                        }
                        
                        Text("per month")
                            .font(.title3)
                            .foregroundColor(.secondary)
                    }
                    
                    Text("Cancel anytime • No commitment")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                
                // Purchase Button
                Button(action: {
                    Task {
                        await purchasePremium()
                    }
                }) {
                    HStack {
                        if isPurchasing {
                            ProgressView()
                                .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                .scaleEffect(0.8)
                        }
                        Text(isPurchasing ? "Processing..." : "Upgrade")
                            .font(.headline)
                            .fontWeight(.semibold)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(Color.blue)
                    .foregroundColor(.white)
                    .cornerRadius(12)
                }
                .disabled(isPurchasing)
                .padding(.horizontal, 20)
                
                // Restore Purchases
                Button("Restore Purchases") {
                    Task {
                        await restorePurchases()
                    }
                }
                .font(.subheadline)
                .foregroundColor(.blue)
                .padding(.bottom, 20)
            }
            .navigationTitle("Premium")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Close") {
                        dismiss()
                    }
                }
            }
        }
        .alert("Purchase Error", isPresented: $showingError) {
            Button("OK") { }
        } message: {
            Text(errorMessage)
        }
        .alert("Upgrade Successful!", isPresented: $showingBetaSuccess) {
            Button("Awesome!") {
                dismiss()
            }
        } message: {
            Text("Your premium subscription is now active. Enjoy unlimited news summaries!")
        }
    }
    
    private func purchasePremium() async {
        isPurchasing = true
        
        guard let product = storeKitManager.premiumProduct else {
            errorMessage = "Product not available. Please try again later."
            showingError = true
            isPurchasing = false
            return
        }
        
        do {
            // Purchase the product through StoreKit
            _ = try await storeKitManager.purchase(product)
            
            // StoreKitManager already validates the receipt with the backend
            // and the backend updates the user's subscription status
            
            // Refresh user data to get the updated premium status
            await authVM.refreshUser()
            
            // Show success message
            showingBetaSuccess = true
            
            // Close the view after a short delay
            try? await Task.sleep(nanoseconds: 2_000_000_000) // 2 seconds
            dismiss()
            
        } catch let error as StoreKitError {
            switch error {
            case .userCancelled:
                // User cancelled, don't show error
                break
            case .pending:
                errorMessage = "Your purchase is pending approval. Premium access will be activated once approved."
                showingError = true
            case .unknown:
                errorMessage = "Purchase failed. Please try again."
                showingError = true
            }
        } catch {
            errorMessage = "Failed to complete purchase: \(error.localizedDescription)"
            showingError = true
        }
        
        isPurchasing = false
    }
    
    private func restorePurchases() async {
        isPurchasing = true
        
        do {
            try await storeKitManager.restorePurchases()
            
            // After restoring, check if we have any active subscriptions
            // If so, validate with backend to sync subscription status
            if storeKitManager.isPremium {
                // For each purchased product, validate the receipt
                for await result in StoreKit.Transaction.currentEntitlements {
                    if case .verified(let transaction) = result {
                        if transaction.revocationDate == nil {
                            // Get JWS representation from the verification result, not the transaction
                            let jws = result.jwsRepresentation
                            do {
                                // Validate with backend to update subscription status
                                try await ApiClient.validateReceipt(
                                    receipt: jws,
                                    transactionID: String(transaction.id)
                                )
                            } catch {
                                print("Failed to validate restored purchase: \(error)")
                            }
                        }
                    }
                }
                
                // Refresh user data to get the updated premium status
                await authVM.refreshUser()
                
                // Show success and dismiss
                showingBetaSuccess = true
                try? await Task.sleep(nanoseconds: 2_000_000_000) // 2 seconds
                dismiss()
            } else {
                errorMessage = "No previous purchases found."
                showingError = true
            }
        } catch {
            errorMessage = "Restore failed. Please try again."
            showingError = true
        }
        
        isPurchasing = false
    }
}

struct FeatureRow: View {
    let icon: String
    let text: String
    
    var body: some View {
        HStack {
            Image(systemName: icon)
                .foregroundColor(.blue)
                .font(.title2)
                .frame(width: 30)
            Text(text)
                .font(.body)
            Spacer()
        }
    }
}

struct SubscriptionView_Previews: PreviewProvider {
    static var previews: some View {
        SubscriptionView()
            .environmentObject(NewsVM())
            .environmentObject(AuthVM())
    }
}
