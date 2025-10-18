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
        .alert("Upgraded for free. Thanks for beta testing!", isPresented: $showingBetaSuccess) {
            Button("Awesome!") {
                dismiss()
            }
        }
    }
    
    private func purchasePremium() async {
        isPurchasing = true
        
        // Simulate processing time
        try? await Task.sleep(nanoseconds: 1_000_000_000) // 1 second
        
        do {
            // Upgrade user to premium for free (beta testing)
            try await ApiClient.setUserPremiumStatus(email: authVM.currentUser?.email ?? "", isPremium: true)
            
            // Refresh user data
            await authVM.refreshUser()
            
            // Show success message
            showingBetaSuccess = true
            
        } catch {
            errorMessage = "Failed to upgrade account: \(error.localizedDescription)"
            showingError = true
        }
        
        isPurchasing = false
    }
    
    private func restorePurchases() async {
        isPurchasing = true
        
        do {
            try await storeKitManager.restorePurchases()
            if storeKitManager.isPremium {
                // Restore successful, refresh user data
                await authVM.refreshUser()
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
