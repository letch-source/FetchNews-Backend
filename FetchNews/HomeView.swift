//
//  HomeView.swift
//  FetchNews
//
//  Created by Finlay Smith on 8/14/25.
//

import SwiftUI

// MARK: - Constants

// MARK: - Scroll Detection

struct ScrollOffsetPreferenceKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

// MARK: - HomeView

struct HomeView: View {
    @EnvironmentObject var vm: NewsVM
    @EnvironmentObject var authVM: AuthVM
    @State private var showingCustomTopics = false
    @State private var expandSummary = false
    @State private var isScrubbing = false
    @State private var scrubValue: Double = 0
    @State private var showAllSelected = false
    @State private var showAllTrending = false
    @State private var showAllRecommended = false
    @State private var showAllCustom = false
    @State private var isScrolledInRecents = false

    private var fetchDisabled: Bool {
        vm.isBusy || vm.phase != .idle || vm.selectedTopics.isEmpty || !vm.isDirty
    }

    private var fetchTitle: String {
        switch vm.phase {
        case .gather: return "Gathering sources…"
        case .summarize: return "Building summary…"
        case .tts: return "Recording audio…"
        default: return "Fetch News"
        }
    }

    /// Title uses last fetched topics, not live selected topics.
    private var fetchedTitle: String { userNewsTitle(from: vm.lastFetchedTopics) }

    /// Only show items that actually have previewable text.
    private var displayableItems: [Item] {
        vm.items.filter { !$0.summary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    }

    var body: some View {
        VStack(spacing: 0) {
            header

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 24, pinnedViews: [.sectionHeaders]) {
                    
                    // Selected Topics Section
                    SelectedTopicsSection(
                        selectedTopics: vm.selectedTopics,
                        recentTopics: vm.lastFetchedTopics,
                        isScrolledInRecents: $isScrolledInRecents,
                        onTopicToggle: { topic in 
                            vm.toggle(topic)
                        },
                        showAll: $showAllSelected
                    )
                    
                    // Trending Topics Section
                    TrendingTopicsSection(
                        trendingTopics: vm.trendingTopics,
                        selectedTopics: vm.selectedTopics,
                        onTopicToggle: { topic in vm.toggle(topic) },
                        showAll: $showAllTrending
                    )
                    
                    // Recommended Topics Section
                    RecommendedTopicsSection(
                        recommendedTopics: vm.recommendedTopics,
                        selectedTopics: vm.selectedTopics,
                        onTopicToggle: { topic in vm.toggle(topic) },
                        showAll: $showAllRecommended
                    )
                    
                    // Custom Topics Section
                    CustomTopicsSection(
                        customTopics: vm.customTopics,
                        selectedTopics: vm.selectedTopics,
                        onTopicToggle: { topic in vm.toggle(topic) },
                        onAddCustom: { topic in 
                            Task {
                                await vm.addCustomTopic(topic)
                            }
                        },
                        showAll: $showAllCustom,
                        vm: vm
                    )

                    // Reset Button (if topics are selected)
                    if !vm.selectedTopics.isEmpty {
                        Button("Reset") {
                            vm.selectedTopics.removeAll()
                            vm.items = []
                            vm.combined = nil
                            vm.isDirty = true
                            vm.lastError = nil
                            expandSummary = false
                        }
                        .font(.subheadline.weight(.medium))
                        .padding(.vertical, 10)
                        .padding(.horizontal, 20)
                        .background(Color.clear)
                        .foregroundColor(.red)
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.red, lineWidth: 1))
                        .cornerRadius(8)
                        .padding(.horizontal, 20)
                    }

                    // Error message
                    if let error = vm.lastError {
                        VStack(spacing: 12) {
                            HStack {
                                Image(systemName: "exclamationmark.triangle.fill")
                                    .foregroundColor(.orange)
                                Text("Error")
                                    .font(.headline)
                                    .foregroundColor(.orange)
                                Spacer()
                            }
                            Text(error)
                                .font(.body)
                                .foregroundColor(.secondary)
                                .multilineTextAlignment(.leading)
                            
                            Button("Retry") {
                                vm.lastError = nil
                                Task { await vm.fetch() }
                            }
                            .padding(.vertical, 8)
                            .padding(.horizontal, 16)
                            .background(Color.orange)
                            .foregroundColor(.white)
                            .cornerRadius(8)
                        }
                        .padding()
                        .background(Color.orange.opacity(0.1))
                        .cornerRadius(12)
                        .padding(.horizontal)
                    }

                    // Main summary
                    if let c = vm.combined {
                        SummaryCard(
                            title: fetchedTitle,
                            fullText: c.summary,
                            isExpanded: expandSummary,
                            canPlay: vm.canPlay,
                            isPlaying: vm.isPlaying,
                            onToggle: { withAnimation(.easeInOut) { expandSummary.toggle() } },
                            onPlayPause: { vm.playPause() }
                        )
                        .padding(.horizontal)
                    }

                    // Articles
                    if !displayableItems.isEmpty {
                        Section {
                            LazyVStack(spacing: 12) {
                                ForEach(displayableItems) { it in
                                    SourceCard(item: it)
                                        .padding(.horizontal)
                                }
                            }
                            .padding(.top, 16)
                        } header: {
                            VStack(spacing: 6) {
                                HStack {
                                    Spacer()
                                    Text("Articles")
                                        .font(.title3.weight(.semibold))
                                    Spacer()
                                }
                                Rectangle()
                                    .fill(Color.darkGreyBackground)
                                    .frame(height: 12)
                                    .accessibilityHidden(true)
                            }
                            .padding(.horizontal)
                            .padding(.top, 2)
                            .background(Color.darkGreyBackground)
                            .zIndex(1)
                        }
                    }
                    
                    // Empty state - show when no summary and no articles
                    if vm.combined == nil && displayableItems.isEmpty && !vm.isBusy && vm.phase == .idle {
                        VStack(spacing: 20) {
                            VStack(spacing: 8) {
                                Text("No News Yet")
                                    .font(.title2)
                                    .fontWeight(.semibold)
                                    .foregroundColor(.primary)
                                
                                Text("Select some topics and tap the Fetch button to get your personalized news summary.")
                                    .font(.body)
                                    .foregroundColor(.secondary)
                                    .multilineTextAlignment(.center)
                                    .padding(.horizontal, 40)
                            }
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .padding(.top, 60)
                    }

                    // Add extra bottom padding when audio player is visible so content can scroll above it
                    Spacer(minLength: vm.canPlay ? 150 : 100) // Extra space for audio player + navigation
                }
            }
            // Adjust scroll content insets when audio player is visible
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if vm.canPlay {
                    // Spacer that matches the audio player height (~100px for bubble + 80px bottom padding = 180px)
                    // This allows content to scroll above the audio player
                    Color.clear.frame(height: 180)
                }
            }
        }
        // Now-playing bubble
        .overlay(alignment: .bottom) {
            if vm.canPlay {
                NowPlayingBubble(
                    title: fetchedTitle,
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
                    }
                )
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .padding(.bottom, 80) // Space above navigation bar
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .onChange(of: vm.combined?.id, initial: false) { _, _ in
            expandSummary = false
        }
        .onDisappear {
            vm.cancelCurrentRequest()
        }
        .sheet(isPresented: $showingCustomTopics) {
            CustomTopicView().environmentObject(vm)
        }
        .onAppear {
            // Set the authVM reference in NewsVM for limit checking
            vm.authVM = authVM
            
            // Check for scheduled summaries when HomeView appears
            Task {
                await vm.checkForScheduledSummary()
            }
            
            // Start periodic checking for scheduled summaries every 2 minutes
            vm.startPeriodicScheduledSummaryCheck()
        }
        .onDisappear {
            // Stop periodic checking when HomeView disappears
            vm.stopPeriodicScheduledSummaryCheck()
        }
        .sheet(isPresented: $vm.showingSubscriptionView) {
            SubscriptionView()
                .environmentObject(vm)
                .environmentObject(authVM)
        }
    }

    private var header: some View {
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
                
                // Premium button - only show if user is not premium
                if let user = authVM.currentUser, !user.isPremium {
                    Button("PREMIUM") {
                        vm.showSubscriptionView()
                    }
                    .font(.subheadline.weight(.semibold))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Color.yellow)
                    .foregroundColor(.black)
                    .cornerRadius(8)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
        .background(Color.darkGreyBackground)
    }
}

// MARK: - Topic Sections

struct SelectedTopicsSection: View {
    let selectedTopics: Set<String>
    let recentTopics: Set<String>
    @Binding var isScrolledInRecents: Bool
    let onTopicToggle: (String) -> Void
    @Binding var showAll: Bool
    
    // Combined topics: selected + recent (excluding currently selected)
    private var allTopics: [String] {
        let selected = Array(selectedTopics).sorted()
        let recent = Array(recentTopics.subtracting(selectedTopics)).sorted()
        return selected + recent
    }
    
    private var sectionTitle: String {
        isScrolledInRecents ? "Recents" : "Selected"
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(sectionTitle)
                    .font(.headline)
                    .fontWeight(.semibold)
                    .foregroundColor(.primary)
                Spacer()
                Button(showAll ? "Show less" : "See all") {
                    showAll.toggle()
                }
                .font(.subheadline)
                .foregroundColor(.blue)
            }
            .padding(.horizontal, 20)
            
            if allTopics.isEmpty {
                Text("No topics selected")
                    .font(.body)
                    .foregroundColor(.secondary)
                    .padding(.horizontal, 20)
            } else {
                if showAll {
                    // Vertical stacked layout
                    LazyVGrid(columns: [
                        GridItem(.adaptive(minimum: 140), spacing: 10, alignment: .center)
                    ], alignment: .leading, spacing: 10) {
                        ForEach(allTopics, id: \.self) { topic in
                            TopicChip(
                                title: topic.capitalized,
                                isActive: selectedTopics.contains(topic),
                                minWidth: 140
                            ) { onTopicToggle(topic) }
                        }
                    }
                    .padding(.horizontal, 20)
                } else {
                    // Horizontal scroll layout with scroll detection
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 10) {
                            ForEach(allTopics, id: \.self) { topic in
                                TopicChip(
                                    title: topic.capitalized,
                                    isActive: selectedTopics.contains(topic),
                                    minWidth: 140
                                ) { onTopicToggle(topic) }
                            }
                        }
                        .padding(.horizontal, 20)
                        .background(
                            GeometryReader { geometry in
                                Color.clear
                                    .preference(key: ScrollOffsetPreferenceKey.self, value: geometry.frame(in: .named("scroll")).minX)
                            }
                        )
                    }
                    .coordinateSpace(name: "scroll")
                    .onPreferenceChange(ScrollOffsetPreferenceKey.self) { value in
                        // Detect when scrolled to recent topics (negative offset means scrolled right)
                        let threshold = -100.0 // Adjust this value as needed
                        isScrolledInRecents = value < threshold
                    }
                }
            }
        }
    }
}

struct TrendingTopicsSection: View {
    let trendingTopics: [String]
    let selectedTopics: Set<String>
    let onTopicToggle: (String) -> Void
    @Binding var showAll: Bool
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Trending")
                    .font(.headline)
                    .fontWeight(.semibold)
                    .foregroundColor(.primary)
                Spacer()
                if !trendingTopics.isEmpty {
                    Button(showAll ? "Show less" : "See all") {
                        showAll.toggle()
                    }
                    .font(.subheadline)
                    .foregroundColor(.blue)
                }
            }
            .padding(.horizontal, 20)
            
            if trendingTopics.isEmpty {
                // Show unavailable message when no trending topics
                Text("Trending topics unavailable")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 8)
            } else if showAll {
                // Vertical stacked layout
                LazyVGrid(columns: [
                    GridItem(.adaptive(minimum: 140), spacing: 10, alignment: .center)
                ], alignment: .leading, spacing: 10) {
                    ForEach(trendingTopics, id: \.self) { topic in
                        TopicChip(
                            title: topic,
                            isActive: selectedTopics.contains(topic.lowercased()),
                            minWidth: 140
                        ) { onTopicToggle(topic.lowercased()) }
                    }
                }
                .padding(.horizontal, 20)
            } else {
                // Horizontal scroll layout
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(trendingTopics, id: \.self) { topic in
                            TopicChip(
                                title: topic,
                                isActive: selectedTopics.contains(topic.lowercased()),
                                minWidth: 140
                            ) { onTopicToggle(topic.lowercased()) }
                        }
                    }
                    .padding(.horizontal, 20)
                }
            }
        }
    }
}

struct RecommendedTopicsSection: View {
    let recommendedTopics: [String]
    let selectedTopics: Set<String>
    let onTopicToggle: (String) -> Void
    @Binding var showAll: Bool
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Recommended")
                    .font(.headline)
                    .fontWeight(.semibold)
                    .foregroundColor(.primary)
                Spacer()
                if !recommendedTopics.isEmpty {
                    Button(showAll ? "Show less" : "See all") {
                        showAll.toggle()
                    }
                    .font(.subheadline)
                    .foregroundColor(.blue)
                }
            }
            .padding(.horizontal, 20)
            
            if recommendedTopics.isEmpty {
                // Show unavailable message when no recommended topics
                Text("Recommended topics unavailable")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 8)
            } else if showAll {
                // Vertical stacked layout
                LazyVGrid(columns: [
                    GridItem(.adaptive(minimum: 140), spacing: 10, alignment: .center)
                ], alignment: .leading, spacing: 10) {
                    ForEach(recommendedTopics, id: \.self) { topic in
                        TopicChip(
                            title: topic,
                            isActive: selectedTopics.contains(topic.lowercased()),
                            minWidth: 140
                        ) { onTopicToggle(topic.lowercased()) }
                    }
                }
                .padding(.horizontal, 20)
            } else {
                // Horizontal scroll layout
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(recommendedTopics, id: \.self) { topic in
                            TopicChip(
                                title: topic,
                                isActive: selectedTopics.contains(topic.lowercased()),
                                minWidth: 140
                            ) { onTopicToggle(topic.lowercased()) }
                        }
                    }
                    .padding(.horizontal, 20)
                }
            }
        }
    }
}

struct CustomTopicsSection: View {
    let customTopics: [String]
    let selectedTopics: Set<String>
    let onTopicToggle: (String) -> Void
    let onAddCustom: (String) -> Void
    @Binding var showAll: Bool
    let vm: NewsVM
    @State private var customTopicText = ""
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Custom")
                    .font(.headline)
                    .fontWeight(.semibold)
                    .foregroundColor(.primary)
                Spacer()
                HStack(spacing: 12) {
                    // Delete button for selected custom topics
                    let selectedCustomTopics = selectedTopics.intersection(Set(customTopics))
                    if !selectedCustomTopics.isEmpty {
                        Button("Delete") {
                            Task {
                                await vm.deleteSelectedCustomTopics()
                            }
                        }
                        .font(.subheadline)
                        .foregroundColor(.red)
                    }
                    
                    if !customTopics.isEmpty {
                        Button(showAll ? "Show less" : "See all") {
                            showAll.toggle()
                        }
                        .font(.subheadline)
                        .foregroundColor(.blue)
                    }
                }
            }
            .padding(.horizontal, 20)
            
            // Custom topic input - matches mockup styling
            HStack(spacing: 12) {
                TextField("Add custom topic", text: $customTopicText)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                    .onSubmit {
                        if !customTopicText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                            onAddCustom(customTopicText.trimmingCharacters(in: .whitespacesAndNewlines))
                            customTopicText = ""
                        }
                    }
                
                Button(action: {
                    if !customTopicText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        onAddCustom(customTopicText.trimmingCharacters(in: .whitespacesAndNewlines))
                        customTopicText = ""
                    }
                }) {
                    Image(systemName: "plus")
                        .font(.title2)
                        .foregroundColor(.blue)
                        .frame(width: 36, height: 36)
                        .background(Color.blue.opacity(0.1))
                        .cornerRadius(8)
                }
            }
            .padding(.horizontal, 20)
            
            // Custom topics chips
            if !customTopics.isEmpty {
                if showAll {
                    // Vertical stacked layout
                    LazyVGrid(columns: [
                        GridItem(.adaptive(minimum: 140), spacing: 10, alignment: .center)
                    ], alignment: .leading, spacing: 10) {
                        ForEach(customTopics, id: \.self) { topic in
                            TopicChip(
                                title: topic,
                                isActive: selectedTopics.contains(topic),
                                minWidth: 140
                            ) { onTopicToggle(topic) }
                        }
                    }
                    .padding(.horizontal, 20)
                } else {
                    // Horizontal scroll layout
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 10) {
                            ForEach(customTopics, id: \.self) { topic in
                                TopicChip(
                                    title: topic,
                                    isActive: selectedTopics.contains(topic),
                                    minWidth: 140
                                ) { onTopicToggle(topic) }
                            }
                        }
                        .padding(.horizontal, 20)
                    }
                }
            }
        }
        .onTapGesture {
            // Dismiss keyboard when tapping outside text fields
            UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
        }
    }
}

// MARK: - Reuse existing components from ContentView.swift

// TopicChip, LengthChip, SummaryCard, SourceCard, NowPlayingBubble
// These will be imported from ContentView.swift or moved to a shared file

#Preview {
    HomeView()
        .environmentObject(NewsVM())
        .environmentObject(AuthVM())
}
