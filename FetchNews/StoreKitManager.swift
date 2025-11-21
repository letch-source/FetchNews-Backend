//
//  StoreKitManager.swift
//  FetchNews
//
//  Created by Finlay Smith on 8/14/25.
//

import Foundation
import StoreKit
import SwiftUI

@MainActor
class StoreKitManager: ObservableObject {
    @Published var products: [StoreKit.Product] = []
    @Published var purchasedProductIDs: Set<String> = []
    @Published var isLoading = false
    @Published var errorMessage: String?
    
    private let productIDs = ["com.fetchnews.premium.monthly"]
    
    init() {
        Task {
            await loadProducts()
            await updatePurchasedProducts()
        }
    }
    
    func loadProducts() async {
        do {
            products = try await StoreKit.Product.products(for: productIDs)
        } catch {
            errorMessage = "Failed to load products: \(error.localizedDescription)"
        }
    }
    
    func updatePurchasedProducts() async {
        var purchasedIDs: Set<String> = []
        
        for await result in StoreKit.Transaction.currentEntitlements {
            if case .verified(let transaction) = result {
                if transaction.revocationDate == nil {
                    purchasedIDs.insert(transaction.productID)
                }
            }
        }
        
        purchasedProductIDs = purchasedIDs
    }
    
    func purchase(_ product: StoreKit.Product) async throws -> StoreKit.Transaction? {
        let result = try await product.purchase()
        
        switch result {
        case .success(let verification):
            if case .verified(let transaction) = verification {
                // Update purchased products
                await updatePurchasedProducts()
                
                // Send receipt to backend for validation (this updates user's subscription status)
                await validateReceipt(verification: verification)
                
                // Finish the transaction after validation
                await transaction.finish()
                
                return transaction
            }
            return nil
            
        case .userCancelled:
            throw StoreKitError.userCancelled
            
        case .pending:
            throw StoreKitError.pending
            
        @unknown default:
            throw StoreKitError.unknown
        }
    }
    
    func restorePurchases() async throws {
        try await AppStore.sync()
        await updatePurchasedProducts()
    }
    
    private func validateReceipt(verification: VerificationResult<StoreKit.Transaction>) async {
        // Send receipt to backend for validation
        do {
            // In StoreKit 2, we use the verification result's JWS representation
            let jwsRepresentation = verification.jwsRepresentation
            
            // Get the transaction from the verification result
            if case .verified(let transaction) = verification {
                // Call backend to validate receipt
                try await ApiClient.validateReceipt(receipt: jwsRepresentation, transactionID: String(transaction.id))
            }
        } catch {
            print("Receipt validation failed: \(error)")
        }
    }
    
    var isPremium: Bool {
        return !purchasedProductIDs.isEmpty
    }
    
    var premiumProduct: StoreKit.Product? {
        return products.first { $0.id == "com.fetchnews.premium.monthly" }
    }
}

enum StoreKitError: LocalizedError {
    case userCancelled
    case pending
    case unknown
    
    var errorDescription: String? {
        switch self {
        case .userCancelled:
            return "Purchase was cancelled"
        case .pending:
            return "Purchase is pending approval"
        case .unknown:
            return "An unknown error occurred"
        }
    }
}
