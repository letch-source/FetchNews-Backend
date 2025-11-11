//
//  MainTabView.swift
//  FetchNews
//
//  Created by Finlay Smith on 8/14/25.
//

import SwiftUI

struct MainTabView: View {
    @EnvironmentObject var vm: NewsVM
    @EnvironmentObject var authVM: AuthVM
    @State private var selectedTab = 0
    
    var body: some View {
        ZStack {
            // Main content
            Group {
                switch selectedTab {
                case 0:
                    HomeView()
                        .environmentObject(vm)
                        .environmentObject(authVM)
                case 1:
                    PersonalizeView()
                        .environmentObject(vm)
                        .environmentObject(authVM)
                case 2:
                    SummaryHistoryView()
                        .environmentObject(vm)
                        .environmentObject(authVM)
                case 3:
                    AccountView()
                        .environmentObject(vm)
                        .environmentObject(authVM)
                default:
                    HomeView()
                        .environmentObject(vm)
                        .environmentObject(authVM)
                }
            }
            
            // Custom bottom navigation
            VStack {
                Spacer()
                CustomBottomNavigation(selectedTab: $selectedTab, vm: vm)
            }
        }
        .ignoresSafeArea(.keyboard, edges: .bottom)
    }
}

struct CustomBottomNavigation: View {
    @Binding var selectedTab: Int
    @ObservedObject var vm: NewsVM
    
    var body: some View {
        ZStack(alignment: .bottom) {
            // Main navigation bar
            HStack(spacing: 0) {
                // Home Tab
                Button(action: { selectedTab = 0 }) {
                    Image(systemName: selectedTab == 0 ? "house.fill" : "house")
                        .font(.system(size: 20))
                        .foregroundColor(selectedTab == 0 ? .blue : .gray)
                }
                .frame(maxWidth: .infinity)
                
                // Personalize Tab
                Button(action: { selectedTab = 1 }) {
                    Image(systemName: selectedTab == 1 ? "chart.bar.fill" : "chart.bar")
                        .font(.system(size: 20))
                        .foregroundColor(selectedTab == 1 ? .blue : .gray)
                }
                .frame(maxWidth: .infinity)
                
                // Spacer for center button
                Spacer()
                    .frame(width: 80) // Space for floating button + 10px spacing on each side
                
                // History Tab
                Button(action: { selectedTab = 2 }) {
                    Image(systemName: selectedTab == 2 ? "clock.fill" : "clock")
                        .font(.system(size: 20))
                        .foregroundColor(selectedTab == 2 ? .blue : .gray)
                }
                .frame(maxWidth: .infinity)
                
                // Account Tab
                Button(action: { selectedTab = 3 }) {
                    Image(systemName: selectedTab == 3 ? "person.fill" : "person")
                        .font(.system(size: 20))
                        .foregroundColor(selectedTab == 3 ? .blue : .gray)
                }
                .frame(maxWidth: .infinity)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .padding(.bottom, 11) // Moved down 3 pixels (8 + 3 = 11)
            .background(Color(.systemBackground))
            .shadow(color: Color.black.opacity(0.1), radius: 8, x: 0, y: -2)
            
            // Floating Fetch News Button (Center) - positioned over the navigation bar
            DynamicFetchButton(state: vm.fetchButtonState) {
                Task { await vm.fetch() }
            }
            .disabled(vm.isBusy || vm.phase != .idle || vm.selectedTopics.isEmpty || !vm.isDirty)
            .opacity((vm.isBusy || vm.phase != .idle || vm.selectedTopics.isEmpty || !vm.isDirty) ? 0.6 : 1.0)
            .offset(y: -15) // Positioned above the navigation bar
        }
    }
}


// MARK: - Account View (simplified version of settings account section)

struct AccountView: View {
    @EnvironmentObject var authVM: AuthVM
    @EnvironmentObject var vm: NewsVM
    
    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                // Header
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Fetch News")
                                .font(.title2)
                                .fontWeight(.bold)
                                .foregroundColor(.primary)
                            
                            Text("News for Busy People")
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                        }
                        Spacer()
                        
                        // Premium indicator - Hidden
                        // if let user = authVM.currentUser, user.isPremium {
                        //     Button("PREMIUM") {
                        //         // Already premium, could show premium features
                        //     }
                        //     .font(.subheadline.weight(.semibold))
                        //     .padding(.horizontal, 12)
                        //     .padding(.vertical, 6)
                        //     .background(Color.yellow)
                        //     .foregroundColor(.black)
                        //     .cornerRadius(8)
                        // }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 20)
                .padding(.vertical, 16)
                .background(Color(.systemBackground))
                
                // Account Content
                ScrollView {
                    VStack(spacing: 24) {
                        if let user = authVM.currentUser {
                            // Account Information
                            VStack(alignment: .leading, spacing: 16) {
                                Text("Account Information")
                                    .font(.headline)
                                    .fontWeight(.semibold)
                                    .foregroundColor(.primary)
                                
                                VStack(spacing: 16) {
                                    HStack {
                                        Text("Email")
                                            .font(.subheadline)
                                            .fontWeight(.medium)
                                            .foregroundColor(.primary)
                                        Spacer()
                                        Text(user.email)
                                            .font(.subheadline)
                                            .foregroundColor(.secondary)
                                    }
                                    
                                    HStack {
                                        Text("Status")
                                            .font(.subheadline)
                                            .fontWeight(.medium)
                                            .foregroundColor(.primary)
                                        Spacer()
                                        Text(user.isPremium ? "Premium" : "Free")
                                            .font(.subheadline)
                                            .foregroundColor(user.isPremium ? .yellow : .secondary)
                                    }
                                    
                                    if !user.isPremium {
                                        HStack {
                                            Text("Daily Usage")
                                                .font(.subheadline)
                                                .fontWeight(.medium)
                                                .foregroundColor(.primary)
                                            Spacer()
                                            Text("\(user.dailyUsageCount)/10 Fetches")
                                                .font(.subheadline)
                                                .foregroundColor(.secondary)
                                        }
                                    }
                                }
                                .padding()
                                .background(Color(.systemGray6))
                                .cornerRadius(12)
                            }
                            
                            // Account Actions
                            VStack(alignment: .leading, spacing: 16) {
                                Text("Account")
                                    .font(.headline)
                                    .fontWeight(.semibold)
                                    .foregroundColor(.primary)
                                
                                VStack(spacing: 12) {
                                    Button("Sign Out") {
                                        authVM.logout()
                                    }
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundColor(.red)
                                    .padding()
                                    .frame(maxWidth: .infinity)
                                    .background(Color.red.opacity(0.1))
                                    .cornerRadius(12)
                                }
                                .padding()
                                .background(Color(.systemGray6))
                                .cornerRadius(12)
                            }
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 16)
                }
            }
        }
    }
}

#Preview {
    MainTabView()
        .environmentObject(NewsVM())
        .environmentObject(AuthVM())
}
