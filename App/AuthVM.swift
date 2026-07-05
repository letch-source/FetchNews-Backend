//
//  AuthVM.swift
//  FetchNews
//
//  Created by Finlay Smith on 8/14/25.
//

import Foundation
import SwiftUI
import GoogleSignIn

@MainActor
final class AuthVM: ObservableObject {
    @Published var isAuthenticated: Bool = false
    @Published var currentUser: User?
    @Published var isLoading: Bool = false
    @Published var errorMessage: String?
    @Published var isInitializing: Bool = true
    @Published var showTopicOnboarding: Bool = false
    
    private let tokenKey = "auth_token"
    private let userKey = "current_user"
    private let onboardingCompletedKey = "onboarding_completed"
    
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
    
    func signInWithGoogle() async {
        isLoading = true
        errorMessage = nil
        
        do {
            // Configure Google Sign-In if not already configured
            if GIDSignIn.sharedInstance.configuration == nil {
                print("🔧 Configuring Google Sign-In...")
                
                guard let path = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") else {
                    let errorMsg = "GoogleService-Info.plist not found in bundle. Please ensure it's added to your Xcode project target."
                    print("❌ \(errorMsg)")
                    errorMessage = errorMsg
                    isLoading = false
                    return
                }
                
                print("✅ Found GoogleService-Info.plist at: \(path)")
                
                guard let plist = NSDictionary(contentsOfFile: path) else {
                    let errorMsg = "Failed to read GoogleService-Info.plist. File may be corrupted."
                    print("❌ \(errorMsg)")
                    errorMessage = errorMsg
                    isLoading = false
                    return
                }
                
                guard let clientId = plist["CLIENT_ID"] as? String, !clientId.isEmpty else {
                    let errorMsg = "CLIENT_ID not found in GoogleService-Info.plist or is empty."
                    print("❌ \(errorMsg)")
                    errorMessage = errorMsg
                    isLoading = false
                    return
                }
                
                print("✅ Found CLIENT_ID: \(clientId.prefix(20))...")
                
                let config = GIDConfiguration(clientID: clientId)
                GIDSignIn.sharedInstance.configuration = config
                print("✅ Google Sign-In configured successfully")
            } else {
                print("✅ Google Sign-In already configured")
            }
            
            // Get the root view controller using modern API
            // Try multiple approaches to get the root view controller
            var rootViewController: UIViewController?
            
            // Method 1: Try getting from window scene (iOS 13+)
            if let windowScene = UIApplication.shared.connectedScenes
                .first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene,
               let window = windowScene.windows.first(where: { $0.isKeyWindow }) ?? windowScene.windows.first {
                rootViewController = window.rootViewController
                print("✅ Found root view controller from window scene")
            }
            
            // Method 2: Try any foreground window scene
            if rootViewController == nil {
                for scene in UIApplication.shared.connectedScenes {
                    if let windowScene = scene as? UIWindowScene,
                       let window = windowScene.windows.first {
                        rootViewController = window.rootViewController
                        print("✅ Found root view controller from any window scene")
                        break
                    }
                }
            }
            
            guard let presentingViewController = rootViewController else {
                let errorMsg = "Unable to get root view controller. Please try again."
                print("❌ \(errorMsg)")
                print("❌ Connected scenes count: \(UIApplication.shared.connectedScenes.count)")
                errorMessage = errorMsg
                isLoading = false
                return
            }
            
            // Sign in with Google
            print("🔐 Starting Google Sign-In flow...")
            let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: presentingViewController)
            
            guard let idToken = result.user.idToken?.tokenString else {
                let errorMsg = "Failed to get ID token from Google. Please try again."
                print("❌ \(errorMsg)")
                errorMessage = errorMsg
                isLoading = false
                return
            }
            
            print("✅ Google Sign-In successful, ID token received")
            
            // Send ID token to backend
            let response = try await ApiClient.authenticateWithGoogle(idToken: idToken)
            print("✅ Backend authentication successful, user: \(response.user.email)")
            print("📋 User selectedTopics count: \(response.user.selectedTopics.count)")
            await handleAuthSuccess(response: response)
            
            // Show topic onboarding only if user hasn't selected topics yet
            // Check both selectedTopics and customTopics - if user has topics in "My Topics", skip onboarding
            let hasSelectedTopics = !response.user.selectedTopics.isEmpty || !(currentUser?.selectedTopics.isEmpty ?? true)
            let hasCustomTopics = !response.user.customTopics.isEmpty || !(currentUser?.customTopics.isEmpty ?? true)
            let hasAnyTopics = hasSelectedTopics || hasCustomTopics
            
            if !hasAnyTopics {
                print("📝 Showing topic onboarding - no topics selected and no custom topics")
                showTopicOnboarding = true
            } else {
                print("✅ User has topics (selectedTopics: \(response.user.selectedTopics.count), customTopics: \(response.user.customTopics.count)), skipping onboarding")
                showTopicOnboarding = false
            }
        } catch {
            let errorDescription = error.localizedDescription
            print("❌ Google Sign-In failed: \(errorDescription)")
            print("❌ Error type: \(type(of: error))")
            if let nsError = error as NSError? {
                print("❌ Error domain: \(nsError.domain)")
                print("❌ Error code: \(nsError.code)")
                print("❌ Error userInfo: \(nsError.userInfo)")
            }
            
            // Provide user-friendly error message
            if errorDescription.contains("network") || errorDescription.contains("connection") {
                errorMessage = "Network error. Please check your internet connection and try again."
            } else if errorDescription.contains("cancel") {
                errorMessage = "Sign-in was cancelled."
            } else {
                errorMessage = "Sign-in failed: \(errorDescription)"
            }
        }
        
        isLoading = false
    }
    
    func logout() {
        isAuthenticated = false
        currentUser = nil
        UserDefaults.standard.removeObject(forKey: tokenKey)
        UserDefaults.standard.removeObject(forKey: userKey)
        ApiClient.setAuthToken(nil)
        
        // Sign out from Google
        GIDSignIn.sharedInstance.signOut()
        
        // Notify that user has logged out so NewsVM can clear user-specific state
        NotificationCenter.default.post(name: .userDidLogout, object: nil)
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
            let sanitized = sanitizeUserForSession(response.user)
            currentUser = sanitized
            saveUser(user: sanitized)
        } catch {
            print("Failed to refresh user: \(error)")
        }
    }
    
    // MARK: - Private Methods
    
    private func handleAuthSuccess(response: AuthResponse) async {
        print("🔑 Handling auth success for user: \(response.user.email)")
        isAuthenticated = true
        let sanitized = sanitizeUserForSession(response.user)
        currentUser = sanitized
        saveToken(token: response.token)
        saveUser(user: sanitized)
        
        // Set user's timezone automatically
        await setUserTimezone()
        
        // Notify that user has logged in so NewsVM can load their data
        // Pass the user directly since NewsVM's weak authVM back-reference isn't
        // wired up yet at this point (it's only set in HomeView/ContentView's onAppear,
        // which hasn't run during the login transition).
        NotificationCenter.default.post(name: .userDidLogin, object: sanitized)

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
                    let sanitized = sanitizeUserForSession(user)
                    currentUser = sanitized
                    saveUser(user: sanitized)
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
                    let sanitized = sanitizeUserForSession(user)
                    currentUser = sanitized
                    saveUser(user: sanitized)
                    // Set the token in ApiClient
                    ApiClient.setAuthToken(token)
                    
                    // Refresh user data from backend to get latest preferences
                    await refreshUser()
                    
                    // Set user's timezone automatically
                    await setUserTimezone()
                    
                    // Notify that user session was restored so NewsVM can load their data
                    NotificationCenter.default.post(name: .userDidLogin, object: sanitized)
                    
                    // Check if onboarding is needed based on latest user data
                    // Check both selectedTopics and customTopics - if user has topics in "My Topics", skip onboarding
                    if let currentUser = currentUser {
                        print("📋 Loaded user selectedTopics count: \(currentUser.selectedTopics.count), customTopics count: \(currentUser.customTopics.count)")
                        let hasSelectedTopics = !currentUser.selectedTopics.isEmpty
                        let hasCustomTopics = !currentUser.customTopics.isEmpty
                        let hasAnyTopics = hasSelectedTopics || hasCustomTopics
                        
                        if !hasAnyTopics {
                            print("📝 Showing topic onboarding - no topics in loaded user")
                            showTopicOnboarding = true
                        } else {
                            print("✅ User has topics (selectedTopics: \(currentUser.selectedTopics.count), customTopics: \(currentUser.customTopics.count)), skipping onboarding")
                            showTopicOnboarding = false
                        }
                    }
                    
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
        let sanitized = sanitizeUserForSession(user)
        print("💾 Saving user to UserDefaults: \(sanitized.email)")
        if let userData = try? JSONEncoder().encode(sanitized) {
            UserDefaults.standard.set(userData, forKey: userKey)
            print("✅ User data saved successfully")
        } else {
            print("❌ Failed to encode user data")
        }
    }

    private func sanitizeUserForSession(_ user: User) -> User {
        // Drop potentially large history payloads from session/userdefaults storage.
        User(
            id: user.id,
            email: user.email,
            emailVerified: user.emailVerified,
            isPremium: user.isPremium,
            dailyUsageCount: user.dailyUsageCount,
            subscriptionId: user.subscriptionId,
            subscriptionExpiresAt: user.subscriptionExpiresAt,
            customTopics: user.customTopics,
            summaryHistory: [],
            selectedTopics: user.selectedTopics,
            name: user.name
        )
    }
    
    // MARK: - Computed Properties
    
    var canFetchNews: Bool {
        guard let user = currentUser else { return false }
        let limit = user.isPremium ? 20 : 3
        return user.dailyUsageCount < limit
    }
    
    var remainingSummaries: Int {
        guard let user = currentUser else { return 0 }
        let limit = user.isPremium ? 20 : 3
        return max(0, limit - user.dailyUsageCount)
    }
    
    // MARK: - Testing Methods
    
    func setPremiumForTesting(_ isPremium: Bool) {
        guard var user = currentUser else { return }
        user = User(
            id: user.id,
            email: user.email,
            emailVerified: user.emailVerified,
            isPremium: isPremium,
            dailyUsageCount: user.dailyUsageCount,
            subscriptionId: user.subscriptionId,
            subscriptionExpiresAt: user.subscriptionExpiresAt,
            customTopics: user.customTopics,
            summaryHistory: user.summaryHistory,
            selectedTopics: user.selectedTopics
        )
        currentUser = user
        saveUser(user: user)
    }
}
