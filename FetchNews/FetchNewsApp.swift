//
//  FetchNewsApp.swift
//  FetchNews
//
//  Created by Finlay Smith on 8/14/25.
//

import SwiftUI

@main
struct FetchNewsApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @StateObject private var vm = NewsVM()
    @StateObject private var authVM = AuthVM()
    @Environment(\.scenePhase) var scenePhase
    
    // Toggle between new and old UI - set to false to use old ContentView
    private let useNewUI = true

    var body: some Scene {
        WindowGroup {
            ZStack {
                // Background
                Color.darkGreyBackground
                    .ignoresSafeArea()
                
                Group {
                    if authVM.isInitializing {
                        // Show loading screen while checking authentication
                        VStack(spacing: 20) {
                            Image("Launch Logo")
                                .resizable()
                                .aspectRatio(contentMode: .fit)
                                .frame(width: 100, height: 100)
                            
                            Text("Fetch News")
                                .font(.largeTitle)
                                .fontWeight(.bold)
                            
                            ProgressView()
                                .scaleEffect(1.2)
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else if authVM.isAuthenticated {
                        if useNewUI {
                            // New UI with bottom navigation
                            MainTabView()
                                .environmentObject(vm)
                                .environmentObject(authVM)
                                .onAppear {
                                    // Skip heavy initialization during UI testing
                                    if ProcessInfo.processInfo.environment["UITESTING"] != "1" {
                                        Task {
                                            await vm.initializeIfNeeded()
                                            // Check for scheduled summaries on app launch
                                            await vm.checkForScheduledSummary()
                                        }
                                    }
                                }
                        } else {
                            // Old UI (fallback)
                            ContentView()
                                .environmentObject(vm)
                                .environmentObject(authVM)
                                .onAppear {
                                    // Skip heavy initialization during UI testing
                                    if ProcessInfo.processInfo.environment["UITESTING"] != "1" {
                                        Task {
                                            await vm.initializeIfNeeded()
                                            // Check for scheduled summaries on app launch
                                            await vm.checkForScheduledSummary()
                                        }
                                    }
                                }
                        }
                    } else {
                        WelcomeView()
                            .environmentObject(authVM)
                    }
                }
            }
            .animation(.easeInOut(duration: 0.3), value: authVM.isAuthenticated)
            .animation(.easeInOut(duration: 0.2), value: authVM.isInitializing)
            .sheet(isPresented: $authVM.showTopicOnboarding) {
                TopicOnboardingView()
                    .environmentObject(vm)
                    .environmentObject(authVM)
            }
            .onChange(of: scenePhase) { oldPhase, newPhase in
                // Check for scheduled summaries when app becomes active
                if newPhase == .active && authVM.isAuthenticated {
                    Task {
                        await vm.checkForScheduledSummary()
                    }
                }
            }
            .onOpenURL { url in
                handleDeepLink(url)
            }
        }
    }
    
    // Handle deep links
    private func handleDeepLink(_ url: URL) {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: true) else {
            return
        }
        
        // Handle email verification: fetchnews://verify-email?token=xxx
        if url.path.contains("verify-email") || url.host == "verify-email" {
            if let token = components.queryItems?.first(where: { $0.name == "token" })?.value {
                Task {
                    await verifyEmail(token: token)
                }
            }
        }
    }
    
    // Verify email with token
    private func verifyEmail(token: String) async {
        do {
            // Call API to verify email
            let message = try await ApiClient.verifyEmail(token: token)
            print("✅ Email verified: \(message)")
            // Refresh user to update emailVerified status
            await authVM.refreshUser()
        } catch {
            print("❌ Email verification failed: \(error)")
        }
    }
}
