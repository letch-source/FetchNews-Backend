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
    @State private var isScrubbing = false
    @State private var scrubValue: Double = 0
    @State private var showAIAssistant = false
    @State private var wasPlayingBeforeAssistant = false
    
    var body: some View {
        ZStack {
            // Main content
            Group {
                switch selectedTab {
                case 0:
                    TopicFeedView()
                        .environmentObject(vm)
                        .environmentObject(authVM)
                case 1:
                    TopicsView()
                        .environmentObject(vm)
                        .environmentObject(authVM)
                case 2:
                    SavedView()
                        .environmentObject(vm)
                        .environmentObject(authVM)
                case 3:
                    AccountView()
                        .environmentObject(vm)
                        .environmentObject(authVM)
                default:
                    TopicFeedView()
                        .environmentObject(vm)
                        .environmentObject(authVM)
                }
            }
            .overlay(alignment: .bottom) {
                // Gradient fade effect - only on homepage (Tab 0)
                if selectedTab == 0 && vm.canPlay {
                    VStack(spacing: 0) {
                        Spacer()
                        // Gradient fade that reaches 100% opacity earlier
                        LinearGradient(
                            gradient: Gradient(stops: [
                                .init(color: Color.darkGreyBackground.opacity(0), location: 0.0),
                                .init(color: Color.darkGreyBackground.opacity(0), location: 0.3),
                                .init(color: Color.darkGreyBackground.opacity(0.4), location: 0.6),
                                .init(color: Color.darkGreyBackground.opacity(1.0), location: 0.85) // Reaches 100% at 85%
                            ]),
                            startPoint: .top,
                            endPoint: .bottom
                        )
                        .frame(height: 70)
                        
                        // Solid dark background below gradient to hide everything
                        Color.darkGreyBackground
                            .frame(height: 60) // Extends well below to ensure nothing is visible
                    }
                    .ignoresSafeArea(edges: .bottom)
                    .allowsHitTesting(false)
                }
            }
            
            // Custom bottom navigation - positioned at absolute bottom
            VStack {
                Spacer()
                CustomBottomNavigation(selectedTab: $selectedTab, vm: vm)
                    .ignoresSafeArea(edges: .bottom)
            }
            
            // Now-playing bubble - only on homepage (Tab 0)
            VStack {
                Spacer()
                // Show audio bar only on homepage when there's content or when fetching
                if selectedTab == 0 && (vm.canPlay || vm.combined != nil || !vm.lastFetchedTopics.isEmpty || vm.isBusy || vm.shouldShowFetchScreen) {
                    CompactNowPlayingBubble(
                        title: vm.nowPlayingTitle.isEmpty ? userNewsTitle(from: vm.lastFetchedTopics) : vm.nowPlayingTitle,
                        isPlaying: vm.isPlaying,
                        current: isScrubbing ? scrubValue : vm.currentTime,
                        duration: vm.duration,
                        onPlayPause: { vm.playPause() },
                        onScrubChange: { newValue in
                            scrubValue = newValue
                            if !isScrubbing { vm.seek(to: newValue) }
                        },
                        onScrubEdit: { editing in
                            isScrubbing = editing
                            if !editing { vm.seek(to: scrubValue) }
                        },
                        onAIAssistant: vm.combined != nil ? {
                            // Remember if audio was playing
                            wasPlayingBeforeAssistant = vm.isPlaying
                            // Pause audio before opening assistant
                            if vm.isPlaying {
                                vm.playPause()
                            }
                            showAIAssistant = true
                        } : nil,
                        hasContent: vm.combined != nil
                    )
                    .padding(.horizontal, 12)
                    .padding(.bottom, 80)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
        }
        .ignoresSafeArea(edges: .bottom)
        .ignoresSafeArea(.keyboard, edges: .bottom)
        .sheet(isPresented: $showAIAssistant, onDismiss: {
            // Resume audio if it was playing before opening assistant
            if wasPlayingBeforeAssistant && !vm.isPlaying {
                vm.playPause()
            }
            wasPlayingBeforeAssistant = false
            
            // Force UI refresh to restart time observer updates
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 100_000_000) // 0.1 second
                vm.objectWillChange.send()
            }
        }) {
            if let combined = vm.combined {
                AIAssistantView(
                    fetchId: combined.id,
                    fetchSummary: combined.summary,
                    fetchTopics: Array(vm.lastFetchedTopics)
                )
                .environmentObject(vm)
                .environmentObject(authVM)
            }
        }
    }
}

struct CustomBottomNavigation: View {
    @Binding var selectedTab: Int
    @ObservedObject var vm: NewsVM
    
    var body: some View {
        ZStack(alignment: .bottom) {
            // Main navigation bar
            HStack(spacing: 0) {
                // Home Tab (Feed)
                Button(action: { selectedTab = 0 }) {
                    Image(systemName: selectedTab == 0 ? "house.fill" : "house")
                        .font(.system(size: 24))
                        .foregroundColor(selectedTab == 0 ? .blue : .white.opacity(0.6))
                }
                .frame(maxWidth: .infinity)
                
                // Topics Tab
                Button(action: { selectedTab = 1 }) {
                    Image(systemName: selectedTab == 1 ? "tag.fill" : "tag")
                        .font(.system(size: 24))
                        .foregroundColor(selectedTab == 1 ? .blue : .white.opacity(0.6))
                }
                .frame(maxWidth: .infinity)
                
                // Saved Tab
                Button(action: { selectedTab = 2 }) {
                    Image(systemName: selectedTab == 2 ? "bookmark.fill" : "bookmark")
                        .font(.system(size: 24))
                        .foregroundColor(selectedTab == 2 ? .blue : .white.opacity(0.6))
                }
                .frame(maxWidth: .infinity)
                
                // Settings Tab
                Button(action: { selectedTab = 3 }) {
                    Image(systemName: selectedTab == 3 ? "gearshape.fill" : "gearshape")
                        .font(.system(size: 24))
                        .foregroundColor(selectedTab == 3 ? .blue : .white.opacity(0.6))
                }
                .frame(maxWidth: .infinity)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 16)
            .background(Color.clear)
            .shadow(color: Color.black.opacity(0.1), radius: 8, x: 0, y: -2)
            .offset(y: -2) // Moved up by 10px (was 8, now -2)
        }
        .contentShape(Rectangle()) // Ensure entire nav bar area is tappable
        .offset(y: -20) // Moved up higher (more negative = higher) - applied to entire ZStack
    }
}


// MARK: - Account View (simplified version of settings account section)

struct AccountView: View {
    @EnvironmentObject var authVM: AuthVM
    @EnvironmentObject var vm: NewsVM
    
    var body: some View {
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
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 20)
            .padding(.vertical, 16)
            .background(Color.darkGreyBackground)
            
            // Account Content
            ScrollView {
                VStack(spacing: 24) {
                    // Title
                    Text("Settings")
                        .font(.title3)
                        .fontWeight(.semibold)
                        .foregroundColor(.primary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.top, 8)
                        .padding(.horizontal, 20)
                    
                    if let user = authVM.currentUser {
                        // Account Information
                        VStack(alignment: .leading, spacing: 16) {
                            Text("Account Information")
                                .font(.headline)
                                .fontWeight(.semibold)
                                .foregroundColor(.primary)
                            
                            VStack(spacing: 16) {
                                // Name field
                                NameInputField(authVM: authVM)
                                
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
                                        Text("\(user.dailyUsageCount)/3 Fetches")
                                            .font(.subheadline)
                                            .foregroundColor(.secondary)
                                    }
                                }
                                
                                // Country picker
                                CountryPickerField(vm: vm)
                            }
                            .padding()
                            .background(Color(.systemGray6))
                            .cornerRadius(12)
                        }
                        .padding(.horizontal, 20)
                        
                        // Summary Length Section
                        SummaryLengthSection()
                        
                        // Playback Speed Section
                        PlaybackSpeedSection()
                        
                        // Voice Section
                        VoiceSection()
                        
                        // Content Filter Section
                        ContentFilterSection()
                        
                        // Sign Out Button
                        Button("Sign Out") {
                            authVM.logout()
                        }
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(.red)
                        .padding()
                        .frame(maxWidth: .infinity)
                        .background(Color.red.opacity(0.1))
                        .cornerRadius(12)
                        .padding(.horizontal, 20)
                    }
                    
                    // Bottom spacing
                    Spacer(minLength: vm.canPlay ? 120 : 60)
                }
                .padding(.vertical, 16)
            }
        }
        .background(Color.darkGreyBackground)
    }
}

// Country Picker Field Component
struct CountryPickerField: View {
    @ObservedObject var vm: NewsVM
    
    // Common countries with ISO codes
    let countries: [(code: String, name: String)] = [
        ("us", "United States"),
        ("gb", "United Kingdom"),
        ("ca", "Canada"),
        ("au", "Australia"),
        ("de", "Germany"),
        ("fr", "France"),
        ("it", "Italy"),
        ("es", "Spain"),
        ("nl", "Netherlands"),
        ("be", "Belgium"),
        ("ch", "Switzerland"),
        ("at", "Austria"),
        ("se", "Sweden"),
        ("no", "Norway"),
        ("dk", "Denmark"),
        ("fi", "Finland"),
        ("ie", "Ireland"),
        ("nz", "New Zealand"),
        ("jp", "Japan"),
        ("kr", "South Korea"),
        ("cn", "China"),
        ("in", "India"),
        ("br", "Brazil"),
        ("mx", "Mexico"),
        ("ar", "Argentina"),
        ("za", "South Africa"),
        ("eg", "Egypt"),
        ("ae", "United Arab Emirates"),
        ("sa", "Saudi Arabia"),
        ("il", "Israel"),
        ("tr", "Turkey"),
        ("ru", "Russia"),
        ("pl", "Poland"),
        ("pt", "Portugal"),
        ("gr", "Greece")
    ]
    
    var body: some View {
        HStack {
            Text("Country")
                .font(.subheadline)
                .fontWeight(.medium)
                .foregroundColor(.primary)
            Spacer()
            Picker("Country", selection: $vm.selectedCountry) {
                ForEach(countries, id: \.code) { country in
                    Text(country.name).tag(country.code)
                }
            }
            .pickerStyle(.menu)
            .font(.subheadline)
        }
    }
}

// Name Input Field Component
struct NameInputField: View {
    @ObservedObject var authVM: AuthVM
    @State private var nameText: String = ""
    @State private var isEditing: Bool = false
    @State private var isSaving: Bool = false
    
    var body: some View {
        HStack {
            Text("Name")
                .font(.subheadline)
                .fontWeight(.medium)
                .foregroundColor(.primary)
            Spacer()
            
            if isEditing {
                HStack {
                    TextField("Enter your name", text: $nameText)
                        .font(.subheadline)
                        .textFieldStyle(.roundedBorder)
                        .frame(width: 150)
                    
                    Button(action: {
                        Task {
                            await saveName()
                        }
                    }) {
                        if isSaving {
                            ProgressView()
                                .scaleEffect(0.8)
                        } else {
                            Image(systemName: "checkmark")
                                .foregroundColor(.green)
                        }
                    }
                    .disabled(isSaving)
                    
                    Button(action: {
                        cancelEditing()
                    }) {
                        Image(systemName: "xmark")
                            .foregroundColor(.red)
                    }
                    .disabled(isSaving)
                }
            } else {
                HStack {
                    Text(authVM.currentUser?.name ?? "Not set")
                        .font(.subheadline)
                        .foregroundColor(authVM.currentUser?.name != nil ? .secondary : .secondary.opacity(0.6))
                    
                    Button(action: {
                        startEditing()
                    }) {
                        Image(systemName: "pencil")
                            .foregroundColor(.blue)
                            .font(.caption)
                    }
                }
            }
        }
        .onAppear {
            nameText = authVM.currentUser?.name ?? ""
        }
    }
    
    private func startEditing() {
        nameText = authVM.currentUser?.name ?? ""
        isEditing = true
    }
    
    private func cancelEditing() {
        nameText = authVM.currentUser?.name ?? ""
        isEditing = false
    }
    
    private func saveName() async {
        isSaving = true
        defer { isSaving = false }
        
        do {
            let trimmedName = nameText.trimmingCharacters(in: .whitespacesAndNewlines)
            let nameToSave = trimmedName.isEmpty ? nil : trimmedName
            try await ApiClient.updateUserName(nameToSave)
            
            // Refresh user data to get updated name
            await authVM.refreshUser()
            
            isEditing = false
        } catch {
            print("Failed to update name: \(error)")
            // Optionally show an error message to the user
        }
    }
}

#Preview {
    MainTabView()
        .environmentObject(NewsVM())
        .environmentObject(AuthVM())
}
