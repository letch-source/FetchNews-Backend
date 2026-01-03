//
//  TopicFeedView.swift
//  FetchNews
//
//  Vertical scrolling feed with per-topic audio and sticky headers
//

import SwiftUI

struct TopicFeedView: View {
    @EnvironmentObject var vm: NewsVM
    @EnvironmentObject var authVM: AuthVM
    @State private var currentPageIndex: Int = 0
    @State private var scrollOffset: CGFloat = 0
    @State private var showingArticles: TopicSection? = nil
    @State private var isSaved: Bool = false
    @State private var isSaving: Bool = false
    @State private var recommendedTopics: [TopicSection] = []
    @State private var isLoadingRecommended: Bool = false
    @State private var showAIAssistant = false
    @State private var wasPlayingBeforeAssistant = false
    @State private var discoveryTopicIndex: Int = 0
    @State private var predefinedTopics: [TopicCategory] = []
    @State private var isLoadingPredefinedTopics = false
    
    // Get topic sections from combined summary (My Topics)
    private var myTopicSections: [TopicSection] {
        vm.combined?.topicSections ?? []
    }
    
    private var allTopics: [TopicSection] {
        myTopicSections + recommendedTopics
    }
    
    // Get unselected topics for discovery
    private var unselectedTopics: [String] {
        let allPredefined = predefinedTopics.flatMap { $0.topics }
        let selected = Set(vm.customTopics)
        return allPredefined.filter { !selected.contains($0) }
    }
    
    // Get limited list for discovery with indices
    private var discoveryTopicsList: [(index: Int, topic: String)] {
        let topics = Array(unselectedTopics.prefix(20))
        return topics.enumerated().map { (index: $0.offset, topic: $0.element) }
    }
    
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                Color.darkGreyBackground
                    .ignoresSafeArea()
                
                mainContentView
            }
        }
        .sheet(item: $showingArticles) { topic in
            ArticlesSheetView(topicSection: topic)
                .environmentObject(vm)
        }
        .sheet(isPresented: $showAIAssistant, onDismiss: {
            handleAIAssistantDismiss()
        }) {
            aiAssistantSheet
        }
        .task {
            await loadInitialData()
        }
        .onChange(of: vm.combined?.id) { _, _ in
            Task {
                await checkIfSaved()
            }
        }
        .onChange(of: currentPageIndex) { oldValue, newValue in
            handlePageChangeIfNeeded(from: oldValue, to: newValue)
        }
    }
    
    @ViewBuilder
    private var mainContentView: some View {
        if vm.isBusy || vm.phase != .idle {
            loadingStateView
        } else if !allTopics.isEmpty {
                    // Main feed with vertical paging
                    TabView(selection: $currentPageIndex) {
                        ForEach(Array(allTopics.enumerated()), id: \.element.id) { index, topicSection in
                            VerticalTopicPageView(
                                topicSection: topicSection,
                                topicIndex: index,
                                totalTopics: allTopics.count,
                                isMyTopic: index < myTopicSections.count,
                                onArticlesButtonTap: {
                                    showingArticles = topicSection
                                }
                            )
                            .tag(index)
                        }
                    }
                    .tabViewStyle(.page(indexDisplayMode: .never))
                    .ignoresSafeArea()
                    .onChange(of: currentPageIndex) { oldValue, newValue in
                        handlePageChange(from: oldValue, to: newValue)
                    }
                    
                    // Page indicator dots
                    VStack {
                        Spacer()
                        
                        // Topic position indicator
                        HStack(spacing: 4) {
                            if currentPageIndex < myTopicSections.count {
                                Text("My Topics")
                                    .font(.caption2)
                                    .foregroundColor(.white.opacity(0.6))
                                Circle()
                                    .fill(Color.white.opacity(0.4))
                                    .frame(width: 3, height: 3)
                            } else {
                                Text("Recommended")
                                    .font(.caption2)
                                    .foregroundColor(.white.opacity(0.6))
                                Circle()
                                    .fill(Color.white.opacity(0.4))
                                    .frame(width: 3, height: 3)
                            }
                            Text("\(currentPageIndex + 1) of \(allTopics.count)")
                                .font(.caption2)
                                .foregroundColor(.white.opacity(0.6))
                        }
                        .padding(.bottom, vm.canPlay ? 180 : 100)
                    }
                    
                    // Compact audio player at bottom
                    if vm.canPlay {
                        VStack {
                            Spacer()
                            CompactTopicAudioPlayer(
                                topicSection: allTopics[safe: currentPageIndex],
                                onAIAssistant: vm.combined != nil ? {
                                    // Remember if audio was playing
                                    wasPlayingBeforeAssistant = vm.isPlaying
                                    // Pause audio before opening assistant
                                    if vm.isPlaying {
                                        vm.playPause()
                                    }
                                    showAIAssistant = true
                                } : nil
                            )
                            .padding(.bottom, 80)
                        }
                    }
                    
                    // Save button - top right corner
                    if vm.combined != nil {
                        VStack {
                            HStack {
                                Spacer()
                                Button(action: {
                                    toggleSave()
                                }) {
                                    Image(systemName: isSaved ? "bookmark.fill" : "bookmark")
                                        .font(.system(size: 22, weight: .semibold))
                                        .foregroundColor(isSaved ? .yellow : .white)
                                        .frame(width: 44, height: 44)
                                        .background(Color.black.opacity(0.6))
                                        .clipShape(Circle())
                                        .overlay(
                                            Circle()
                                                .stroke(Color.white.opacity(0.3), lineWidth: 1)
                                        )
                                }
                                .disabled(isSaving)
                                .padding(.top, 60)
                                .padding(.trailing, 20)
                            }
                            Spacer()
                        }
                    }
        } else if vm.combined == nil {
            emptyStateView
        }
    }
    
    private var loadingStateView: some View {
        VStack(spacing: 24) {
            AnimatedFetchImage()
                .frame(width: 120, height: 120)
                .clipShape(Circle())
                .background(
                    Circle()
                        .fill(Color(.systemGray5))
                        .frame(width: 120, height: 120)
                )
            
            Text("Fetching your news!")
                .font(.title2)
                .fontWeight(.semibold)
                .foregroundColor(.primary)
        }
    }
    
    @ViewBuilder
    private var emptyStateView: some View {
        if isLoadingPredefinedTopics {
            VStack(spacing: 24) {
                ProgressView()
                Text("Loading topics...")
                    .foregroundColor(.secondary)
            }
        } else if !unselectedTopics.isEmpty {
                        // Topic discovery feed
                        TabView(selection: $discoveryTopicIndex) {
                            ForEach(discoveryTopicsList, id: \.topic) { item in
                                TopicDiscoveryCard(
                                    topic: item.topic,
                                    onAdd: {
                                        addTopic(item.topic, at: item.index)
                                    },
                                    onFetchAll: {
                                        Task {
                                            await vm.fetchNews()
                                        }
                                    },
                                    hasSelectedTopics: !vm.customTopics.isEmpty
                                )
                                .tag(item.index)
                            }
                        }
                        .tabViewStyle(.page(indexDisplayMode: .never))
                        .ignoresSafeArea()
                        
            // Page indicator
            discoveryPageIndicator
        } else {
            allSetFallbackView
        }
    }
    
    private var discoveryPageIndicator: some View {
        VStack {
            Spacer()
            HStack(spacing: 4) {
                Text("Discover Topics")
                    .font(.caption2)
                    .foregroundColor(.white.opacity(0.6))
                Circle()
                    .fill(Color.white.opacity(0.4))
                    .frame(width: 3, height: 3)
                Text("\(discoveryTopicIndex + 1) of \(min(unselectedTopics.count, 20))")
                    .font(.caption2)
                    .foregroundColor(.white.opacity(0.6))
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(.ultraThinMaterial)
            .clipShape(Capsule())
            .padding(.bottom, 100)
        }
    }
    
    private var allSetFallbackView: some View {
        VStack(spacing: 24) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 60))
                .foregroundColor(.green)
            
            Text("All Set!")
                .font(.title2)
                .fontWeight(.semibold)
            
            Text("You've selected topics. Fetch news to get started!")
                .font(.body)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
            
            Button(action: {
                Task {
                    await vm.fetchNews()
                }
            }) {
                HStack(spacing: 12) {
                    Image(systemName: "arrow.down.circle.fill")
                    Text("Fetch News Now")
                        .fontWeight(.semibold)
                }
                .foregroundColor(.white)
                .padding(.horizontal, 32)
                .padding(.vertical, 16)
                .background(
                    LinearGradient(
                        colors: [Color.blue, Color.blue.opacity(0.8)],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                )
                .cornerRadius(12)
                .shadow(color: Color.blue.opacity(0.3), radius: 8, x: 0, y: 4)
            }
        }
    }
    
    @ViewBuilder
    private var aiAssistantSheet: some View {
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
    
    // MARK: - Helper Functions
    
    private func loadInitialData() async {
        await checkIfSaved()
        await loadRecommendedTopics()
        await loadPredefinedTopicsForDiscovery()
    }
    
    private func handleAIAssistantDismiss() {
        if wasPlayingBeforeAssistant && !vm.isPlaying {
            vm.playPause()
        }
        wasPlayingBeforeAssistant = false
        
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 100_000_000)
            vm.objectWillChange.send()
        }
    }
    
    private func handlePageChangeIfNeeded(from oldValue: Int, to newValue: Int) {
        if newValue >= myTopicSections.count - 1 && recommendedTopics.isEmpty && !isLoadingRecommended {
            Task {
                await loadRecommendedTopics()
            }
        }
    }
    
    private func loadRecommendedTopics() async {
        // Only load if user has finished their topics and we haven't loaded yet
        guard !myTopicSections.isEmpty else { return }
        guard recommendedTopics.isEmpty else { return }
        guard !isLoadingRecommended else { return }
        
        await MainActor.run {
            isLoadingRecommended = true
        }
        
        do {
            let recommended = try await ApiClient.getRecommendedTopics()
            await MainActor.run {
                self.recommendedTopics = recommended
                self.isLoadingRecommended = false
                print("✅ Loaded \(recommended.count) recommended topics")
            }
        } catch {
            await MainActor.run {
                self.isLoadingRecommended = false
            }
            print("⚠️ Failed to load recommended topics: \(error)")
        }
    }
    
    private func checkIfSaved() async {
        guard let summaryId = vm.combined?.id else {
            await MainActor.run {
                isSaved = false
            }
            return
        }
        
        do {
            let saved = try await ApiClient.checkIfSummarySaved(summaryId: summaryId)
            await MainActor.run {
                isSaved = saved
            }
        } catch {
            print("Failed to check if summary is saved: \(error)")
        }
    }
    
    private func toggleSave() {
        guard let summary = vm.combined else { return }
        
        Task {
            await MainActor.run {
                isSaving = true
            }
            
            do {
                if isSaved {
                    // Unsave
                    try await ApiClient.unsaveSummary(summaryId: summary.id)
                    await MainActor.run {
                        isSaved = false
                        isSaving = false
                    }
                } else {
                    // Save - pass all required data
                    let topics = Array(vm.lastFetchedTopics)
                    let length = String(vm.length.rawValue)
                    try await ApiClient.saveSummary(
                        summary: summary,
                        items: vm.items,
                        topics: topics,
                        length: length
                    )
                    await MainActor.run {
                        isSaved = true
                        isSaving = false
                    }
                }
            } catch {
                await MainActor.run {
                    isSaving = false
                }
                print("Failed to toggle save: \(error)")
            }
        }
    }
    
    private func handlePageChange(from oldIndex: Int, to newIndex: Int) {
        print("📄 Page changed from \(oldIndex) to \(newIndex)")
        vm.currentTopicIndex = newIndex
        
        // Switch audio to new topic
        if let topicSection = allTopics[safe: newIndex] {
            vm.switchToTopicAudio(for: topicSection, autoPlay: vm.isPlaying)
        }
    }
    
    private func nextUpdateTime() -> String {
        let calendar = Calendar.current
        let now = Date()
        let currentHour = calendar.component(.hour, from: now)
        
        // Define update hours
        let morningHour = 6  // 6 AM
        let eveningHour = 18 // 6 PM
        
        var nextUpdate: Date?
        
        if currentHour < morningHour {
            // Next update is today at 6 AM
            nextUpdate = calendar.date(bySettingHour: morningHour, minute: 0, second: 0, of: now)
        } else if currentHour < eveningHour {
            // Next update is today at 6 PM
            nextUpdate = calendar.date(bySettingHour: eveningHour, minute: 0, second: 0, of: now)
        } else {
            // Next update is tomorrow at 6 AM
            if let tomorrow = calendar.date(byAdding: .day, value: 1, to: now) {
                nextUpdate = calendar.date(bySettingHour: morningHour, minute: 0, second: 0, of: tomorrow)
            }
        }
        
        guard let nextUpdate = nextUpdate else {
            return "Soon"
        }
        
        let formatter = DateFormatter()
        let isToday = calendar.isDateInToday(nextUpdate)
        let isTomorrow = calendar.isDateInTomorrow(nextUpdate)
        
        if isToday {
            formatter.dateFormat = "h:mm a"
            return "Today at \(formatter.string(from: nextUpdate))"
        } else if isTomorrow {
            formatter.dateFormat = "h:mm a"
            return "Tomorrow at \(formatter.string(from: nextUpdate))"
        } else {
            formatter.dateFormat = "MMM d 'at' h:mm a"
            return formatter.string(from: nextUpdate)
        }
    }
    
    private func loadPredefinedTopicsForDiscovery() async {
        guard predefinedTopics.isEmpty else { return }
        
        await MainActor.run {
            isLoadingPredefinedTopics = true
        }
        
        do {
            let response = try await ApiClient.getPredefinedTopics()
            await MainActor.run {
                self.predefinedTopics = response.categories
                self.isLoadingPredefinedTopics = false
            }
        } catch {
            await MainActor.run {
                self.isLoadingPredefinedTopics = false
            }
            print("⚠️ Failed to load predefined topics: \(error)")
        }
    }
    
    private func addTopic(_ topic: String, at index: Int) {
        Task {
            await vm.addCustomTopic(topic)
            // Auto-advance to next topic
            if index < discoveryTopicsList.count - 1 {
                withAnimation {
                    discoveryTopicIndex = index + 1
                }
            }
        }
    }
}

// MARK: - Vertical Topic Page View

struct VerticalTopicPageView: View {
    let topicSection: TopicSection
    let topicIndex: Int
    let totalTopics: Int
    let isMyTopic: Bool
    let onArticlesButtonTap: () -> Void
    
    @EnvironmentObject var vm: NewsVM
    @State private var scrollOffset: CGFloat = 0
    @State private var showStickyHeader: Bool = false
    
    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .top) {
                // Main scrollable content
                ScrollView(.vertical, showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 0) {
                        // Top padding for sticky header
                        Color.clear.frame(height: 80)
                        
                        // Topic name (large)
                        Text(smartCapitalized(topicSection.topic))
                            .font(.system(size: 36, weight: .bold))
                            .foregroundColor(.primary)
                            .padding(.horizontal, 20)
                            .padding(.bottom, 24)
                        
                        // Topic badge (My Topics vs Recommended)
                        HStack(spacing: 8) {
                            if isMyTopic {
                                Image(systemName: "star.fill")
                                    .font(.caption)
                                    .foregroundColor(.yellow)
                                Text("My Topics")
                                    .font(.caption)
                                    .fontWeight(.medium)
                                    .foregroundColor(.primary)
                            } else {
                                Image(systemName: "sparkles")
                                    .font(.caption)
                                    .foregroundColor(.purple)
                                Text("Recommended")
                                    .font(.caption)
                                    .fontWeight(.medium)
                                    .foregroundColor(.primary)
                            }
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(Color(.systemGray6))
                        .cornerRadius(12)
                        .padding(.horizontal, 20)
                        .padding(.bottom, 24)
                        
                        // Summary text with fade effect at top
                        ZStack(alignment: .top) {
                            // Summary text
                            VStack(alignment: .leading, spacing: 12) {
                                let paragraphs = topicSection.summary
                                    .components(separatedBy: "\n\n")
                                    .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
                                
                                ForEach(Array(paragraphs.enumerated()), id: \.offset) { index, paragraph in
                                    Text(paragraph.trimmingCharacters(in: .whitespacesAndNewlines))
                                        .font(.body)
                                        .foregroundColor(.primary)
                                        .fixedSize(horizontal: false, vertical: true)
                                        .padding(.bottom, index < paragraphs.count - 1 ? 12 : 0)
                                }
                            }
                            .padding(.horizontal, 20)
                            .background(
                                GeometryReader { geo in
                                    Color.clear.preference(
                                        key: ScrollOffsetPreferenceKey.self,
                                        value: geo.frame(in: .named("scroll")).minY
                                    )
                                }
                            )
                            
                            // Fade gradient at top (appears when scrolling)
                            if showStickyHeader {
                                LinearGradient(
                                    gradient: Gradient(stops: [
                                        .init(color: Color.darkGreyBackground, location: 0.0),
                                        .init(color: Color.darkGreyBackground.opacity(0), location: 1.0)
                                    ]),
                                    startPoint: .top,
                                    endPoint: .bottom
                                )
                                .frame(height: 100)
                                .allowsHitTesting(false)
                            }
                        }
                        
                        // Articles button at bottom
                        if !topicSection.articles.isEmpty {
                            Button(action: onArticlesButtonTap) {
                                HStack {
                                    Image(systemName: "doc.text")
                                        .font(.system(size: 18, weight: .semibold))
                                    Text("View \(topicSection.articles.count) Article\(topicSection.articles.count == 1 ? "" : "s")")
                                        .fontWeight(.semibold)
                                    Spacer()
                                    Image(systemName: "chevron.right")
                                        .font(.system(size: 14, weight: .semibold))
                                }
                                .foregroundColor(.white)
                                .padding()
                                .background(Color.blue)
                                .cornerRadius(12)
                            }
                            .padding(.horizontal, 20)
                            .padding(.top, 32)
                        }
                        
                        // Bottom padding for audio player
                        Spacer(minLength: vm.canPlay ? 250 : 150)
                    }
                }
                .coordinateSpace(name: "scroll")
                .onPreferenceChange(ScrollOffsetPreferenceKey.self) { value in
                    scrollOffset = value
                    // Show sticky header when scrolled down
                    withAnimation(.easeInOut(duration: 0.2)) {
                        showStickyHeader = value < -20
                    }
                }
                
                // Sticky header (appears when scrolling)
                if showStickyHeader {
                    VStack(spacing: 0) {
                        HStack {
                            Text(smartCapitalized(topicSection.topic))
                                .font(.headline)
                                .fontWeight(.bold)
                                .foregroundColor(.primary)
                            Spacer()
                        }
                        .padding(.horizontal, 20)
                        .padding(.vertical, 16)
                        .background(Color.darkGreyBackground.opacity(0.95))
                        
                        Divider()
                    }
                    .transition(.move(edge: .top).combined(with: .opacity))
                }
            }
        }
        .onAppear {
            // Play audio for this topic when it appears
            if let audioUrl = topicSection.audioUrl {
                vm.switchToTopicAudio(for: topicSection, autoPlay: false)
            }
        }
    }
}

// MARK: - Compact Topic Audio Player

struct CompactTopicAudioPlayer: View {
    let topicSection: TopicSection?
    @EnvironmentObject var vm: NewsVM
    @State private var isScrubbing = false
    @State private var scrubValue: Double = 0
    var onAIAssistant: (() -> Void)? = nil
    
    private func formatTime(_ seconds: Double) -> String {
        guard seconds.isFinite, seconds >= 0 else { return "0:00" }
        let s = Int(seconds.rounded())
        let m = s / 60
        let r = s % 60
        return String(format: "%d:%02d", m, r)
    }
    
    var body: some View {
        VStack(spacing: 0) {
            Divider()
                .background(Color(.separator))
            
            VStack(spacing: 12) {
                // Topic name
                if let topic = topicSection {
                    Text(smartCapitalized(topic.topic))
                        .font(.headline)
                        .fontWeight(.semibold)
                        .foregroundColor(.primary)
                        .lineLimit(1)
                }
                
                // Controls
                HStack(spacing: 16) {
                    // Play/Pause button
                    Button(action: { vm.playPause() }) {
                        Image(systemName: vm.isPlaying ? "pause.fill" : "play.fill")
                            .font(.system(size: 24, weight: .bold))
                            .foregroundColor(.primary)
                            .frame(width: 44, height: 44)
                    }
                    .disabled(!vm.canPlay)
                    .opacity(vm.canPlay ? 1.0 : 0.5)
                    
                    // AI Assistant button
                    if let aiAction = onAIAssistant, vm.combined != nil {
                        Button(action: aiAction) {
                            Image(systemName: "bubble.left.and.bubble.right.fill")
                                .font(.system(size: 20, weight: .bold))
                                .foregroundColor(.blue)
                                .frame(width: 44, height: 44)
                        }
                        .disabled(!vm.canPlay || vm.combined == nil)
                        .opacity(vm.canPlay && vm.combined != nil ? 1.0 : 0.5)
                    }
                    
                    // Progress bar
                    VStack(spacing: 6) {
                        Slider(
                            value: Binding(
                                get: { min(isScrubbing ? scrubValue : vm.currentTime, vm.duration > 0 ? vm.duration : 0) },
                                set: { newVal in
                                    scrubValue = newVal
                                    if !isScrubbing { vm.seek(to: newVal) }
                                }
                            ),
                            in: 0...(vm.duration > 0 ? vm.duration : 1),
                            onEditingChanged: { editing in
                                isScrubbing = editing
                                if !editing { vm.seek(to: scrubValue) }
                            }
                        )
                        .tint(.blue)
                        
                        // Time labels
                        HStack {
                            Text(formatTime(isScrubbing ? scrubValue : vm.currentTime))
                                .font(.caption)
                                .foregroundColor(.secondary)
                            Spacer()
                            Text(formatTime(vm.duration))
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 16)
            .background(Color(.systemBackground))
        }
    }
}

// MARK: - Articles Sheet View

struct ArticlesSheetView: View {
    let topicSection: TopicSection
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var vm: NewsVM
    
    var body: some View {
        NavigationView {
            ZStack {
                Color.darkGreyBackground
                    .ignoresSafeArea()
                
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        ForEach(topicSection.articles) { article in
                            ArticleCard(item: article)
                                .padding(.horizontal, 20)
                        }
                        
                        Spacer(minLength: 60)
                    }
                    .padding(.top, 16)
                }
            }
            .navigationTitle(smartCapitalized(topicSection.topic))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }
}

// MARK: - Article Card (Reused)

struct ArticleCard: View {
    let item: Item
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Source
            if let source = item.source {
                Text(source)
                    .font(.caption)
                    .foregroundColor(.blue)
            }
            
            // Title
            Text(item.title)
                .font(.subheadline)
                .fontWeight(.semibold)
                .foregroundColor(.primary)
                .lineLimit(2)
            
            // Summary preview
            if !item.summary.isEmpty {
                Text(item.summary)
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .lineLimit(3)
            }
            
            // URL link
            if let urlString = item.url, let url = URL(string: urlString) {
                Link(destination: url) {
                    HStack(spacing: 4) {
                        Text("Read more")
                            .font(.caption)
                        Image(systemName: "arrow.up.right")
                            .font(.system(size: 10))
                    }
                    .foregroundColor(.blue)
                }
            }
        }
        .padding(12)
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }
}

// MARK: - Array Extension for Safe Subscripting

extension Array {
    subscript(safe index: Index) -> Element? {
        return indices.contains(index) ? self[index] : nil
    }
}

// MARK: - Topic Discovery Card

struct TopicDiscoveryCard: View {
    let topic: String
    let onAdd: () -> Void
    let onFetchAll: () -> Void
    let hasSelectedTopics: Bool
    
    var body: some View {
        ZStack {
            // Background gradient
            LinearGradient(
                colors: [
                    Color.blue.opacity(0.3),
                    Color.purple.opacity(0.3),
                    Color.darkGreyBackground
                ],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()
            
            VStack(spacing: 0) {
                Spacer()
                
                // Main content
                VStack(spacing: 32) {
                    // Topic icon and name
                    VStack(spacing: 16) {
                        Image(systemName: topicIcon(for: topic))
                            .font(.system(size: 80))
                            .foregroundColor(.white)
                            .shadow(color: Color.black.opacity(0.2), radius: 10)
                        
                        Text(smartCapitalized(topic))
                            .font(.system(size: 42, weight: .bold))
                            .foregroundColor(.white)
                            .multilineTextAlignment(.center)
                            .shadow(color: Color.black.opacity(0.3), radius: 5)
                    }
                    
                    // Description
                    Text("Stay updated with the latest \(topic.lowercased()) news")
                        .font(.title3)
                        .foregroundColor(.white.opacity(0.9))
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 40)
                    
                    // Add button
                    Button(action: onAdd) {
                        HStack(spacing: 12) {
                            Image(systemName: "plus.circle.fill")
                                .font(.system(size: 24))
                            Text("Add \(smartCapitalized(topic))")
                                .font(.title3)
                                .fontWeight(.semibold)
                        }
                        .foregroundColor(.white)
                        .padding(.horizontal, 40)
                        .padding(.vertical, 20)
                        .background(Color.blue)
                        .cornerRadius(16)
                        .shadow(color: Color.blue.opacity(0.5), radius: 15, x: 0, y: 8)
                    }
                    
                    // Fetch all button (if user has selected topics)
                    if hasSelectedTopics {
                        Button(action: onFetchAll) {
                            Text("Fetch news from my topics")
                                .font(.callout)
                                .fontWeight(.medium)
                                .foregroundColor(.white.opacity(0.8))
                                .underline()
                        }
                        .padding(.top, 8)
                    }
                }
                .padding(.horizontal, 30)
                
                Spacer()
                
                // Swipe hint
                VStack(spacing: 8) {
                    Image(systemName: "chevron.up")
                        .font(.title3)
                        .foregroundColor(.white.opacity(0.5))
                    Text("Swipe to see more topics")
                        .font(.caption)
                        .foregroundColor(.white.opacity(0.5))
                }
                .padding(.bottom, 40)
            }
        }
    }
    
    private func topicIcon(for topic: String) -> String {
        let lowercased = topic.lowercased()
        switch lowercased {
        case let t where t.contains("tech"): return "laptopcomputer"
        case let t where t.contains("sport"): return "sportscourt"
        case let t where t.contains("business"), let t where t.contains("finance"): return "chart.line.uptrend.xyaxis"
        case let t where t.contains("health"): return "heart.fill"
        case let t where t.contains("science"): return "flask.fill"
        case let t where t.contains("entertain"): return "film.fill"
        case let t where t.contains("politic"): return "building.columns.fill"
        case let t where t.contains("environment"): return "leaf.fill"
        case let t where t.contains("education"): return "book.fill"
        case let t where t.contains("travel"): return "airplane"
        case let t where t.contains("food"): return "fork.knife"
        case let t where t.contains("fashion"): return "tshirt.fill"
        case let t where t.contains("art"): return "paintpalette.fill"
        case let t where t.contains("music"): return "music.note"
        case let t where t.contains("gaming"), let t where t.contains("game"): return "gamecontroller.fill"
        case let t where t.contains("crypto"): return "bitcoinsign.circle.fill"
        case let t where t.contains("real estate"): return "house.fill"
        case let t where t.contains("auto"): return "car.fill"
        case let t where t.contains("fitness"): return "figure.run"
        case let t where t.contains("weather"): return "cloud.sun.fill"
        case let t where t.contains("space"): return "sparkles"
        case let t where t.contains("ai"), let t where t.contains("artificial"): return "cpu"
        default: return "newspaper.fill"
        }
    }
}

#Preview {
    TopicFeedView()
        .environmentObject(NewsVM())
        .environmentObject(AuthVM())
}
