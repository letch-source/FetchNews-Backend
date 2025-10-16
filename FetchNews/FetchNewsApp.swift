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
            if authVM.isAuthenticated {
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
                AuthView()
                    .environmentObject(authVM)
            }
        }
    }
}
