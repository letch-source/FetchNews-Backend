//
//  TopicOnboardingView.swift
//  FetchNews
//
//  Topic selection onboarding screen shown after account creation
//

import SwiftUI

struct TopicOnboardingView: View {
    @EnvironmentObject var vm: NewsVM
    @EnvironmentObject var authVM: AuthVM
    @Environment(\.dismiss) private var dismiss
    @State private var selectedTopics: Set<String> = []
    @State private var isSubmitting = false
    
    // Regular topics from ContentView
    private let regularTopics = [
        "business", "entertainment", "general", "health", "science", "sports", "technology", "world"
    ]
    
    // Predefined topics from CustomTopicView
    private let predefinedTopics = [
        "Politics", "Environment", "Education", "Finance", "Travel",
        "Food", "Fashion", "Art", "Music", "Gaming", "Cryptocurrency",
        "Real Estate", "Automotive", "Fitness", "Weather", "Space", "AI"
    ]
    
    // Combine all topics for display
    private var allTopics: [String] {
        regularTopics.map { $0.capitalized } + predefinedTopics
    }
    
    private var canSubmit: Bool {
        selectedTopics.count >= 6
    }
    
    var body: some View {
        NavigationView {
            ZStack {
                Color.darkGreyBackground
                    .ignoresSafeArea()
                
                ScrollView {
                    VStack(spacing: 24) {
                        // Header
                        VStack(spacing: 12) {
                            Image(systemName: "sparkles")
                                .font(.system(size: 50))
                                .foregroundColor(.blue)
                            
                            Text("Pick Your Topics")
                                .font(.title)
                                .fontWeight(.bold)
                            
                            Text("Select at least 6 topics you're interested in")
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                                .multilineTextAlignment(.center)
                            
                            // Selection counter
                            HStack(spacing: 4) {
                                Text("\(selectedTopics.count)")
                                    .font(.headline)
                                    .foregroundColor(canSubmit ? .green : .secondary)
                                Text("/ 6 topics selected")
                                    .font(.subheadline)
                                    .foregroundColor(.secondary)
                            }
                            .padding(.top, 8)
                        }
                        .padding(.top, 20)
                        .padding(.horizontal)
                        
                        // Topic selection grid
                        LazyVGrid(columns: [
                            GridItem(.adaptive(minimum: 140), spacing: 10, alignment: .center)
                        ], alignment: .center, spacing: 10) {
                            ForEach(allTopics, id: \.self) { topic in
                                TopicSelectionBubble(
                                    title: topic,
                                    isSelected: selectedTopics.contains(topic)
                                ) {
                                    withAnimation(.easeInOut(duration: 0.2)) {
                                        if selectedTopics.contains(topic) {
                                            selectedTopics.remove(topic)
                                        } else {
                                            selectedTopics.insert(topic)
                                        }
                                    }
                                }
                            }
                        }
                        .padding(.horizontal)
                        
                        Spacer(minLength: 100)
                    }
                }
            }
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: {
                        submitTopics()
                    }) {
                        if isSubmitting {
                            ProgressView()
                                .progressViewStyle(CircularProgressViewStyle(tint: .white))
                        } else {
                            Text("Select")
                                .fontWeight(.semibold)
                        }
                    }
                    .disabled(!canSubmit || isSubmitting)
                    .foregroundColor(canSubmit && !isSubmitting ? .blue : .gray)
                }
            }
        }
        .interactiveDismissDisabled() // Prevent swiping away
    }
    
    private func submitTopics() {
        guard canSubmit else { return }
        
        isSubmitting = true
        
        Task {
            // Add all selected topics to custom topics
            for topic in selectedTopics {
                await vm.addCustomTopic(topic)
            }
            
            // IMPORTANT: Save selectedTopics immediately (not debounced) so onboarding doesn't show again
            // Set selectedTopics first
            await MainActor.run {
                vm.selectedTopics = selectedTopics
            }
            
            // Save preferences immediately (bypass debounce) to ensure it's saved before we check
            do {
                let preferences = UserPreferences(
                    selectedVoice: vm.selectedVoice,
                    playbackRate: vm.playbackRate,
                    upliftingNewsOnly: vm.upliftingNewsOnly,
                    length: String(vm.length.rawValue),
                    lastFetchedTopics: Array(vm.lastFetchedTopics),
                    selectedTopics: Array(selectedTopics), // Save the selected topics
                    excludedNewsSources: Array(vm.excludedNewsSources),
                    scheduledSummaries: []
                )
                _ = try await ApiClient.updateUserPreferences(preferences)
                print("✅ Saved selectedTopics to backend: \(selectedTopics.count) topics - \(selectedTopics.joined(separator: ", "))")
            } catch {
                print("❌ Failed to save selectedTopics: \(error)")
            }
            
            // Reload custom topics to ensure sync
            await vm.loadCustomTopics()
            
            // Refresh user data to sync selectedTopics to AuthVM's currentUser
            await authVM.refreshUser()
            
            // Verify the user has selectedTopics before dismissing
            if let currentUser = authVM.currentUser {
                print("📋 After refresh - user selectedTopics count: \(currentUser.selectedTopics.count)")
            }
            
            // Also hide onboarding flag in AuthVM
            await MainActor.run {
                authVM.showTopicOnboarding = false
                isSubmitting = false
                // Dismiss this view to show the main app
                dismiss()
            }
        }
    }
}

// MARK: - Topic Selection Bubble

struct TopicSelectionBubble: View {
    let title: String
    let isSelected: Bool
    var action: () -> Void
    
    var body: some View {
        Button(action: action) {
            Text(title)
                .lineLimit(1)
                .truncationMode(.tail)
                .minimumScaleFactor(0.9)
                .padding(.vertical, 12)
                .padding(.horizontal, 16)
                .frame(minWidth: 140)
                .background(isSelected ? Color.blue : Color.buttonGrey)
                .foregroundColor(.white)
                .cornerRadius(999)
                .scaleEffect(isSelected ? 1.05 : 1.0)
        }
        .buttonStyle(PlainButtonStyle())
    }
}

#Preview {
    TopicOnboardingView()
        .environmentObject(NewsVM())
        .environmentObject(AuthVM())
}

