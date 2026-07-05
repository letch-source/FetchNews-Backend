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
    @State private var showAIAssistant = false
    @State private var wasPlayingBeforeAssistant = false
    @State private var discoveryTopicIndex: Int = 0
    @State private var predefinedTopics: [TopicCategory] = []
    @State private var isLoadingPredefinedTopics = false
    @State private var isNavigatingForward: Bool = true
    @State private var isDiscoveryNavigatingForward: Bool = true
    @State private var welcomeSection: TopicSection? = nil
    @State private var isLoadingWelcome = false
    
    // Get topic sections from combined summary (My Topics + Recommended)
    private var myTopicSections: [TopicSection] {
        let sections = vm.combined?.topicSections ?? []
        
        print("📱 TopicFeedView: myTopicSections - sections count: \(sections.count)")
        if let combined = vm.combined {
            print("   Combined exists - topicSections: \(combined.topicSections?.count ?? 0)")
            if let topicSections = combined.topicSections {
                for (i, section) in topicSections.enumerated() {
                    let isSelected = vm.selectedTopics.contains(section.topic.lowercased())
                    print("   Section \(i): \(section.topic) - \(isSelected ? "MY TOPIC" : "RECOMMENDED")")
                    print("     Has audioUrl: \(section.audioUrl != nil)")
                    if let url = section.audioUrl {
                        print("     URL: \(url)")
                    }
                }
            }
        }
        
        // FALLBACK: If we have a combined summary but no topic sections, create a single section
        // This happens with historical summaries from before per-topic feature
        if sections.isEmpty, let combined = vm.combined {
            print("📱 Creating fallback topic section for legacy summary (no per-topic data)")
            print("   Legacy audioUrl: \(combined.audioUrl ?? "nil")")
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
    
    // Split topics into My Topics and Recommended
    private var selectedTopicSections: [TopicSection] {
        myTopicSections.filter { vm.selectedTopics.contains($0.topic.lowercased()) }
    }
    
    private var recommendedTopicSections: [TopicSection] {
        myTopicSections.filter { !vm.selectedTopics.contains($0.topic.lowercased()) }
    }
    
    private var allTopics: [TopicSection] {
        // Insert welcome section at the beginning if it exists
        if let welcome = welcomeSection {
            return [welcome] + selectedTopicSections + recommendedTopicSections
        } else {
            return selectedTopicSections + recommendedTopicSections
        }
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
            isNavigatingForward = newValue > oldValue
            handlePageChange(from: oldValue, to: newValue)
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
        .task(id: "loadInitialData") {
            await loadInitialData()
        }
        .onChange(of: vm.combined?.id) { _, _ in
            Task {
                await checkIfSaved()
                // Reset to first page when new summary loads
                isNavigatingForward = true
                currentPageIndex = 0
            }
        }
        .onChange(of: vm.shouldAutoScroll) { _, shouldScroll in
            if shouldScroll {
                // Auto-advance to next topic when audio finishes
                advanceToNextTopic()
                // Reset the flag
                vm.shouldAutoScroll = false
            }
        }
    }
    
    @ViewBuilder
    private var mainContentView: some View {
        if vm.isBusy || vm.phase != .idle {
            loadingStateView
        } else if !allTopics.isEmpty {
            // Main feed with simple page navigation (shows user topics + recommended topics)
            let _ = print("📱 Showing feed with \(selectedTopicSections.count) my topics + \(recommendedTopicSections.count) recommended topics")
            
            ZStack {
                // Current page
                ZStack {
                    if let currentTopic = allTopics[safe: currentPageIndex] {
                        // Show welcome page if this is the first item and it's the welcome section
                        if currentPageIndex == 0 && currentTopic.topic == "Welcome" {
                            WelcomePageView(
                                welcomeSection: currentTopic,
                                onSwipeNext: {
                                    if currentPageIndex < allTopics.count - 1 {
                                        withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                                            isNavigatingForward = true
                                            currentPageIndex += 1
                                        }
                                    }
                                }
                            )
                            .id(currentTopic.id)
                            .transition(.asymmetric(
                                insertion: .move(edge: isNavigatingForward ? .bottom : .top),
                                removal: .move(edge: isNavigatingForward ? .top : .bottom)
                            ))
                        } else {
                            VerticalTopicPageView(
                                topicSection: currentTopic,
                                topicIndex: currentPageIndex,
                                totalTopics: allTopics.count,
                                isMyTopic: vm.selectedTopics.contains(currentTopic.topic.lowercased()),
                                isSaved: isSaved,
                                isSaving: isSaving,
                                onArticlesButtonTap: {
                                    showingArticles = currentTopic
                                },
                                onSwipeNext: {
                                    if currentPageIndex < allTopics.count - 1 {
                                        withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                                            isNavigatingForward = true
                                            currentPageIndex += 1
                                        }
                                    }
                                },
                                onSwipePrevious: {
                                    if currentPageIndex > 0 {
                                        withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                                            isNavigatingForward = false
                                            currentPageIndex -= 1
                                        }
                                    }
                                },
                                onToggleSave: {
                                    toggleSave()
                                },
                                onAddTopic: {
                                    addRecommendedTopicToSelected(currentTopic.topic)
                                },
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
                            .id(currentTopic.id)
                            .transition(.asymmetric(
                                insertion: .move(edge: isNavigatingForward ? .bottom : .top),
                                removal: .move(edge: isNavigatingForward ? .top : .bottom)
                            ))
                        }
                    }
                }
                .ignoresSafeArea()
                .onReceive(NotificationCenter.default.publisher(for: .AVPlayerItemDidPlayToEndTime)) { _ in
                    // Auto-advance to next topic when audio finishes
                    autoAdvanceToNextTopic()
                }
                
                // Static gradients (don't move with page transitions)
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
                    .frame(height: 120)
                    .allowsHitTesting(false)
                    
                    Spacer()
                }
                .ignoresSafeArea(edges: .top)
                
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
                    
                    // Audio player is shown in ContentView as floating overlay
                    // (removed duplicate in-page audio player)
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
        let _ = print("📱 Empty state - Loading: predefined=\(isLoadingPredefinedTopics)")
        let _ = print("   Unselected topics count: \(unselectedTopics.count)")
        let _ = print("   Custom topics count: \(vm.customTopics.count)")
        if isLoadingPredefinedTopics {
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
                ZStack {
                    if discoveryTopicIndex < discoveryTopicsList.count {
                        let item = discoveryTopicsList[discoveryTopicIndex]
                        TopicDiscoveryCard(
                            topic: item.topic,
                            onAdd: {
                                addTopic(item.topic, at: item.index)
                            }
                        )
                        .id(item.topic)
                        .transition(.asymmetric(
                            insertion: .move(edge: isDiscoveryNavigatingForward ? .bottom : .top),
                            removal: .move(edge: isDiscoveryNavigatingForward ? .top : .bottom)
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
                                                    isDiscoveryNavigatingForward = false
                                                    discoveryTopicIndex -= 1
                                                }
                                            }
                                        } else {
                                            // Swiped up -> go to next page
                                            if discoveryTopicIndex < discoveryTopicsList.count - 1 {
                                                withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                                                    isDiscoveryNavigatingForward = true
                                                    discoveryTopicIndex += 1
                                                }
                                            }
                                        }
                                    }
                                }
                        )
                    }
                }
                
                // Static gradients (don't move with card transitions)
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
                    .frame(height: 120)
                    .allowsHitTesting(false)
                    
                    Spacer()
                }
                .ignoresSafeArea(edges: .top)
                
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
            
            Text("You've selected topics. Go to the topic selection screen to fetch news!")
                .font(.body)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
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
        print("📱 TopicFeedView: Loading initial data...")
        print("   Current state: myTopics=\(myTopicSections.count), recommended=\(recommendedTopicSections.count)")
        print("   Combined summary: \(vm.combined != nil ? "exists" : "nil")")
        print("   Authentication: \(ApiClient.isAuthenticated ? "YES" : "NO")")
        print("   User: \(authVM.currentUser?.email ?? "none")")
        
        // Load welcome message first
        await loadWelcomeMessage()
        
        await checkIfSaved()
        await loadPredefinedTopicsForDiscovery()
        print("📱 TopicFeedView: Initial data load complete")
        print("   Final state: welcome=\(welcomeSection != nil ? "YES" : "NO"), myTopics=\(selectedTopicSections.count), recommended=\(recommendedTopicSections.count), discovery=\(unselectedTopics.count)")
        
        // Ensure first topic's audio is loaded and ready to play
        await MainActor.run {
            print("📱 Attempting to load first topic's audio...")
            print("   vm.combined: \(vm.combined != nil ? "exists" : "nil")")
            print("   vm.canPlay: \(vm.canPlay)")
            print("   allTopics.count: \(allTopics.count)")
            
            if let firstTopic = allTopics.first {
                print("   First topic: \(firstTopic.topic)")
                print("   Has audioUrl: \(firstTopic.audioUrl != nil)")
                if let url = firstTopic.audioUrl {
                    print("   Audio URL: \(url)")
                }
                vm.switchToTopicAudio(for: firstTopic, autoPlay: false)
                
                // Check state after switch
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                    print("📱 After switchToTopicAudio:")
                    print("   vm.canPlay: \(vm.canPlay)")
                    print("   vm.currentTopicAudioUrl: \(vm.currentTopicAudioUrl ?? "nil")")
                }
            } else {
                print("   ⚠️ No topics available!")
            }
        }
    }
    
    private func loadWelcomeMessage() async {
        // Only load welcome if we have topics to show
        guard !myTopicSections.isEmpty else {
            print("📱 Skipping welcome message - no topics to show")
            return
        }
        
        print("📱 Loading welcome message...")
        await MainActor.run {
            isLoadingWelcome = true
        }
        
        do {
            let welcome = try await ApiClient.getWelcomeMessage()
            await MainActor.run {
                self.welcomeSection = welcome
                self.isLoadingWelcome = false
                print("✅ Welcome message loaded: \"\(welcome.summary)\"")
            }
        } catch {
            await MainActor.run {
                self.isLoadingWelcome = false
            }
            // Log error but don't fail - welcome is optional
            print("⚠️ Failed to load welcome message (continuing without it): \(error)")
        }
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
        // Recommended topics are now included in the batch fetch
        // No need to load more dynamically
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
        print("   Current audio state - isPlaying: \(vm.isPlaying), canPlay: \(vm.canPlay)")
        print("   Current time: \(vm.currentTime), duration: \(vm.duration)")
        
        vm.currentTopicIndex = newIndex

        // Switch audio to new topic and auto-play (only for topics with audio)
        if let topicSection = allTopics[safe: newIndex] {
            // Auto-play any topic that has audio (both selected and recommended topics now have audio)
            if topicSection.audioUrl != nil {
                print("   🎵 Will switch to audio for topic: \(topicSection.topic)")
                print("   Audio URL: \(topicSection.audioUrl ?? "nil")")
                
                // Call immediately without delay - the switchToTopicAudio function handles timing
                vm.switchToTopicAudio(for: topicSection, autoPlay: true)
            } else {
                print("   ⚠️ Topic has no audio: \(topicSection.topic)")
            }
        }
        
        // Recommended topics are now included in the batch fetch,
        // so no need to load them separately
    }
    
    private func autoAdvanceToNextTopic() {
        // Only auto-advance if we're not on the last topic
        guard currentPageIndex < allTopics.count - 1 else {
            print("📄 Reached last topic, not auto-advancing")
            return
        }
        
        print("📄 Audio finished, auto-advancing to next topic...")
        withAnimation {
            isNavigatingForward = true
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
                    isDiscoveryNavigatingForward = true
                    discoveryTopicIndex = index + 1
                }
            }
        }
    }
    
    private func addRecommendedTopicToSelected(_ topic: String) {
        Task {
            print("🌟 Adding recommended topic to selected: \(topic)")
            await vm.addCustomTopic(topic)
            
            // Show a brief success indicator (optional - the badge will change automatically)
            await MainActor.run {
                // Force view update to show the topic is now selected
                vm.objectWillChange.send()
            }
        }
    }
    
    private func advanceToNextTopic() {
        print("🎵 Auto-advancing to next topic")
        
        // Check if there's a next topic
        guard currentPageIndex < allTopics.count - 1 else {
            print("   ⚠️ Already at last topic, not advancing")
            return
        }
        
        // Small delay to ensure audio player state has settled
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [self] in
            // Animate to next page
            withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                isNavigatingForward = true
                currentPageIndex += 1
            }
            
            print("   ✅ Advanced to topic \(currentPageIndex + 1)/\(allTopics.count)")
        }
    }
}

// MARK: - Vertical Topic Page View

struct VerticalTopicPageView: View {
    let topicSection: TopicSection
    let topicIndex: Int
    let totalTopics: Int
    let isMyTopic: Bool
    let isSaved: Bool
    let isSaving: Bool
    let onArticlesButtonTap: () -> Void
    let onSwipeNext: () -> Void
    let onSwipePrevious: () -> Void
    let onToggleSave: () -> Void
    let onAddTopic: () -> Void
    var onAIAssistant: (() -> Void)? = nil

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
                        .padding(.bottom, 16)
                        
                        // Action buttons (Add Topic for recommended, Save Summary for all)
                        HStack(spacing: 12) {
                            // Add to Topics button - only for recommended topics
                            if !isMyTopic {
                                Button(action: onAddTopic) {
                                    HStack(spacing: 6) {
                                        Image(systemName: "plus.circle.fill")
                                            .font(.system(size: 18, weight: .semibold))
                                        Text("Add Topic")
                                            .font(.system(size: 15, weight: .semibold))
                                    }
                                    .foregroundColor(.white)
                                    .padding(.horizontal, 16)
                                    .padding(.vertical, 12)
                                    .background(Color.purple)
                                    .clipShape(Capsule())
                                    .shadow(color: Color.purple.opacity(0.3), radius: 4, x: 0, y: 2)
                                }
                            }
                            
                            Spacer()
                            
                            // Save Summary button
                            if vm.combined != nil {
                                Button(action: onToggleSave) {
                                    HStack(spacing: 6) {
                                        Image(systemName: isSaved ? "bookmark.fill" : "bookmark")
                                            .font(.system(size: 18, weight: .semibold))
                                        Text(isSaved ? "Saved" : "Save")
                                            .font(.system(size: 15, weight: .semibold))
                                    }
                                    .foregroundColor(isSaved ? .yellow : .white)
                                    .padding(.horizontal, 16)
                                    .padding(.vertical, 12)
                                    .background(isSaved ? Color(.systemGray5) : Color.blue)
                                    .clipShape(Capsule())
                                    .shadow(color: (isSaved ? Color.gray : Color.blue).opacity(0.3), radius: 4, x: 0, y: 2)
                                }
                                .disabled(isSaving)
                                .opacity(isSaving ? 0.6 : 1.0)
                            }
                        }
                        .padding(.horizontal, 20)
                        .padding(.bottom, 24)
                        
                        // Show full topic content (summary + articles)
                        fullTopicContent
                        
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
                    withAnimation(.easeInOut(duration: 0.2)) {
                        showStickyHeader = value < -20
                        // More lenient threshold - allow navigation when near the top
                        isAtTop = value > -100
                    }
                }
                .onPreferenceChange(BottomReachedPreferenceKey.self) { value in
                    isAtBottom = value
                }
                .simultaneousGesture(
                    DragGesture(minimumDistance: 100)
                        .onEnded { value in
                            let verticalMovement = value.translation.height
                            let horizontalMovement = abs(value.translation.width)
                            
                            // Only respond to strong vertical swipes
                            if abs(verticalMovement) > 100 && abs(verticalMovement) > horizontalMovement * 2 {
                                if verticalMovement > 0 && isAtTop {
                                    onSwipePrevious()
                                } else if verticalMovement < 0 && isAtBottom {
                                    onSwipeNext()
                                }
                            }
                        }
                )
                
                // Sticky header overlay
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
    }
    
    // Full topic content view (summary + articles)
    @ViewBuilder
    private var fullTopicContent: some View {
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
                        
                        // AI Assistant button
                        if vm.combined != nil {
                            Button(action: {
                                // Show AI assistant for this topic's summary
                                // The parent view will handle the sheet presentation
                                if let onAIAction = onAIAssistant {
                                    onAIAction()
                                }
                            }) {
                                HStack {
                                    Image(systemName: "bubble.left.and.bubble.right.fill")
                                        .font(.system(size: 18, weight: .semibold))
                                    Text("Ask AI About This Topic")
                                        .fontWeight(.semibold)
                                    Spacer()
                                    Image(systemName: "sparkles")
                                        .font(.system(size: 14, weight: .semibold))
                                }
                                .foregroundColor(.white)
                                .padding()
                                .background(
                                    LinearGradient(
                                        gradient: Gradient(colors: [Color.purple, Color.blue]),
                                        startPoint: .leading,
                                        endPoint: .trailing
                                    )
                                )
                                .cornerRadius(12)
                            }
                            .padding(.horizontal, 20)
                            .padding(.top, 32)
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
                            .padding(.top, 16)
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
        // PRIMARY: Reset scrubbing when view model explicitly signals
        .onChange(of: vm.forceProgressBarReset) { _, _ in
            print("🎵 [TopicFeedView] ⚡️ FORCE RESET signal received")
            print("   Current state - isScrubbing: \(isScrubbing), scrubValue: \(scrubValue)")
            print("   VM state - currentTime: \(vm.currentTime), duration: \(vm.duration)")
            isScrubbing = false
            scrubValue = 0
            print("   ✅ Reset complete - isScrubbing: \(isScrubbing), scrubValue: \(scrubValue)")
        }
        // BACKUP: Reset scrubbing state when audio URL changes
        .onChange(of: vm.currentTopicAudioUrl) { _, newURL in
            print("🎵 [TopicFeedView] Audio URL changed to: \(newURL ?? "nil")")
            if !isScrubbing {  // Only log if not already handled by force reset
                print("   Resetting scrubbing state")
                isScrubbing = false
                scrubValue = 0
            }
        }
        // BACKUP: Reset when player is being prepared
        .onChange(of: vm.canPlay) { oldValue, newValue in
            if oldValue == true && newValue == false && !isScrubbing {
                print("🎵 [TopicFeedView] canPlay went false (preparing new audio)")
                print("   Resetting scrubbing state")
                isScrubbing = false
                scrubValue = 0
            }
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

// MARK: - Welcome Page View

struct WelcomePageView: View {
    let welcomeSection: TopicSection
    let onSwipeNext: () -> Void
    
    @EnvironmentObject var vm: NewsVM
    @State private var isAtBottom: Bool = false
    
    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .top) {
                // Background gradient
                LinearGradient(
                    colors: [
                        Color.blue.opacity(0.2),
                        Color.purple.opacity(0.2),
                        Color.darkGreyBackground
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .ignoresSafeArea()
                
                // Main content
                ScrollView(.vertical, showsIndicators: false) {
                    VStack(spacing: 0) {
                        // Top padding
                        Color.clear.frame(height: 120)
                        
                        // Welcome icon
                        Image(systemName: "waveform.circle.fill")
                            .font(.system(size: 80))
                            .foregroundStyle(
                                LinearGradient(
                                    colors: [.blue, .purple],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .shadow(color: Color.blue.opacity(0.3), radius: 20)
                            .padding(.bottom, 32)
                        
                        // Welcome message
                        Text(welcomeSection.summary)
                            .font(.system(size: 32, weight: .bold))
                            .foregroundColor(.primary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 32)
                            .padding(.bottom, 48)
                        
                        // Swipe hint
                        VStack(spacing: 12) {
                            Image(systemName: "chevron.up")
                                .font(.title2)
                                .foregroundColor(.secondary)
                                .opacity(0.6)
                            Text("Swipe up to start")
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                        }
                        .padding(.bottom, 40)
                        
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
                .onPreferenceChange(BottomReachedPreferenceKey.self) { value in
                    isAtBottom = value
                }
                .simultaneousGesture(
                    DragGesture(minimumDistance: 100)
                        .onEnded { value in
                            let verticalMovement = value.translation.height
                            let horizontalMovement = abs(value.translation.width)
                            
                            // Only respond to strong vertical swipes up
                            if verticalMovement < -100 && abs(verticalMovement) > horizontalMovement * 2 {
                                onSwipeNext()
                            }
                        }
                )
            }
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
