//
//  FetchNewsApp.swift
//  FetchNews
//
//  Created by Finlay Smith on 8/14/25.
//

import SwiftUI

@main
struct FetchNewsApp: App {
    @StateObject private var vm = NewsVM()
    @StateObject private var authVM = AuthVM()

    var body: some Scene {
        WindowGroup {
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
                    .background(Color(.systemBackground))
                } else if authVM.isAuthenticated {
                    ContentView()
                        .environmentObject(vm)
                        .environmentObject(authVM)
                        .onAppear {
                            // Skip heavy initialization during UI testing
                            if ProcessInfo.processInfo.environment["UITESTING"] != "1" {
                                Task {
                                    await vm.initializeIfNeeded()
                                }
                            }
                        }
                } else {
                    WelcomeView()
                        .environmentObject(authVM)
                }
            }
            .animation(.easeInOut(duration: 0.3), value: authVM.isAuthenticated)
            .animation(.easeInOut(duration: 0.2), value: authVM.isInitializing)
        }
    }
}
