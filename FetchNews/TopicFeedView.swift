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
    @State private var discoveryTopicIndex: Int = 0
    @State private var predefinedTopics: [TopicCategory] = []
    @State private var isLoadingPredefinedTopics = false
    
    // Get topic sections from combined summary (My Topics)
    private var myTopicSections: [TopicSection] {
        let sections = vm.combined?.topicSections ?? []
        
        print("📱 TopicFeedView: myTopicSections - sections count: \(sections.count)")
        if let combined = vm.combined {
            print("   Combined exists - topicSections: \(combined.topicSections?.count ?? 0)")
        }
        
        // FALLBACK: If we have a combined summary but no topic sections, create a single section
        // This happens with historical summaries from before per-topic feature
        if sections.isEmpty, let combined = vm.combined {
            print("📱 Creating fallback topic section for legacy summary (no per-topic data)")
            return [TopicSection(
                id: combined.id,
                topic: "Your News",
                summary: combined.summary,
                articles: [],
                audioUrl: combined.audioUrl
            )]
        }
        
        print("📱 Returning \(sections.count) topic sections")
        return sections
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
        .onChange(of: currentPageIndex) { oldValue, newValue in
            handlePageChange(from: oldValue, to: newValue)
        }
        .sheet(item: $showingArticles) { topic in
            ArticlesSheetView(topicSection: topic)
                .environmentObject(vm)
        }
        .task(id: "loadInitialData") {
            await loadInitialData()
        }
        .onChange(of: vm.combined?.id) { _, _ in
            Task {
                await checkIfSaved()
                // Reload recommended topics if summary changed
                if myTopicSections.isEmpty {
                    await loadRecommendedTopics()
                }
                // Reset to first page when new summary loads
                currentPageIndex = 0
            }
        }
    }
    
    @ViewBuilder
    private var mainContentView: some View {
        if vm.isBusy || vm.phase != .idle {
            loadingStateView
        } else if !allTopics.isEmpty {
            // Main feed with simple page navigation (shows user topics + recommended topics)
            let _ = print("📱 Showing feed with \(myTopicSections.count) my topics + \(recommendedTopics.count) recommended topics")
            
            ZStack {
                // Current page
                if let currentTopic = allTopics[safe: currentPageIndex] {
                    VerticalTopicPageView(
                        topicSection: currentTopic,
                        topicIndex: currentPageIndex,
                        totalTopics: allTopics.count,
                        isMyTopic: currentPageIndex < myTopicSections.count,
                        onArticlesButtonTap: {
                            showingArticles = currentTopic
                        },
                        onSwipeNext: {
                            if currentPageIndex < allTopics.count - 1 {
                                withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                                    currentPageIndex += 1
                                }
                            }
                        },
                        onSwipePrevious: {
                            if currentPageIndex > 0 {
                                withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                                    currentPageIndex -= 1
                                }
                            }
                        }
                    )
                    .id(currentTopic.id)
                    .transition(.asymmetric(
                        insertion: .move(edge: .bottom),
                        removal: .move(edge: .top)
                    ))
                }
            }
            .ignoresSafeArea()
            .onReceive(NotificationCenter.default.publisher(for: .AVPlayerItemDidPlayToEndTime)) { _ in
                // Auto-advance to next topic when audio finishes
                autoAdvanceToNextTopic()
            }
                    
                    // Page indicator (right side for vertical scrolling)
                    HStack {
                        Spacer()
                        VStack(spacing: 12) {
                            Spacer()
                            
                            // Visual dots
                            VStack(spacing: 6) {
                                ForEach(0..<min(allTopics.count, 5), id: \.self) { index in
                                    Circle()
                                        .fill(index == currentPageIndex ? Color.white : Color.white.opacity(0.3))
                                        .frame(width: index == currentPageIndex ? 8 : 6, 
                                               height: index == currentPageIndex ? 8 : 6)
                                }
                                if allTopics.count > 5 {
                                    Text("⋮")
                                        .foregroundColor(.white.opacity(0.6))
                                        .font(.caption)
                                }
                            }
                            
                            // Topic label
                            VStack(spacing: 2) {
                                Text("\(currentPageIndex + 1)/\(allTopics.count)")
                                    .font(.caption2)
                                    .fontWeight(.medium)
                                    .foregroundColor(.white)
                            }
                            
                            Spacer()
                        }
                        .padding(.trailing, 16)
                        .padding(.bottom, vm.canPlay ? 100 : 20)
                    }
                    
                    // Compact audio player at bottom
                    if vm.canPlay {
                        VStack {
                            Spacer()
                            CompactTopicAudioPlayer(
                                topicSection: allTopics[safe: currentPageIndex]
                            )
                            .padding(.bottom, 80)
                        }
                    }
                    
                    // Top buttons
                    VStack {
                        HStack {
                            // Fetch button - top left corner (for testing)
                            Button(action: fetchAllNews) {
                                HStack(spacing: 6) {
                                    Image(systemName: vm.isBusy ? "arrow.clockwise" : "arrow.down.circle.fill")
                                        .font(.system(size: 20, weight: .semibold))
                                        .rotationEffect(vm.isBusy ? .degrees(360) : .degrees(0))
                                        .animation(vm.isBusy ? Animation.linear(duration: 1).repeatForever(autoreverses: false) : .default, value: vm.isBusy)
                                    Text("Fetch")
                                        .font(.system(size: 15, weight: .semibold))
                                }
                                .foregroundColor(.white)
                                .padding(.horizontal, 16)
                                .padding(.vertical, 10)
                                .background(Color.blue.opacity(0.8))
                                .clipShape(Capsule())
                                .overlay(
                                    Capsule()
                                        .stroke(Color.white.opacity(0.3), lineWidth: 1)
                                )
                            }
                            .disabled(vm.isBusy)
                            .padding(.top, 60)
                            .padding(.leading, 20)
                            
                            Spacer()
                            
                            // Save button - top right corner
                            if vm.combined != nil {
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
                        }
                        Spacer()
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
        let _ = print("📱 Empty state - Loading: predefined=\(isLoadingPredefinedTopics), recommended=\(isLoadingRecommended)")
        let _ = print("   Unselected topics count: \(unselectedTopics.count)")
        let _ = print("   Custom topics count: \(vm.customTopics.count)")
        if isLoadingPredefinedTopics || isLoadingRecommended {
            VStack(spacing: 24) {
                ProgressView()
                Text("Loading topics...")
                    .foregroundColor(.secondary)
            }
        } else if !unselectedTopics.isEmpty {
            // Topic discovery feed with button navigation
            let _ = print("📱 Showing topic discovery with \(unselectedTopics.count) topics")
            
            ZStack {
                // Current discovery card
                if discoveryTopicIndex < discoveryTopicsList.count {
                    let item = discoveryTopicsList[discoveryTopicIndex]
                    TopicDiscoveryCard(
                        topic: item.topic,
                        onAdd: {
                            addTopic(item.topic, at: item.index)
                        },
                        onFetchAll: fetchAllNews,
                        hasSelectedTopics: !vm.customTopics.isEmpty
                    )
                    .id(item.topic)
                    .transition(.asymmetric(
                        insertion: .move(edge: .bottom),
                        removal: .move(edge: .top)
                    ))
                    .simultaneousGesture(
                        DragGesture(minimumDistance: 100)
                            .onEnded { value in
                                let verticalMovement = value.translation.height
                                let horizontalMovement = abs(value.translation.width)
                                
                                // Only respond to primarily vertical swipes
                                if abs(verticalMovement) > horizontalMovement * 2 {
                                    if verticalMovement > 0 {
                                        // Swiped down -> go to previous page
                                        if discoveryTopicIndex > 0 {
                                            withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                                                discoveryTopicIndex -= 1
                                            }
                                        }
                                    } else {
                                        // Swiped up -> go to next page
                                        if discoveryTopicIndex < discoveryTopicsList.count - 1 {
                                            withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                                                discoveryTopicIndex += 1
                                            }
                                        }
                                    }
                                }
                            }
                    )
                }
                
                // Top gradient fade (for status bar)
                VStack {
                    LinearGradient(
                        gradient: Gradient(stops: [
                            .init(color: Color(.systemBackground), location: 0.0),
                            .init(color: Color(.systemBackground).opacity(0.5), location: 0.4),
                            .init(color: Color(.systemBackground).opacity(0.0), location: 1.0)
                        ]),
                        startPoint: .top,
                        endPoint: .bottom
                    )
                    .frame(height: 80)
                    .allowsHitTesting(false)
                    
                    Spacer()
                }
                
                // Bottom gradient fade (for nav bar and buttons)
                VStack {
                    Spacer()
                    
                    LinearGradient(
                        gradient: Gradient(stops: [
                            .init(color: Color(.systemBackground).opacity(0.0), location: 0.0),
                            .init(color: Color(.systemBackground).opacity(0.5), location: 0.5),
                            .init(color: Color(.systemBackground), location: 1.0)
                        ]),
                        startPoint: .top,
                        endPoint: .bottom
                    )
                    .frame(height: 200)
                    .allowsHitTesting(false)
                }
                
                // Page indicator
                discoveryPageIndicator
            }
            .ignoresSafeArea()
        } else {
            // Final fallback if no topics available
            VStack(spacing: 24) {
                Image(systemName: "exclamationmark.triangle")
                    .font(.system(size: 60))
                    .foregroundColor(.orange)
                
                Text("No Topics Available")
                    .font(.title2)
                    .fontWeight(.semibold)
                
                Text("We couldn't load any topics to show you. Please check your internet connection and try again.")
                    .font(.body)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 40)
                
                Button(action: {
                    Task {
                        await loadInitialData()
                    }
                }) {
                    HStack(spacing: 12) {
                        Image(systemName: "arrow.clockwise")
                        Text("Retry")
                            .fontWeight(.semibold)
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, 32)
                    .padding(.vertical, 16)
                    .background(Color.blue)
                    .cornerRadius(12)
                }
            }
            .padding()
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
            
            Button(action: fetchAllNews) {
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
    
    private func fetchAllNews() {
        Task {
            await vm.fetch()
        }
    }
    
    // MARK: - Helper Functions
    
    private func loadInitialData() async {
        print("📱 TopicFeedView: Loading initial data...")
        print("   Current state: myTopics=\(myTopicSections.count), recommended=\(recommendedTopics.count)")
        print("   Combined summary: \(vm.combined != nil ? "exists" : "nil")")
        print("   Authentication: \(ApiClient.isAuthenticated ? "YES" : "NO")")
        print("   User: \(authVM.currentUser?.email ?? "none")")
        await checkIfSaved()
        await loadRecommendedTopics()
        await loadPredefinedTopicsForDiscovery()
        print("📱 TopicFeedView: Initial data load complete")
        print("   Final state: myTopics=\(myTopicSections.count), recommended=\(recommendedTopics.count), discovery=\(unselectedTopics.count)")
        
        // Ensure first topic's audio is loaded and ready to play
        await MainActor.run {
            if let firstTopic = allTopics.first {
                vm.switchToTopicAudio(for: firstTopic, autoPlay: false)
            }
        }
    }
    
    private func handlePageChangeIfNeeded(from oldValue: Int, to newValue: Int) {
        // Load more recommended topics if user is nearing the end
        let totalTopics = allTopics.count
        if newValue >= totalTopics - 2 && !isLoadingRecommended {
            // User is near the end, could load more recommended topics here if needed
            // For now, recommended topics are loaded once on app launch
        }
    }
    
    private func loadRecommendedTopics() async {
        // Load recommended topics to show on homepage
        // Don't guard on myTopicSections - we want to show recommended even if user hasn't fetched their own
        guard recommendedTopics.isEmpty else { 
            print("📱 Skipping recommended topics load - already have \(recommendedTopics.count) topics")
            return 
        }
        guard !isLoadingRecommended else { 
            print("📱 Skipping recommended topics load - already loading")
            return 
        }
        
        print("📱 Loading recommended topics...")
        await MainActor.run {
            isLoadingRecommended = true
        }
        
        do {
            // Add a small delay to ensure view is stable before making request
            try? await Task.sleep(nanoseconds: 100_000_000) // 0.1 seconds
            
            let recommended = try await ApiClient.getRecommendedTopics()
            await MainActor.run {
                self.recommendedTopics = recommended
                self.isLoadingRecommended = false
                print("✅ Loaded \(recommended.count) recommended topics")
                if recommended.isEmpty {
                    print("⚠️ Warning: Recommended topics array is empty - backend may need data")
                }
            }
        } catch {
            await MainActor.run {
                self.isLoadingRecommended = false
            }
            // Only log non-cancellation errors
            if (error as NSError).code != NSURLErrorCancelled {
                print("❌ Failed to load recommended topics: \(error)")
                if let networkError = error as? NetworkError {
                    print("   Network error details: \(networkError)")
                }
            } else {
                print("⚠️ Recommended topics request was cancelled (view may have updated)")
            }
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
        
        // Switch audio to new topic and auto-play
        if let topicSection = allTopics[safe: newIndex] {
            vm.switchToTopicAudio(for: topicSection, autoPlay: true) // Auto-play when switching topics
        }
    }
    
    private func autoAdvanceToNextTopic() {
        // Only auto-advance if we're not on the last topic
        guard currentPageIndex < allTopics.count - 1 else {
            print("📄 Reached last topic, not auto-advancing")
            return
        }
        
        print("📄 Audio finished, auto-advancing to next topic...")
        withAnimation {
            currentPageIndex += 1
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
        guard predefinedTopics.isEmpty else { 
            print("📱 Skipping predefined topics load - already have \(predefinedTopics.count) categories")
            return 
        }
        
        print("📱 Loading predefined topics for discovery...")
        await MainActor.run {
            isLoadingPredefinedTopics = true
        }
        
        do {
            // Add a small delay to ensure view is stable before making request
            try? await Task.sleep(nanoseconds: 150_000_000) // 0.15 seconds
            
            let response = try await ApiClient.getPredefinedTopics()
            await MainActor.run {
                self.predefinedTopics = response.categories
                self.isLoadingPredefinedTopics = false
                print("✅ Loaded \(response.categories.count) predefined topic categories")
                let totalTopics = response.categories.flatMap { $0.topics }.count
                print("   Total topics available: \(totalTopics)")
            }
        } catch {
            await MainActor.run {
                self.isLoadingPredefinedTopics = false
            }
            // Only log non-cancellation errors
            if (error as NSError).code != NSURLErrorCancelled {
                print("❌ Failed to load predefined topics: \(error)")
                if let networkError = error as? NetworkError {
                    print("   Network error details: \(networkError)")
                }
            } else {
                print("⚠️ Predefined topics request was cancelled (view may have updated)")
            }
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
    let onSwipeNext: () -> Void
    let onSwipePrevious: () -> Void

    @EnvironmentObject var vm: NewsVM
    @State private var scrollOffset: CGFloat = 0
    @State private var showStickyHeader: Bool = false
    @State private var isAtBottom: Bool = false
    @State private var isAtTop: Bool = true

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
                        
                        // Bottom detector
                        GeometryReader { geo in
                            Color.clear.preference(
                                key: BottomReachedPreferenceKey.self,
                                value: geo.frame(in: .named("scroll")).maxY < geometry.size.height + 100
                            )
                        }
                        .frame(height: 1)
                    }
                }
                .coordinateSpace(name: "scroll")
                .onPreferenceChange(ScrollOffsetPreferenceKey.self) { value in
                    scrollOffset = value
                    // Show sticky header when scrolled down
                    withAnimation(.easeInOut(duration: 0.2)) {
                        showStickyHeader = value < -20
                    }
                    // Check if at top (within 50 points)
                    isAtTop = value > -50
                }
                .onPreferenceChange(BottomReachedPreferenceKey.self) { value in
                    isAtBottom = value
                }
                .simultaneousGesture(
                    DragGesture(minimumDistance: 100)
                        .onEnded { value in
                            let verticalMovement = value.translation.height
                            let horizontalMovement = abs(value.translation.width)
                            
                            // Only respond to strong vertical swipes (not horizontal or small movements)
                            if abs(verticalMovement) > 100 && abs(verticalMovement) > horizontalMovement * 2 {
                                if verticalMovement > 0 {
                                    // Swiped down -> go to previous page (only if at top)
                                    if isAtTop {
                                        onSwipePrevious()
                                    }
                                } else {
                                    // Swiped up -> go to next page (only if at bottom)
                                    if isAtBottom {
                                        onSwipeNext()
                                    }
                                }
                            }
                        }
                )
                
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
                
                // Top gradient fade (for status bar)
                VStack {
                    LinearGradient(
                        gradient: Gradient(stops: [
                            .init(color: Color(.systemBackground), location: 0.0),
                            .init(color: Color(.systemBackground).opacity(0.5), location: 0.4),
                            .init(color: Color(.systemBackground).opacity(0.0), location: 1.0)
                        ]),
                        startPoint: .top,
                        endPoint: .bottom
                    )
                    .frame(height: 80)
                    .allowsHitTesting(false)
                    
                    Spacer()
                }
                
                // Bottom gradient fade (for nav bar and buttons)
                VStack {
                    Spacer()
                    
                    LinearGradient(
                        gradient: Gradient(stops: [
                            .init(color: Color(.systemBackground).opacity(0.0), location: 0.0),
                            .init(color: Color(.systemBackground).opacity(0.5), location: 0.5),
                            .init(color: Color(.systemBackground), location: 1.0)
                        ]),
                        startPoint: .top,
                        endPoint: .bottom
                    )
                    .frame(height: 200)
                    .allowsHitTesting(false)
                }
            }
        }
        .onAppear {
            // Ensure audio is loaded for this topic when page appears
            // autoPlay is controlled by the page navigation
            if topicSection.audioUrl != nil {
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
                // Controls (no title - user knows what they're listening to from the page)
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
                    Text("Swipe up for more topics")
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

// MARK: - Preference Keys

struct BottomReachedPreferenceKey: PreferenceKey {
    static var defaultValue: Bool = false
    static func reduce(value: inout Bool, nextValue: () -> Bool) {
        value = nextValue()
    }
}

#Preview {
    TopicFeedView()
        .environmentObject(NewsVM())
        .environmentObject(AuthVM())
}
