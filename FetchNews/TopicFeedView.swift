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
    
    // Get topic sections from combined summary (My Topics)
    private var myTopicSections: [TopicSection] {
        vm.combined?.topicSections ?? []
    }
    
    private var allTopics: [TopicSection] {
        myTopicSections + recommendedTopics
    }
    
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                Color.darkGreyBackground
                    .ignoresSafeArea()
                
                if vm.isBusy || vm.phase != .idle {
                    // Show loading state
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
                    // Empty state - no fetch available
                    VStack(spacing: 24) {
                        Image(systemName: "newspaper")
                            .font(.system(size: 60))
                            .foregroundColor(.secondary)
                        
                        Text("No News Yet")
                            .font(.title2)
                            .fontWeight(.semibold)
                            .foregroundColor(.primary)
                        
                        Text("Your feed will update automatically at 6am and 6pm daily with news from your selected topics.")
                            .font(.body)
                            .foregroundColor(.secondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 40)
                        
                        // Next update time indicator
                        VStack(spacing: 8) {
                            HStack(spacing: 8) {
                                Image(systemName: "clock.badge.checkmark")
                                    .foregroundColor(.blue)
                                Text("Next update:")
                                    .font(.subheadline)
                                    .foregroundColor(.secondary)
                                Text(nextUpdateTime())
                                    .font(.subheadline)
                                    .fontWeight(.semibold)
                                    .foregroundColor(.blue)
                            }
                        }
                        .padding()
                        .background(Color(.systemGray6))
                        .cornerRadius(12)
                        .padding(.horizontal, 40)
                    }
                }
            }
        }
        .sheet(item: $showingArticles) { topic in
            ArticlesSheetView(topicSection: topic)
                .environmentObject(vm)
        }
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
        .task {
            // Check if current summary is saved
            await checkIfSaved()
            // Load recommended topics
            await loadRecommendedTopics()
        }
        .onChange(of: vm.combined?.id) { _, _ in
            // Check save status when summary changes
            Task {
                await checkIfSaved()
            }
        }
        .onChange(of: currentPageIndex) { oldValue, newValue in
            // Load recommended topics when user reaches the last "My Topic"
            if newValue >= myTopicSections.count - 1 && recommendedTopics.isEmpty && !isLoadingRecommended {
                Task {
                    await loadRecommendedTopics()
                }
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

#Preview {
    TopicFeedView()
        .environmentObject(NewsVM())
        .environmentObject(AuthVM())
}
