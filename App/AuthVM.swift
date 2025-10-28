//
//  AuthVM.swift
//  FetchNews
//
//  Created by Finlay Smith on 8/14/25.
//

import Foundation
import SwiftUI

@MainActor
final class AuthVM: ObservableObject {
    @Published var isAuthenticated: Bool = false
    @Published var currentUser: User?
    @Published var isLoading: Bool = false
    @Published var errorMessage: String?
    @Published var isInitializing: Bool = true
    
    private let tokenKey = "auth_token"
    private let userKey = "current_user"
    
    init() {
        // Load stored auth asynchronously to avoid blocking UI
        Task {
            await loadStoredAuthAsync()
        }
        
        // Listen for token expiration
        NotificationCenter.default.addObserver(
            forName: .tokenExpired,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.handleTokenExpiration()
            }
        }
    }
    
    // MARK: - Authentication Methods
    
    func registerUser(email: String, password: String) async {
        isLoading = true
        errorMessage = nil
        
        do {
            print("📝 Attempting registration for: \(email)")
            let response = try await ApiClient.register(email: email, password: password)
            print("✅ Registration successful, user: \(response.user.email)")
            await handleAuthSuccess(response: response)
        } catch {
            print("❌ Registration failed: \(error.localizedDescription)")
            errorMessage = error.localizedDescription
        }
        
        isLoading = false
    }
    
    func loginUser(email: String, password: String) async {
        isLoading = true
        errorMessage = nil
        
        do {
            print("🔐 Attempting login for: \(email)")
            let response = try await ApiClient.login(email: email, password: password)
            print("✅ Login successful, user: \(response.user.email)")
            await handleAuthSuccess(response: response)
        } catch {
            print("❌ Login failed: \(error.localizedDescription)")
            errorMessage = error.localizedDescription
        }
        
        isLoading = false
    }
    
    func logout() {
        isAuthenticated = false
        currentUser = nil
        UserDefaults.standard.removeObject(forKey: tokenKey)
        UserDefaults.standard.removeObject(forKey: userKey)
        ApiClient.setAuthToken(nil)
    }
    
    private func handleTokenExpiration() {
        print("🔑 Token expired, logging out user")
        logout()
        errorMessage = "Your session has expired. Please log in again."
    }
    
    func refreshUser() async {
        guard isAuthenticated else { return }
        
        do {
            let response = try await ApiClient.getCurrentUser()
            currentUser = response.user
            saveUser(user: response.user)
        } catch {
            print("Failed to refresh user: \(error)")
        }
    }
    
    // MARK: - Private Methods
    
    private func handleAuthSuccess(response: AuthResponse) async {
        print("🔑 Handling auth success for user: \(response.user.email)")
        isAuthenticated = true
        currentUser = response.user
        saveToken(token: response.token)
        saveUser(user: response.user)
        
        // Set user's timezone automatically
        await setUserTimezone()
        
        print("💾 Auth data saved, isAuthenticated: \(isAuthenticated)")
    }
    
    private func setUserTimezone() async {
        do {
            let timezone = TimeZone.current.identifier
            print("🌍 Setting user timezone to: \(timezone)")
            try await ApiClient.setTimezone(timezone)
            print("✅ Timezone set successfully")
        } catch {
            print("❌ Failed to set timezone: \(error.localizedDescription)")
            // Don't fail authentication if timezone setting fails
        }
    }
    
    private func loadStoredAuth() {
        print("🔍 Loading stored authentication...")
        
        if let token = UserDefaults.standard.string(forKey: tokenKey) {
            print("✅ Found stored token")
            if let userData = UserDefaults.standard.data(forKey: userKey) {
                print("✅ Found stored user data")
                if let user = try? JSONDecoder().decode(User.self, from: userData) {
                    print("✅ Successfully decoded user: \(user.email)")
                    isAuthenticated = true
                    currentUser = user
                    // Set the token in ApiClient
                    ApiClient.setAuthToken(token)
                    print("🔑 Authentication restored successfully")
                } else {
                    print("❌ Failed to decode user data")
                }
            } else {
                print("❌ No stored user data found")
            }
        } else {
            print("❌ No stored token found")
        }
    }
    
    private func loadStoredAuthAsync() async {
        print("🔍 Loading stored authentication asynchronously...")
        
        // Small delay to allow UI to render first
        try? await Task.sleep(nanoseconds: 100_000_000) // 0.1 seconds
        
        if let token = UserDefaults.standard.string(forKey: tokenKey) {
            print("✅ Found stored token")
            if let userData = UserDefaults.standard.data(forKey: userKey) {
                print("✅ Found stored user data")
                if let user = try? JSONDecoder().decode(User.self, from: userData) {
                    print("✅ Successfully decoded user: \(user.email)")
                    isAuthenticated = true
                    currentUser = user
                    // Set the token in ApiClient
                    ApiClient.setAuthToken(token)
                    
                    // Set user's timezone automatically
                    await setUserTimezone()
                    
                    print("🔑 Authentication restored successfully")
                } else {
                    print("❌ Failed to decode user data")
                }
            } else {
                print("❌ No stored user data found")
            }
        } else {
            print("❌ No stored token found")
        }
        
        isInitializing = false
    }
    
    private func saveToken(token: String) {
        print("💾 Saving token to UserDefaults")
        UserDefaults.standard.set(token, forKey: tokenKey)
        ApiClient.setAuthToken(token)
    }
    
    private func saveUser(user: User) {
        print("💾 Saving user to UserDefaults: \(user.email)")
        if let userData = try? JSONEncoder().encode(user) {
            UserDefaults.standard.set(userData, forKey: userKey)
            print("✅ User data saved successfully")
        } else {
            print("❌ Failed to encode user data")
        }
    }
    
    // MARK: - Computed Properties
    
    var canFetchNews: Bool {
        guard let user = currentUser else { return false }
        return user.isPremium || user.dailyUsageCount < 10
    }
    
    var remainingSummaries: Int {
        guard let user = currentUser else { return 0 }
        return user.isPremium ? -1 : max(0, 10 - user.dailyUsageCount)
    }
    
    // MARK: - Testing Methods
    
    func setPremiumForTesting(_ isPremium: Bool) {
        guard var user = currentUser else { return }
        user = User(
            id: user.id,
            email: user.email,
            isPremium: isPremium,
            dailyUsageCount: user.dailyUsageCount,
            subscriptionId: user.subscriptionId,
            subscriptionExpiresAt: user.subscriptionExpiresAt,
            customTopics: user.customTopics,
            summaryHistory: user.summaryHistory
        )
        currentUser = user
        saveUser(user: user)
    }
    
    // MARK: - Password Reset
    
    func requestPasswordReset(email: String) async -> String? {
        isLoading = true
        errorMessage = nil
        
        do {
            let message = try await ApiClient.requestPasswordReset(email: email)
            isLoading = false
            return message
        } catch {
            errorMessage = error.localizedDescription
            isLoading = false
            return nil
        }
    }
    
    func resetPassword(token: String, newPassword: String) async -> String? {
        isLoading = true
        errorMessage = nil
        
        do {
            let message = try await ApiClient.resetPassword(token: token, newPassword: newPassword)
            isLoading = false
            return message
        } catch {
            errorMessage = error.localizedDescription
            isLoading = false
            return nil
        }
    }
}