//
//  NewsVM.swift
//  FetchNews
//
//  Created by Finlay Smith on 8/14/25.
//

import Foundation
import AVFoundation
import MediaPlayer
import UserNotifications
#if canImport(UIKit)
import UIKit
#endif

@MainActor
final class NewsVM: ObservableObject {
    enum Phase: String { case idle, gather, summarize, tts }
    enum FetchButtonState: String { case noSummary, fetching, hasSummary }

    // Selection & state
    @Published var selectedTopics: Set<String> = [] {
        didSet { debouncedSaveSettings() }
    }
    @Published var length: ApiClient.Length = .short {
        didSet { debouncedSaveSettings() }
    }
    @Published var phase: Phase = .idle
    @Published var isBusy: Bool = false
    @Published var isDirty: Bool = true
    
    // Fetch button state
    var fetchButtonState: FetchButtonState {
        if isBusy || phase != .idle {
            return .fetching
        } else if combined != nil {
            return .hasSummary
        } else {
            return .noSummary
        }
    }
    
    // Reference to AuthVM for checking user limits
    weak var authVM: AuthVM?
    
    // Custom topics (synced with backend)
    @Published var customTopics: [String] = []
    
    // Trending topics (fetched from backend)
    @Published var trendingTopics: [String] = []
    
    // Timer for automatic trending topics refresh
    private var trendingTopicsTimer: Timer?
    
    // Timer for periodic scheduled summary checking
    private var scheduledSummaryTimer: Timer?
    
    deinit {
        trendingTopicsTimer?.invalidate()
        scheduledSummaryTimer?.invalidate()
    }
    
    // Last fetched topics for "Fetch again" functionality
    @Published var lastFetchedTopics: Set<String> = [] {
        didSet { debouncedSaveSettings() }
    }
    
    // News sources (premium feature)
    @Published var excludedNewsSources: Set<String> = [] {
        didSet { debouncedSaveSettings() }
    }
    @Published var availableNewsSources: [NewsSource] = []
    @Published var newsSourcesByCategory: [String: [NewsSource]] = [:]
    
    // User location
    @Published var userLocation: String = ""
    
    // User country (for news filtering)
    @Published var selectedCountry: String = "us" {
        didSet { debouncedSaveSettings() }
    }
    
    // Subscription UI
    @Published var showingSubscriptionView: Bool = false
    
    // News sources settings UI
    @Published var showingNewsSourcesSettings: Bool = false
    
    // Scheduled summaries
    // scheduledSummaries should NOT trigger saveSettings - it's managed separately via /api/scheduled-summaries
    @Published var scheduledSummaries: [ScheduledSummary] = []
    @Published var showingScheduledSummariesSettings: Bool = false
    
    // Results
    @Published var combined: Combined?
    @Published var items: [Item] = []
    @Published var fetchCreatedAt: Date?
    @Published var shouldShowFetchScreen: Bool = false
    
    // Error handling
    @Published var lastError: String?

    // Audio
    private var player: AVPlayer?
    private var timeObserverToken: Any?
    private var endObserver: NSObjectProtocol?
    
    // Network
    private var currentTask: Task<Void, Never>?
    
    // Debouncing for settings save
    private var saveSettingsTask: Task<Void, Never>?

    @Published var canPlay: Bool = false
    @Published var isPlaying: Bool = false
    @Published var nowPlayingTitle: String = ""

    // Timing (for progress bar)
    @Published var currentTime: Double = 0     // seconds
    @Published var duration: Double = 0        // seconds
    
    // Topic feed coordination
    @Published var currentTopicIndex: Int = 0  // Current topic in feed
    @Published var shouldAutoScroll: Bool = false // Trigger for auto-scroll to next topic
    @Published var currentTopicAudioUrl: String? = nil // Current topic's audio URL
    private var topicAudioPlayers: [String: AVPlayer] = [:] // Cache of audio players per topic

    // Settings (with UserDefaults persistence)
    @Published var playbackRate: Double = 1.0 {
        didSet { debouncedSaveSettings() }
    }
    @Published var selectedVoice: String = "Alloy" {
        didSet { debouncedSaveSettings() }
    }
    @Published var upliftingNewsOnly: Bool = false {
        didSet { debouncedSaveSettings() }
    }
    
    // Available voices
    let availableVoices: [String] = ["Alloy", "Echo", "Fable", "Onyx", "Nova", "Shimmer"]
    
    // Voice tracking for re-recording
    @Published var currentSummaryVoice: String = "Alloy" // Voice used for current summary
    @Published var needsNewAudio: Bool = false // Whether audio needs to be re-recorded
    @Published var isReRecordingAudio: Bool = false // Whether currently re-recording audio
    
    // Voice preview system
    @Published var isPlayingVoicePreview: Bool = false
    private var voicePreviewPlayer: AVPlayer?
    private var cachedVoiceIntroductions: [String: String] = [:] // voice -> audio URL

    // MARK: - Initialization
    init() {
        loadSettings()
        loadCachedTrendingTopics()
        
        // Observe user logout/login notifications to manage user-specific state
        NotificationCenter.default.addObserver(
            forName: .userDidLogout,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.clearUserState()
            }
        }
        
        NotificationCenter.default.addObserver(
            forName: .userDidLogin,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                // Load new user's data when they log in
                await self?.initializeIfNeeded()
                await self?.checkForScheduledSummary()
                // Ensure automatic 6am/6pm fetches are set up
                await self?.ensureAutomaticFetchSchedule()
            }
        }
    }
    
    // MARK: - Intents
    func initializeIfNeeded() async {
        // Request notification permission on first launch
        await requestNotificationPermission()
        
        // Load cached voice introductions
        loadCachedVoiceIntroductions()
        
        // Trending topics are already loaded from cache in init()
        // Set up automatic trending topics refresh every 30 minutes
        setupTrendingTopicsTimer()
        
        // Parallelize async operations for better performance
        if ApiClient.isAuthenticated {
            // Run trending topics fetch in parallel with other operations
            // This will update the cached topics if new ones are available
            async let trendingTask = fetchTrendingTopics()
            async let customTopicsTask = loadCustomTopics()
            async let settingsTask = loadRemoteSettings()
            async let historyTask = checkForScheduledSummary() // Load lastFetchedTopics from history
            
            // Wait for trending topics first (no auth required, can show immediately)
            await trendingTask
            
            // Wait for user-specific data
            await customTopicsTask
            await settingsTask
            await historyTask // Ensure lastFetchedTopics is loaded from history
            
            // Ensure automatic 6am/6pm fetches are set up
            await ensureAutomaticFetchSchedule()
            
            // Load news sources for premium users in parallel
            if let authVM = authVM, authVM.currentUser?.isPremium == true {
                async let availableSourcesTask = loadAvailableNewsSources()
                async let excludedSourcesTask = loadExcludedNewsSources()
                await availableSourcesTask
                await excludedSourcesTask
            }
        } else {
            // Not authenticated - just fetch trending topics (will update cache)
            await fetchTrendingTopics()
        }
    }
    
    func toggle(_ topic: String) {
        if selectedTopics.contains(topic) { selectedTopics.remove(topic) }
        else { selectedTopics.insert(topic) }
        isDirty = true
    }

    func setLength(_ l: ApiClient.Length) { 
        print("📝 setLength called: \(l.label) (\(l.rawValue))")
        length = l // This will trigger didSet and debouncedSaveSettings()
        isDirty = true 
    }
    
    func fetchAgain() async {
        // Set the selected topics to the last fetched topics
        selectedTopics = lastFetchedTopics
        isDirty = true
        // Trigger the fetch
        await fetch()
    }
    
    
    private func loadCachedVoiceIntroductions() {
        if let data = UserDefaults.standard.data(forKey: "cachedVoiceIntroductions"),
           let cached = try? JSONDecoder().decode([String: String].self, from: data) {
            cachedVoiceIntroductions = cached
        }
    }
    
    private func saveCachedVoiceIntroductions() {
        if let data = try? JSONEncoder().encode(cachedVoiceIntroductions) {
            UserDefaults.standard.set(data, forKey: "cachedVoiceIntroductions")
        }
    }
    
    // MARK: - Settings Persistence
    private func loadSettings() {
        // First, load from local UserDefaults as fallback
        loadLocalSettings()
        
        // If user is authenticated, try to load from backend
        if ApiClient.isAuthenticated {
            Task {
                await loadRemoteSettings()
            }
        }
    }
    
    private func loadLocalSettings() {
        let defaults = UserDefaults.standard
        
        // Migrate old keys to new format if they exist
        let hasOldKeys = defaults.object(forKey: "playbackRate") != nil ||
                        defaults.string(forKey: "selectedVoice") != nil ||
                        defaults.object(forKey: "upliftingNewsOnly") != nil ||
                        defaults.array(forKey: "lastFetchedTopics") != nil
        
        if hasOldKeys {
            // Migrate old keys to new format
            if let oldRate = defaults.object(forKey: "playbackRate") as? Double {
                defaults.set(oldRate, forKey: "FetchNews_playbackRate")
            }
            if let oldVoice = defaults.string(forKey: "selectedVoice") {
                defaults.set(oldVoice, forKey: "FetchNews_selectedVoice")
            }
            if defaults.object(forKey: "upliftingNewsOnly") != nil {
                let oldUplifting = defaults.bool(forKey: "upliftingNewsOnly")
                defaults.set(oldUplifting, forKey: "FetchNews_upliftingNewsOnly")
            }
            if let oldTopics = defaults.array(forKey: "lastFetchedTopics") {
                defaults.set(oldTopics, forKey: "FetchNews_lastFetchedTopics")
            }
            
            // Clear old keys after migration
            defaults.removeObject(forKey: "playbackRate")
            defaults.removeObject(forKey: "selectedVoice")
            defaults.removeObject(forKey: "upliftingNewsOnly")
            defaults.removeObject(forKey: "lastFetchedTopics")
            // Note: synchronize() is not needed on modern iOS - UserDefaults auto-saves
        }
        
        // Load settings from UserDefaults
        if let savedRate = defaults.object(forKey: "FetchNews_playbackRate") as? Double {
            playbackRate = savedRate
        }
        
        if let savedVoice = defaults.string(forKey: "FetchNews_selectedVoice"), 
           availableVoices.contains(savedVoice) {
            selectedVoice = savedVoice
        }
        
        if let savedLength = defaults.object(forKey: "FetchNews_length") as? Int,
           let lengthValue = ApiClient.Length(rawValue: savedLength) {
            length = lengthValue
            print("✅ Loaded length from UserDefaults: \(lengthValue.label) (\(savedLength))")
        } else {
            print("⚠️ No saved length found in UserDefaults, using default: Short")
        }
        
        upliftingNewsOnly = defaults.bool(forKey: "FetchNews_upliftingNewsOnly")
        
        if let savedTopics = defaults.array(forKey: "FetchNews_lastFetchedTopics") as? [String] {
            lastFetchedTopics = Set(savedTopics)
        }
        
        if let savedSelectedTopics = defaults.array(forKey: "FetchNews_selectedTopics") as? [String] {
            selectedTopics = Set(savedSelectedTopics)
        }
        
        if let savedSources = defaults.array(forKey: "FetchNews_excludedNewsSources") as? [String] {
            excludedNewsSources = Set(savedSources)
        }
        
        if let savedCountry = defaults.string(forKey: "FetchNews_selectedCountry") {
            selectedCountry = savedCountry
        }
        
        // Scheduled summaries are loaded from server only (not local storage)
        // to ensure they're accessible across all devices
    }
    
    private func loadCachedTrendingTopics() {
        let defaults = UserDefaults.standard
        if let savedTrendingTopics = defaults.array(forKey: "FetchNews_trendingTopics") as? [String] {
            trendingTopics = savedTrendingTopics
        }
    }
    
    private func saveCachedTrendingTopics() {
        let defaults = UserDefaults.standard
        defaults.set(trendingTopics, forKey: "FetchNews_trendingTopics")
    }
    
    private func loadRemoteSettings() async {
        do {
            let preferences = try await ApiClient.getUserPreferences()
            
            // IMPORTANT: Backend is the source of truth for multi-device synchronization
            // Always use backend values when available to ensure settings are consistent across devices
            // Local storage is only used as a cache/fallback for offline use
            
            // Update voice from backend (source of truth)
            if availableVoices.contains(preferences.selectedVoice) {
                selectedVoice = preferences.selectedVoice
            }
            
            // Update playback rate from backend
            playbackRate = preferences.playbackRate
            
            // Update uplifting news only from backend
            upliftingNewsOnly = preferences.upliftingNewsOnly
            
            // Update length from backend, but preserve local value if backend has default
            // This ensures user's preference is preserved if backend hasn't been updated yet
            let currentLocalLength = length
            var lengthUpdated = false
            
            if let lengthInt = Int(preferences.length),
               let lengthValue = ApiClient.Length(rawValue: lengthInt) {
                // Backend default is '200' (short). If backend has default and we have a different
                // local value, keep the local value and sync it to backend.
                // Otherwise, use the backend value (which may be default or user's preference)
                if lengthInt == 200 && currentLocalLength != .short {
                    // Backend has default but user has a different preference locally
                    // Keep local value (don't update length) and sync it to backend
                    // The length property already has the correct local value
                    print("🔄 Backend has default length (200), preserving local value: \(currentLocalLength.label) (\(currentLocalLength.rawValue))")
                    // Save the local preference to backend to sync it
                    Task {
                        await saveRemoteSettings()
                    }
                    lengthUpdated = false // We're preserving, not updating
                } else {
                    // Backend has a non-default value, or local is also default - use backend value
                    length = lengthValue
                    lengthUpdated = true
                    print("✅ Updated length from backend: \(lengthValue.label) (\(lengthInt))")
                }
            } else {
                // Backend returned invalid length - keep local value and try to sync it
                print("⚠️ Backend returned invalid length: '\(preferences.length)', keeping local value: \(currentLocalLength.label)")
                if currentLocalLength != .short {
                    Task {
                        await saveRemoteSettings()
                    }
                }
                lengthUpdated = false // We're preserving, not updating
            }
            
            // If we preserved the local value, ensure it's explicitly saved to UserDefaults
            // This guarantees persistence even if backend sync hasn't completed yet
            if !lengthUpdated && currentLocalLength != .short {
                // Explicitly save the preserved local value to ensure it persists
                let defaults = UserDefaults.standard
                defaults.set(currentLocalLength.rawValue, forKey: "FetchNews_length")
                print("💾 Explicitly saved preserved length to UserDefaults: \(currentLocalLength.label) (\(currentLocalLength.rawValue))")
            }
            
            // Update country from backend
            if let country = preferences.selectedCountry, !country.isEmpty {
                selectedCountry = country
            }
            
            // Always update these from backend (they're more dynamic)
            lastFetchedTopics = Set(preferences.lastFetchedTopics)
            selectedTopics = Set(preferences.selectedTopics ?? [])
            excludedNewsSources = Set(preferences.excludedNewsSources)
            scheduledSummaries = preferences.scheduledSummaries
            
            // Cache backend values locally for offline use and faster subsequent loads
            // This ensures local settings are available if backend is temporarily unavailable
            saveLocalSettings()
        } catch {
            // Backend unavailable - fall back to local settings (already loaded in loadLocalSettings())
            // This ensures the app works offline and settings persist even when backend is down
        }
    }
    
    // Debounced save to reduce API calls
    private func debouncedSaveSettings() {
        // Always save to local UserDefaults immediately
        saveLocalSettings()
        
        // Cancel any pending save task
        saveSettingsTask?.cancel()
        
        // Debounce remote save by 1 second
        saveSettingsTask = Task {
            try? await Task.sleep(nanoseconds: 1_000_000_000) // 1 second
            if !Task.isCancelled && ApiClient.isAuthenticated {
                await saveRemoteSettings()
            }
        }
    }
    
    private func saveSettings() {
        // Always save to local UserDefaults first
        saveLocalSettings()
        
        // If user is authenticated, also save to backend
        if ApiClient.isAuthenticated {
            Task {
                await saveRemoteSettings()
            }
        }
    }
    
    private func saveLocalSettings() {
        let defaults = UserDefaults.standard
        
        // Validate values before saving
        let validPlaybackRate = max(0.5, min(2.0, playbackRate)) // Clamp between 0.5 and 2.0
        let validVoice = availableVoices.contains(selectedVoice) ? selectedVoice : "Alloy"
        
        // Save settings
        defaults.set(validPlaybackRate, forKey: "FetchNews_playbackRate")
        defaults.set(validVoice, forKey: "FetchNews_selectedVoice")
        defaults.set(upliftingNewsOnly, forKey: "FetchNews_upliftingNewsOnly")
        defaults.set(length.rawValue, forKey: "FetchNews_length")
        print("💾 Saved length to UserDefaults: \(length.label) (\(length.rawValue))")
        defaults.set(Array(lastFetchedTopics), forKey: "FetchNews_lastFetchedTopics")
        defaults.set(Array(selectedTopics), forKey: "FetchNews_selectedTopics")
        defaults.set(Array(excludedNewsSources), forKey: "FetchNews_excludedNewsSources")
        defaults.set(selectedCountry, forKey: "FetchNews_selectedCountry")
        
        // Scheduled summaries are not saved locally - they're managed on the server
        // to ensure they're accessible across all devices
        
        // Note: synchronize() is not needed on modern iOS - UserDefaults auto-saves
    }
    
    private func saveRemoteSettings() async {
        do {
            let preferences = UserPreferences(
                selectedVoice: selectedVoice,
                playbackRate: playbackRate,
                upliftingNewsOnly: upliftingNewsOnly,
                length: String(length.rawValue),
                lastFetchedTopics: Array(lastFetchedTopics),
                selectedTopics: Array(selectedTopics),
                excludedNewsSources: Array(excludedNewsSources),
                scheduledSummaries: [], // Don't save scheduledSummaries here - it's managed separately via /api/scheduled-summaries
                selectedCountry: selectedCountry
            )
            
            _ = try await ApiClient.updateUserPreferences(preferences)
        } catch {
            // Silently fail - local settings are already saved
        }
    }

    func setPlaybackRate(_ r: Double) {
        playbackRate = r // This will trigger didSet and saveSettings()
        if let p = player, p.timeControlStatus == .playing {
            p.rate = Float(r)
            updateNowPlaying(isPlaying: true)
        }
    }
    
    func setVoice(_ v: String) {
        selectedVoice = v // This will trigger didSet and saveSettings()
        
        // Check if we have a current summary
        if combined != nil {
            if currentSummaryVoice != v {
                // Voice changed to a different voice - need new audio
                needsNewAudio = true
            } else {
                // Voice changed back to the original voice - no need for new audio
                needsNewAudio = false
            }
        }
        
        isDirty = true
    }
    
    func setUpliftingNewsOnly(_ enabled: Bool) {
        upliftingNewsOnly = enabled // This will trigger didSet and saveSettings()
        isDirty = true
    }
    
    func testVoice() async {
        // Stop any current voice preview
        voicePreviewPlayer?.pause()
        voicePreviewPlayer = nil
        isPlayingVoicePreview = false
        
        // Check if we have a cached introduction for this voice
        if let cachedUrl = cachedVoiceIntroductions[selectedVoice] {
            // Play cached introduction
            await playCachedVoiceIntroduction(url: cachedUrl)
            return
        }
        
        // Generate new voice introduction
        let introductionText = "Hi, I'm \(selectedVoice), your personal news presenter."
        
        do {
            let url = try await ApiClient.tts(text: introductionText, voice: selectedVoice, speed: 1.0)
            if let audioUrl = url {
                // Cache the introduction
                cachedVoiceIntroductions[selectedVoice] = audioUrl
                saveCachedVoiceIntroductions()
                
                // Play the introduction
                await playCachedVoiceIntroduction(url: audioUrl)
            }
        } catch {
            // Silently fail voice test
        }
    }
    
    func reRecordAudio() async {
        guard let summary = combined?.summary else { return }
        
        isReRecordingAudio = true
        phase = .tts
        isBusy = true
        
        do {
            let url = try await ApiClient.tts(text: summary, voice: selectedVoice, speed: playbackRate)
            if let audioUrl = url {
                combined = Combined(
                    id: combined!.id,
                    title: combined!.title,
                    summary: combined!.summary,
                    audioUrl: audioUrl,
                    topicSections: combined!.topicSections
                )
                prepareAudio(urlString: audioUrl, title: combined!.title)
                // Update the voice tracking
                currentSummaryVoice = selectedVoice
                needsNewAudio = false
            }
        } catch {
            lastError = "Failed to re-record audio: \(error.localizedDescription)"
        }
        
        isBusy = false
        isReRecordingAudio = false
        phase = .idle
    }
    
    
    private func playCachedVoiceIntroduction(url: String) async {
        // Check if URL is valid
        guard let audioUrl = URL(string: url) else { return }
        
        let playerItem = AVPlayerItem(url: audioUrl)
        voicePreviewPlayer = AVPlayer(playerItem: playerItem)
        
        // Set up error observer
        NotificationCenter.default.addObserver(
            forName: .AVPlayerItemFailedToPlayToEndTime,
            object: playerItem,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.isPlayingVoicePreview = false
                self?.voicePreviewPlayer = nil
            }
        }
        
        // Set up completion observer
        NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: playerItem,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.isPlayingVoicePreview = false
                self?.voicePreviewPlayer = nil
            }
        }
        
        // Play the introduction
        isPlayingVoicePreview = true
        voicePreviewPlayer?.play()
    }
    
    func cancelCurrentRequest() {
        currentTask?.cancel()
        currentTask = nil
    }

    // MARK: - Fetch flow
    func fetch() async {
        guard !selectedTopics.isEmpty, phase == .idle, isDirty else { return }
        
        // Check if user can fetch news (prevent unnecessary API calls)
        if let authVM = authVM, !authVM.canFetchNews {
            let limit = authVM.currentUser?.isPremium == true ? 20 : 3
            lastError = "You've reached your daily limit of \(limit) Fetches. Upgrade to Premium for unlimited access."
            return
        }
        
        // Check if premium user has selected at least 5 news sources
        if let authVM = authVM, authVM.currentUser?.isPremium == true {
            // No minimum requirement for excluded sources - can exclude any number
        }
        
        // Cancel any existing request
        currentTask?.cancel()
        
        // Immediately show Fetch Screen with animation
        shouldShowFetchScreen = true
        isBusy = true
        phase = .gather
        
        currentTask = Task {
            combined = nil; items = []; fetchCreatedAt = nil
            resetPlayerState()
            lastError = nil // Clear previous errors
            isDirty = false // Reset dirty flag at start to allow retries
            
            // Note: This is a manual fetch, so when it completes, it will replace any scheduled fetch on the homepage
            
            // Use defer to ensure loading state is always reset, even on cancellation
            defer {
                Task { @MainActor in
                    phase = .idle
                    isBusy = false
                }
            }

            do {
                // UX: show "Building summary…" shortly after start
                Task { @MainActor in
                    try? await Task.sleep(nanoseconds: 350_000_000)
                    if self.phase == .gather { self.phase = .summarize }
                }

                // Check for cancellation before making API call
                try Task.checkCancellation()

        let resp = try await ApiClient.summarize(
            topics: Array(selectedTopics),
            wordCount: length.rawValue,
            skipTTS: true,
            goodNewsOnly: upliftingNewsOnly,
            country: selectedCountry
        )

                // Handle empty or missing summary
                let rawSummary = resp.combined?.summary ?? resp.items.first?.summary ?? ""
                // Note: Don't call htmlStripped() on combined summary - it's already plain text from ChatGPT
                // and htmlStripped() can destroy paragraph breaks (\n\n)
                let cleanedCombinedSummary = rawSummary.isEmpty ? "(No summary provided.)" : rawSummary.condenseWhitespace()

                // Only create combined if we have actual content
                if !cleanedCombinedSummary.isEmpty && cleanedCombinedSummary != "(No summary provided.)" {
                    let summaryTitle = (resp.combined?.title ?? "Summary").condenseWhitespace()
                    self.combined = Combined(
                        id: resp.combined?.id ?? resp.items.first?.id ?? "combined",
                        title: summaryTitle,
                        summary: cleanedCombinedSummary,
                        audioUrl: nil,
                        topicSections: resp.combined?.topicSections
                    )
                    // Set now playing title for playback bar
                    self.nowPlayingTitle = summaryTitle
                    // Track when this fetch was created
                    self.fetchCreatedAt = Date()
                    // Reset voice tracking for new summary
                    self.currentSummaryVoice = self.selectedVoice
                    self.needsNewAudio = false
                    // Reset topic feed to start
                    self.currentTopicIndex = 0
                    self.shouldAutoScroll = false
                } else {
                    self.combined = nil
                    self.fetchCreatedAt = nil
                }

                // Process items in background to avoid blocking UI
                let processedItems = await Task.detached {
                    resp.items.map { it in
                        Item(
                            id: it.id,
                            title: it.title.condenseWhitespace(),
                            summary: it.summary.htmlStripped().condenseWhitespace(),
                            url: it.url,
                            source: it.source,
                            topic: it.topic,
                            audioUrl: it.audioUrl
                        )
                    }
                }.value
                
                self.items = processedItems
            
                // Check if we got any useful data
                if self.combined == nil && self.items.isEmpty {
                    throw NetworkError.decodingError(NSError(domain: "NoData", code: 0, userInfo: [NSLocalizedDescriptionKey: "No news articles found for the selected topics. Try different topics or check back later."]))
                }

                // Check for cancellation before TTS
                try Task.checkCancellation()

                // TTS
                phase = .tts
                if let text = self.combined?.summary {
                    let url = try await ApiClient.tts(text: text, voice: selectedVoice, speed: playbackRate)
                    if let audioUrl = url {
                        self.combined = Combined(
                            id: self.combined!.id,
                            title: self.combined!.title,
                            summary: self.combined!.summary,
                            audioUrl: audioUrl,
                            topicSections: self.combined!.topicSections
                        )
                        self.prepareAudio(urlString: audioUrl, title: self.combined!.title)
                        // Record the voice used for this summary
                        self.currentSummaryVoice = self.selectedVoice
                        self.needsNewAudio = false
                        
                        // Check if app is still in foreground after audio completes
                        // If not, send notification
                        let appInForeground = await MainActor.run {
                            UIApplication.shared.applicationState == .active
                        }
                        
                        if !appInForeground {
                            // User closed the app while Fetch was processing, send notification
                            let fetchTitle = self.combined?.title ?? "Your Fetch"
                            Task {
                                try? await ApiClient.sendFetchReadyNotification(fetchTitle: fetchTitle)
                            }
                        }
                    }
                }

                isDirty = false
                
                // Save summary to history only on success
                await saveSummaryToHistory()
                
                // Store the topics that were used for this summary before deselecting
                lastFetchedTopics = selectedTopics
                
                // Immediately save lastFetchedTopics to backend (not debounced) to ensure persistence
                if ApiClient.isAuthenticated {
                    do {
                        let preferences = UserPreferences(
                            selectedVoice: selectedVoice,
                            playbackRate: playbackRate,
                            upliftingNewsOnly: upliftingNewsOnly,
                            length: String(length.rawValue),
                            lastFetchedTopics: Array(lastFetchedTopics),
                            selectedTopics: Array(selectedTopics),
                            excludedNewsSources: Array(excludedNewsSources),
                            scheduledSummaries: [],
                            selectedCountry: selectedCountry
                        )
                        _ = try await ApiClient.updateUserPreferences(preferences)
                        print("✅ Saved lastFetchedTopics to backend: \(lastFetchedTopics.count) topics")
                    } catch {
                        print("⚠️ Failed to save lastFetchedTopics: \(error)")
                    }
                }
                
                // Trigger FetchScreen to open automatically for new fetch
                shouldShowFetchScreen = true
                
                // Deselect all topics after successful summary generation
                selectedTopics.removeAll()
                
                // Refresh user data to update usage count
                await authVM?.refreshUser()
            } catch {
                // Don't show error if task was cancelled - defer block will handle state reset
                if Task.isCancelled {
                    return
                }
                
                isDirty = true
                
                // Handle different types of errors
                if let networkError = error as? NetworkError {
                    lastError = networkError.errorDescription
                } else if let urlError = error as? URLError {
                    // Check for cancellation error code
                    if urlError.code == .cancelled {
                        // This is a cancellation - don't show error, just return
                        return
                    }
                    switch urlError.code {
                    case .badServerResponse:
                        lastError = "Server error (500) - please try again"
                    case .timedOut:
                        lastError = "Request timed out - please try again"
                    case .notConnectedToInternet:
                        lastError = "No internet connection"
                    default:
                        lastError = "Network error: \(urlError.localizedDescription)"
                    }
                } else {
                    lastError = "Failed to fetch news: \(error.localizedDescription)"
                }
            }
        }
    }

    // MARK: - User State Management
    
    /// Clears all user-specific state when user logs out
    /// This ensures the next user doesn't see the previous user's data
    func clearUserState() {
        // Clear summary and audio state
        resetPlayerState()
        combined = nil
        items = []
        fetchCreatedAt = nil
        shouldShowFetchScreen = false
        nowPlayingTitle = ""
        
        // Clear user-specific topics and preferences
        selectedTopics.removeAll()
        lastFetchedTopics.removeAll()
        customTopics = []
        excludedNewsSources.removeAll()
        scheduledSummaries = []
        
        // Clear error state
        lastError = nil
        
        // Reset phase and busy state
        phase = .idle
        isBusy = false
        isDirty = true
        
        // Cancel any ongoing tasks
        currentTask?.cancel()
        currentTask = nil
        saveSettingsTask?.cancel()
        saveSettingsTask = nil
        
        // Clear voice preview
        voicePreviewPlayer?.pause()
        voicePreviewPlayer = nil
        isPlayingVoicePreview = false
    }
    
    // MARK: - Audio
    private func resetPlayerState() {
        if let p = player, let token = timeObserverToken {
            p.removeTimeObserver(token)
            timeObserverToken = nil
        }
        if let endObs = endObserver {
            NotificationCenter.default.removeObserver(endObs)
            endObserver = nil
        }
        player?.pause()
        player = nil
        canPlay = false
        isPlaying = false
        nowPlayingTitle = ""
        currentTime = 0
        duration = 0
        updateNowPlaying(isPlaying: false)
    }

    private func resolveAudioURL(_ urlString: String) -> URL? {
        if let absolute = URL(string: urlString), absolute.scheme?.isEmpty == false {
            return absolute
        }
        var path = urlString.trimmingCharacters(in: .whitespacesAndNewlines)
        if !path.hasPrefix("/") { path = "/" + path }
        return URL(string: ApiClient.base.absoluteString + path)
    }

    private func prepareAudio(urlString: String, title: String) {
        guard let url = resolveAudioURL(urlString) else {
            print("Invalid audio URL:", urlString)
            canPlay = false
            return
        }
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [])
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            print("AVAudioSession error:", error)
        }

        let item = AVPlayerItem(url: url)
        let p = AVPlayer(playerItem: item)
        p.automaticallyWaitsToMinimizeStalling = false

        // Remove previous observers before swapping
        resetPlayerState()
        player = p
        nowPlayingTitle = title
        canPlay = true
        isPlaying = false

        // Observe time for progress bar
        timeObserverToken = p.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: 0.5, preferredTimescale: 600),
            queue: .main
        ) { [weak self] time in
            Task { @MainActor in
                guard let self = self else { return }
                self.currentTime = time.seconds
                if let dur = p.currentItem?.duration.seconds, dur.isFinite {
                    self.duration = dur
                }
                // Force view update to ensure UI refreshes
                self.objectWillChange.send()
            }
        }

        // Observe end of playback
        endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: item,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                guard let self = self else { return }
                self.isPlaying = false
                self.currentTime = self.duration
                self.updateNowPlaying(isPlaying: false)
                
                // Trigger auto-scroll to next topic in feed
                self.shouldAutoScroll = true
            }
        }

        updateNowPlaying(isPlaying: false)
    }

    private func artwork() -> MPMediaItemArtwork? {
        #if canImport(UIKit)
        if let img = UIImage(named: "NowPlaying") {
            return MPMediaItemArtwork(boundsSize: img.size) { _ in img }
        }
        #endif
        return nil
    }

    private func updateNowPlaying(isPlaying: Bool) {
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: nowPlayingTitle,
            MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? 1.0 : 0.0
        ]
        if duration > 0 {
            info[MPMediaItemPropertyPlaybackDuration] = duration
            info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = currentTime
        }
        if let art = artwork() {
            info[MPMediaItemPropertyArtwork] = art
        }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    func playPause() {
        // Stop any voice preview first
        voicePreviewPlayer?.pause()
        voicePreviewPlayer = nil
        isPlayingVoicePreview = false
        
        guard let p = player else { return }
        if isPlaying {
            p.pause()
            isPlaying = false
            updateNowPlaying(isPlaying: false)
        } else {
            p.play()
            p.rate = Float(playbackRate)
            isPlaying = true
            updateNowPlaying(isPlaying: true)
        }
    }

    func seek(to seconds: Double) {
        guard let p = player, seconds.isFinite, seconds >= 0 else { return }
        let cm = CMTime(seconds: seconds, preferredTimescale: 600)
        p.seek(to: cm, toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] _ in
            Task { @MainActor in
                guard let self = self else { return }
                self.currentTime = seconds
                self.updateNowPlaying(isPlaying: self.isPlaying)
            }
        }
    }
    
    // MARK: - Per-Topic Audio
    
    /// Play audio for a specific topic section
    func playTopicAudio(for topicSection: TopicSection) {
        guard let audioUrl = topicSection.audioUrl else {
            print("⚠️ No audio URL for topic: \(topicSection.topic)")
            return
        }
        
        // Stop current player
        player?.pause()
        
        // Prepare and play topic audio
        prepareAudio(urlString: audioUrl, title: topicSection.topic.capitalized)
        currentTopicAudioUrl = audioUrl
        
        // Auto-play
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
            self?.playPause()
        }
    }
    
    /// Stop audio for current topic
    func stopTopicAudio() {
        if isPlaying {
            player?.pause()
            isPlaying = false
            updateNowPlaying(isPlaying: false)
        }
    }
    
    /// Switch to a different topic's audio
    func switchToTopicAudio(for topicSection: TopicSection, autoPlay: Bool = false) {
        guard let audioUrl = topicSection.audioUrl else { return }
        
        // Only switch if it's a different audio URL
        if currentTopicAudioUrl != audioUrl {
            let wasPlaying = isPlaying
            stopTopicAudio()
            prepareAudio(urlString: audioUrl, title: topicSection.topic.capitalized)
            currentTopicAudioUrl = audioUrl
            
            // Resume playing if it was playing before or autoPlay is true
            if wasPlaying || autoPlay {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
                    self?.playPause()
                }
            }
        }
    }
    
    // MARK: - Subscription UI
    
    func showSubscriptionView() {
        showingSubscriptionView = true
    }
    
    func showNewsSourcesSettings() {
        showingNewsSourcesSettings = true
    }
    
    // MARK: - Automatic Fetch Schedule
    
    /// Ensures user has automatic 6am and 6pm fetch schedules set up
    /// This creates two scheduled summaries if they don't exist
    func ensureAutomaticFetchSchedule() async {
        guard ApiClient.isAuthenticated else { return }
        
        do {
            // Load existing scheduled summaries
            let existingSummaries = try await ApiClient.getScheduledSummaries()
            
            // Check if we already have 6am and 6pm schedules
            let has6am = existingSummaries.contains { $0.time == "06:00" && $0.isEnabled }
            let has6pm = existingSummaries.contains { $0.time == "18:00" && $0.isEnabled }
            
            // Create 6am schedule if missing
            if !has6am {
                let morning = ScheduledSummary(
                    id: UUID().uuidString,
                    name: "Morning News",
                    time: "06:00",
                    topics: Array(selectedTopics.isEmpty ? ["general"] : selectedTopics),
                    customTopics: [],
                    days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
                    isEnabled: true,
                    createdAt: ISO8601DateFormatter().string(from: Date()),
                    lastRun: nil
                )
                
                _ = try await ApiClient.createScheduledSummary(morning)
                print("✅ Created automatic 6am fetch schedule")
            }
            
            // Create 6pm schedule if missing
            if !has6pm {
                let evening = ScheduledSummary(
                    id: UUID().uuidString,
                    name: "Evening News",
                    time: "18:00",
                    topics: Array(selectedTopics.isEmpty ? ["general"] : selectedTopics),
                    customTopics: [],
                    days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
                    isEnabled: true,
                    createdAt: ISO8601DateFormatter().string(from: Date()),
                    lastRun: nil
                )
                
                _ = try await ApiClient.createScheduledSummary(evening)
                print("✅ Created automatic 6pm fetch schedule")
            }
            
            // Reload scheduled summaries to update UI
            if !has6am || !has6pm {
                let updatedSummaries = try await ApiClient.getScheduledSummaries()
                await MainActor.run {
                    self.scheduledSummaries = updatedSummaries
                }
            }
            
            print("✅ Automatic fetch schedules verified (6am & 6pm)")
        } catch {
            print("⚠️ Failed to ensure automatic fetch schedules: \(error)")
            // Silently fail - user can manually set up schedules if needed
        }
    }
    
    // MARK: - Custom Topics Management
    
    func loadCustomTopics() async {
        do {
            let topics = try await ApiClient.getCustomTopics()
            await MainActor.run {
                self.customTopics = topics
                // Sync customTopics to selectedTopics to ensure they're in sync
                // Merge with existing selectedTopics to preserve any manually selected topics
                let existingSelected = self.selectedTopics
                self.selectedTopics = existingSelected.union(Set(topics))
            }
        } catch {
            // Silently fail - custom topics are optional
        }
    }
    
    func addCustomTopic(_ topic: String) async {
        do {
            let updatedTopics = try await ApiClient.addCustomTopic(topic)
            await MainActor.run {
                self.customTopics = updatedTopics
                // Also add to selectedTopics to ensure it persists
                self.selectedTopics.insert(topic)
            }
            // Save to backend preferences immediately to ensure persistence
            await saveRemoteSettings()
        } catch {
            // Silently fail - user can try again
        }
    }
    
    func removeCustomTopic(_ topic: String) async {
        do {
            let updatedTopics = try await ApiClient.removeCustomTopic(topic)
            await MainActor.run {
                self.customTopics = updatedTopics
                // Also remove from selectedTopics to keep them in sync
                self.selectedTopics.remove(topic)
            }
            // Save to backend preferences immediately
            await saveRemoteSettings()
        } catch {
            // Silently fail - user can try again
        }
    }
    
    func updateCustomTopics(_ topics: [String]) async {
        do {
            let updatedTopics = try await ApiClient.updateCustomTopics(topics)
            await MainActor.run {
                self.customTopics = updatedTopics
            }
        } catch {
            // Silently fail - user can try again
        }
    }
    
    func fetchTrendingTopics() async {
        do {
            let response = try await ApiClient.getTrendingTopics()
            await MainActor.run {
                self.trendingTopics = response.trendingTopics
                // Save to UserDefaults for persistence
                self.saveCachedTrendingTopics()
            }
        } catch {
            print("Failed to fetch trending topics: \(error)")
            // On error, keep using cached trending topics if available
        }
    }
    
    private func setupTrendingTopicsTimer() {
        // Cancel existing timer if any
        trendingTopicsTimer?.invalidate()
        
        // Set up new timer to refresh trending topics every 30 minutes
        trendingTopicsTimer = Timer.scheduledTimer(withTimeInterval: 30 * 60, repeats: true) { [weak self] _ in
            Task {
                await self?.fetchTrendingTopics()
            }
        }
    }
    
    func deleteSelectedCustomTopics() async {
        // Only delete custom topics that are selected
        let customTopicsToDelete = selectedTopics.intersection(Set(customTopics))
        
        print("DEBUG: Custom topics to delete: \(customTopicsToDelete)")
        print("DEBUG: Current custom topics: \(customTopics)")
        print("DEBUG: Current selected topics: \(selectedTopics)")
        
        if customTopicsToDelete.isEmpty {
            print("DEBUG: No custom topics to delete")
            return
        }
        
        do {
            let updatedTopics = try await ApiClient.deleteCustomTopics(Array(customTopicsToDelete))
            print("DEBUG: Updated topics from API: \(updatedTopics)")
            
            await MainActor.run {
                self.customTopics = updatedTopics
                // Remove the deleted topics from selected topics
                self.selectedTopics.subtract(customTopicsToDelete)
                // Also remove from last fetched topics to clean up the recent topics line
                self.lastFetchedTopics.subtract(customTopicsToDelete)
                
                print("DEBUG: After deletion - custom topics: \(self.customTopics)")
                print("DEBUG: After deletion - selected topics: \(self.selectedTopics)")
            }
        } catch {
            print("Failed to delete custom topics: \(error)")
        }
    }
    
    // MARK: - News Sources Management
    
    func loadAvailableNewsSources() async {
        do {
            let response = try await ApiClient.getAvailableNewsSources()
            await MainActor.run {
                self.availableNewsSources = response.sources
                self.newsSourcesByCategory = response.sourcesByCategory
            }
        } catch {
            // Silently fail - news sources are optional
        }
    }
    
    func loadExcludedNewsSources() async {
        do {
            let sources = try await ApiClient.getExcludedNewsSources()
            await MainActor.run {
                self.excludedNewsSources = Set(sources)
            }
        } catch {
            // Silently fail - use local settings
        }
    }
    
    func updateExcludedNewsSources(_ sources: [String]) async {
        do {
            let updatedSources = try await ApiClient.updateExcludedNewsSources(sources)
            await MainActor.run {
                self.excludedNewsSources = Set(updatedSources)
            }
        } catch {
            // Silently fail - user can try again
        }
    }
    
    func toggleNewsSource(_ sourceId: String) {
        if excludedNewsSources.contains(sourceId) {
            excludedNewsSources.remove(sourceId)
        } else {
            excludedNewsSources.insert(sourceId)
        }
    }
    
    // MARK: - Summary History Management
    
    func saveSummaryToHistory() async {
        guard let summary = combined else { return }
        
        // Convert items to source objects with full article information
        let sourceObjects: [[String: Any]] = items.map { item in
            var sourceDict: [String: Any] = [
                "id": item.id,
                "source": item.source ?? ""
            ]
            
            // Add optional fields if they exist
            if !item.title.isEmpty {
                sourceDict["title"] = item.title
            }
            if !item.summary.isEmpty {
                sourceDict["summary"] = item.summary
            }
            if let url = item.url, !url.isEmpty {
                sourceDict["url"] = url
            }
            if let topic = item.topic, !topic.isEmpty {
                sourceDict["topic"] = topic
            }
            
            return sourceDict
        }
        
        var summaryData: [String: Any] = [
            "id": summary.id,
            "title": summary.title,
            "summary": summary.summary,
            "topics": Array(selectedTopics),
            "length": length.rawValue,
            "wordCount": length.rawValue,
            "sources": sourceObjects
        ]
        
        // Only include audioUrl if it's not nil or empty
        if let audioUrl = summary.audioUrl, !audioUrl.isEmpty {
            summaryData["audioUrl"] = audioUrl
        }
        
        do {
            try await ApiClient.addSummaryToHistory(summaryData: summaryData)
        } catch {
            // Silently fail - history saving is optional
        }
    }
    
    // Check for scheduled summaries and load the most recent one if it's newer than current
    func checkForScheduledSummary() async {
        guard !isBusy else { return } // Don't interrupt a manual fetch in progress
        
        do {
            let history = try await ApiClient.getSummaryHistory()
            
            // History is sorted with most recent first, so check the first entry
            guard let mostRecent = history.first else {
                return // No history
            }
            
            // IMPORTANT: Update lastFetchedTopics from all history entries within the last 48 hours
            // This ensures recent topics from multiple fetches are available
            await MainActor.run {
                let now = Date()
                let fortyEightHoursAgo = now.addingTimeInterval(-48 * 60 * 60) // 48 hours ago
                
                // Parse timestamp helper
                func parseTimestamp(_ timestampString: String) -> Date? {
                    let formatter = ISO8601DateFormatter()
                    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
                    if let date = formatter.date(from: timestampString) {
                        return date
                    }
                    // Fallback to standard ISO8601
                    let fallbackFormatter = ISO8601DateFormatter()
                    return fallbackFormatter.date(from: timestampString)
                }
                
                // Collect topics from all entries within the last 48 hours
                var recentTopics: Set<String> = []
                for entry in history {
                    // Parse timestamp string to Date
                    if let entryDate = parseTimestamp(entry.timestamp) {
                        // Only include entries from the last 48 hours
                        if entryDate >= fortyEightHoursAgo {
                            recentTopics.formUnion(Set(entry.topics))
                            let dateFormatter = DateFormatter()
                            dateFormatter.dateStyle = .short
                            dateFormatter.timeStyle = .short
                            print("📅 Including topics from '\(entry.title)' (\(dateFormatter.string(from: entryDate))): \(entry.topics.joined(separator: ", "))")
                        }
                    } else {
                        print("⚠️ Could not parse timestamp for entry '\(entry.title)': \(entry.timestamp)")
                    }
                }
                
                // Update lastFetchedTopics with all recent topics
                if !recentTopics.isEmpty {
                    lastFetchedTopics.formUnion(recentTopics)
                    print("✅ Updated lastFetchedTopics from last 48 hours (\(recentTopics.count) topics): \(recentTopics.joined(separator: ", "))")
                } else {
                    // Fallback: if no entries in last 48 hours, use most recent entry
                    if !mostRecent.topics.isEmpty {
                        lastFetchedTopics.formUnion(Set(mostRecent.topics))
                        print("⚠️ No entries in last 48 hours, using most recent: \(mostRecent.topics.joined(separator: ", "))")
                    }
                }
            }
            
            // Always load the most recent fetch (whether scheduled or manual)
            // Check if we should load it by comparing with current summary
            var shouldLoad = false
            
            if let currentCombined = combined {
                // If current summary is different from the most recent, replace it
                if currentCombined.id != mostRecent.id {
                    shouldLoad = true
                }
            } else {
                // No current summary, load the most recent one
                shouldLoad = true
            }
            
            guard shouldLoad else { return }
            
            // Send notification if this is a new scheduled fetch (not a manual fetch)
            if mostRecent.id.hasPrefix("scheduled-") {
                await sendScheduledFetchNotification(title: mostRecent.title)
            }
            
            // Load the most recent fetch to the homepage (scheduled or manual)
            await loadSummaryFromHistory(mostRecent)
            
            let fetchType = mostRecent.id.hasPrefix("scheduled-") ? "scheduled" : "manual"
            print("✅ Loaded \(fetchType) fetch '\(mostRecent.title)' to homepage")
        } catch {
            print("Failed to check for scheduled fetch: \(error)")
        }
    }
    
    // Start periodic checking for scheduled summaries every 2 minutes
    func startPeriodicScheduledSummaryCheck() {
        // Cancel existing timer if any
        scheduledSummaryTimer?.invalidate()
        
        // Set up new timer to check for scheduled summaries every 2 minutes
        scheduledSummaryTimer = Timer.scheduledTimer(withTimeInterval: 2 * 60, repeats: true) { [weak self] _ in
            Task {
                await self?.checkForScheduledSummary()
            }
        }
    }
    
    // Stop periodic checking for scheduled summaries
    func stopPeriodicScheduledSummaryCheck() {
        scheduledSummaryTimer?.invalidate()
        scheduledSummaryTimer = nil
    }
    
    private func parseTimestamp(_ timestamp: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: timestamp) {
            return date
        }
        
        // Fallback to standard ISO8601
        let fallbackFormatter = ISO8601DateFormatter()
        return fallbackFormatter.date(from: timestamp)
    }
    
    // Load a summary from history into the main player
    func loadSummaryFromHistory(_ entry: SummaryHistoryEntry) async {
        await MainActor.run {
            // Set combined summary
            // Note: History entries don't have topicSections, so feedback won't be available for historical fetches
            combined = Combined(
                id: entry.id,
                title: entry.title,
                summary: entry.summary,
                audioUrl: entry.audioUrl,
                topicSections: nil
            )
            
            // Set last fetched topics from the fetch's topics
            lastFetchedTopics = Set(entry.topics)
            
            // Set now playing title
            nowPlayingTitle = entry.title
            
            // Convert sources to items if available
            if let sources = entry.sources, !sources.isEmpty {
                items = sources.enumerated().map { index, sourceItem in
                    Item(
                        id: sourceItem.id ?? "\(entry.id)-source-\(index)",
                        title: sourceItem.title ?? sourceItem.source,
                        summary: sourceItem.summary ?? "",
                        url: sourceItem.url ?? "",
                        source: sourceItem.source,
                        topic: sourceItem.topic ?? entry.topics.first ?? "",
                        audioUrl: nil
                    )
                }
            } else {
                items = []
            }
            
            // Prepare audio if available - ensure URL is valid
            if let audioUrl = entry.audioUrl, !audioUrl.isEmpty {
                prepareAudio(urlString: audioUrl, title: entry.title)
            } else {
                // No audio available, reset player state
                resetPlayerState()
            }
        }
    }
}

// MARK: - Text cleanup helpers
extension String {
    func htmlStripped() -> String {
        if let data = self.data(using: .utf8) {
            if let attributed = try? NSAttributedString(
                data: data,
                options: [
                    .documentType: NSAttributedString.DocumentType.html,
                    .characterEncoding: String.Encoding.utf8.rawValue
                ],
                documentAttributes: nil
            ) {
                return attributed.string
            }
        }
        return self.replacingOccurrences(of: "<[^>]+>", with: " ", options: .regularExpression)
    }
    func condenseWhitespace() -> String {
        // Preserve paragraph breaks (\n\n) while condensing inline whitespace
        // Split by paragraph breaks, condense whitespace in each paragraph, then rejoin
        let paragraphs = self.components(separatedBy: "\n\n")
        let condensedParagraphs = paragraphs.map { paragraph in
            // Condense multiple spaces/tabs within a line, but preserve single line breaks
            let lines = paragraph.components(separatedBy: "\n")
            let condensedLines = lines.map { line in
                line.replacingOccurrences(of: "[ \\t]+", with: " ", options: .regularExpression)
                    .trimmingCharacters(in: .whitespaces)
            }
            return condensedLines.joined(separator: "\n")
        }
        return condensedParagraphs.joined(separator: "\n\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

// MARK: - Notification Support

extension NewsVM {
    // Request notification permissions on first launch
    func requestNotificationPermission() async {
        let center = UNUserNotificationCenter.current()
        
        // Check current authorization status
        let settings = await center.notificationSettings()
        
        guard settings.authorizationStatus == .notDetermined else {
            // Already requested, don't ask again
            return
        }
        
        // Request authorization
        do {
            let granted = try await center.requestAuthorization(options: [.alert, .sound, .badge])
            if granted {
                print("✅ Notification permission granted")
            } else {
                print("❌ Notification permission denied")
            }
        } catch {
            print("Failed to request notification permission: \(error)")
        }
    }
    
    // Send a notification when a scheduled fetch is ready
    func sendScheduledFetchNotification(title: String) async {
        let center = UNUserNotificationCenter.current()
        
        // Check if notifications are authorized
        let settings = await center.notificationSettings()
        
        // If not authorized, request permission
        if settings.authorizationStatus != .authorized {
            await requestNotificationPermission()
            
            // Check again after requesting
            let newSettings = await center.notificationSettings()
            guard newSettings.authorizationStatus == .authorized else {
                print("Notifications not authorized, skipping notification")
                return
            }
        }
        
        // Create notification content
        let content = UNMutableNotificationContent()
        content.title = "Daily Fetch Ready!"
        content.body = "Your \(title) is ready to read."
        content.sound = .default
        content.badge = 1
        
        // Create a unique identifier for this notification
        let identifier = "scheduled-fetch-\(UUID().uuidString)"
        
        // Create trigger for immediate delivery
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 0.1, repeats: false)
        
        // Create request
        let request = UNNotificationRequest(identifier: identifier, content: content, trigger: trigger)
        
        // Schedule notification
        do {
            try await center.add(request)
            print("✅ Scheduled fetch notification sent: \(title)")
        } catch {
            print("❌ Failed to send notification: \(error)")
        }
    }
}
