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
    
    deinit {
        trendingTopicsTimer?.invalidate()
    }
    
    // Last fetched topics for "Fetch again" functionality
    @Published var lastFetchedTopics: Set<String> = [] {
        didSet { debouncedSaveSettings() }
    }
    
    // News sources (premium feature)
    @Published var selectedNewsSources: Set<String> = [] {
        didSet { debouncedSaveSettings() }
    }
    @Published var availableNewsSources: [NewsSource] = []
    @Published var newsSourcesByCategory: [String: [NewsSource]] = [:]
    
    // User location
    @Published var userLocation: String = ""
    
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
            
            // Wait for trending topics first (no auth required, can show immediately)
            await trendingTask
            
            // Wait for user-specific data
            await customTopicsTask
            await settingsTask
            
            // Load news sources for premium users in parallel
            if let authVM = authVM, authVM.currentUser?.isPremium == true {
                async let availableSourcesTask = loadAvailableNewsSources()
                async let selectedSourcesTask = loadSelectedNewsSources()
                await availableSourcesTask
                await selectedSourcesTask
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

    func setLength(_ l: ApiClient.Length) { length = l; isDirty = true }
    
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
        }
        
        upliftingNewsOnly = defaults.bool(forKey: "FetchNews_upliftingNewsOnly")
        
        if let savedTopics = defaults.array(forKey: "FetchNews_lastFetchedTopics") as? [String] {
            lastFetchedTopics = Set(savedTopics)
        }
        
        if let savedSelectedTopics = defaults.array(forKey: "FetchNews_selectedTopics") as? [String] {
            selectedTopics = Set(savedSelectedTopics)
        }
        
        if let savedSources = defaults.array(forKey: "FetchNews_selectedNewsSources") as? [String] {
            selectedNewsSources = Set(savedSources)
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
            
            // Update local properties with backend values
            if availableVoices.contains(preferences.selectedVoice) {
                selectedVoice = preferences.selectedVoice
            }
            
            playbackRate = preferences.playbackRate
            upliftingNewsOnly = preferences.upliftingNewsOnly
            
            if let lengthInt = Int(preferences.length),
               let lengthValue = ApiClient.Length(rawValue: lengthInt) {
                length = lengthValue
            }
            
            lastFetchedTopics = Set(preferences.lastFetchedTopics)
            selectedTopics = Set(preferences.selectedTopics ?? [])
            selectedNewsSources = Set(preferences.selectedNewsSources)
            scheduledSummaries = preferences.scheduledSummaries
            
            // Save to local UserDefaults as backup
            saveLocalSettings()
        } catch {
            // Silently fall back to local settings
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
        defaults.set(Array(lastFetchedTopics), forKey: "FetchNews_lastFetchedTopics")
        defaults.set(Array(selectedTopics), forKey: "FetchNews_selectedTopics")
        defaults.set(Array(selectedNewsSources), forKey: "FetchNews_selectedNewsSources")
        
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
                selectedNewsSources: Array(selectedNewsSources),
                scheduledSummaries: [] // Don't save scheduledSummaries here - it's managed separately via /api/scheduled-summaries
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
                    audioUrl: audioUrl
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
            lastError = "You've reached your daily limit of 10 summaries. Upgrade to Premium for unlimited access."
            return
        }
        
        // Check if premium user has selected at least 5 news sources
        if let authVM = authVM, authVM.currentUser?.isPremium == true {
            if selectedNewsSources.count > 0 && selectedNewsSources.count < 5 {
                lastError = "Please select at least 5 news sources. You currently have \(selectedNewsSources.count) selected. Go to Settings > Premium Features > News Sources to select more."
                return
            }
        }
        
        // Cancel any existing request
        currentTask?.cancel()
        
        currentTask = Task {
            isBusy = true; phase = .gather
            combined = nil; items = []; resetPlayerState()
            lastError = nil // Clear previous errors
            isDirty = false // Reset dirty flag at start to allow retries
            
            // Note: This is a manual fetch, so when it completes, it will replace any scheduled fetch on the homepage

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
            goodNewsOnly: upliftingNewsOnly
        )

                // Handle empty or missing summary
                let rawSummary = resp.combined?.summary ?? resp.items.first?.summary ?? ""
                let cleanedCombinedSummary = rawSummary.isEmpty ? "(No summary provided.)" : rawSummary.htmlStripped().condenseWhitespace()

                // Only create combined if we have actual content
                if !cleanedCombinedSummary.isEmpty && cleanedCombinedSummary != "(No summary provided.)" {
                    self.combined = Combined(
                        id: resp.combined?.id ?? resp.items.first?.id ?? "combined",
                        title: (resp.combined?.title ?? "Summary").condenseWhitespace(),
                        summary: cleanedCombinedSummary,
                        audioUrl: nil
                    )
                    // Reset voice tracking for new summary
                    self.currentSummaryVoice = self.selectedVoice
                    self.needsNewAudio = false
                } else {
                    self.combined = nil
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
                            audioUrl: audioUrl
                        )
                        self.prepareAudio(urlString: audioUrl, title: self.combined!.title)
                        // Record the voice used for this summary
                        self.currentSummaryVoice = self.selectedVoice
                        self.needsNewAudio = false
                    }
                }

                isDirty = false
                
                // Save summary to history only on success
                await saveSummaryToHistory()
                
                // Store the topics that were used for this summary before deselecting
                lastFetchedTopics = selectedTopics
                
                // Deselect all topics after successful summary generation
                selectedTopics.removeAll()
                
                // Refresh user data to update usage count
                await authVM?.refreshUser()
            } catch {
                // Don't show error if task was cancelled
                if Task.isCancelled {
                    return
                }
                
                isDirty = true
                
                // Handle different types of errors
                if let networkError = error as? NetworkError {
                    lastError = networkError.errorDescription
                } else if let urlError = error as? URLError {
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

            phase = .idle; isBusy = false
        }
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
    
    // MARK: - Subscription UI
    
    func showSubscriptionView() {
        showingSubscriptionView = true
    }
    
    func showNewsSourcesSettings() {
        showingNewsSourcesSettings = true
    }
    
    // MARK: - Custom Topics Management
    
    func loadCustomTopics() async {
        do {
            let topics = try await ApiClient.getCustomTopics()
            await MainActor.run {
                self.customTopics = topics
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
            }
        } catch {
            // Silently fail - user can try again
        }
    }
    
    func removeCustomTopic(_ topic: String) async {
        do {
            let updatedTopics = try await ApiClient.removeCustomTopic(topic)
            await MainActor.run {
                self.customTopics = updatedTopics
            }
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
    
    func loadSelectedNewsSources() async {
        do {
            let sources = try await ApiClient.getSelectedNewsSources()
            await MainActor.run {
                self.selectedNewsSources = Set(sources)
            }
        } catch {
            // Silently fail - use local settings
        }
    }
    
    func updateSelectedNewsSources(_ sources: [String]) async {
        do {
            let updatedSources = try await ApiClient.updateSelectedNewsSources(sources)
            await MainActor.run {
                self.selectedNewsSources = Set(updatedSources)
            }
        } catch {
            // Silently fail - user can try again
        }
    }
    
    func toggleNewsSource(_ sourceId: String) {
        if selectedNewsSources.contains(sourceId) {
            selectedNewsSources.remove(sourceId)
        } else {
            selectedNewsSources.insert(sourceId)
        }
    }
    
    // MARK: - Summary History Management
    
    func saveSummaryToHistory() async {
        guard let summary = combined else { return }
        
        let summaryData: [String: Any] = [
            "id": summary.id,
            "title": summary.title,
            "summary": summary.summary,
            "topics": Array(selectedTopics),
            "length": length.rawValue,
            "wordCount": length.rawValue,
            "audioUrl": summary.audioUrl ?? "",
            "sources": items.compactMap { $0.source }.filter { !$0.isEmpty }
        ]
        
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
            
            // Check if the most recent entry is a scheduled fetch
            guard mostRecent.id.hasPrefix("scheduled-") else {
                // Most recent is a manual fetch, so we shouldn't replace it
                // But if there's no current combined, we might want to load it anyway
                // Actually, manual fetches should already be on the homepage, so skip
                return
            }
            
            // The most recent entry is a scheduled fetch
            // Check if we should load it
            var shouldLoad = false
            
            if let currentCombined = combined {
                // If current summary is different, replace it with scheduled
                if currentCombined.id != mostRecent.id {
                    shouldLoad = true
                }
            } else {
                // No current summary, load the scheduled one
                shouldLoad = true
            }
            
            guard shouldLoad else { return }
            
            // Send notification that a new scheduled fetch is ready
            await sendScheduledFetchNotification(title: mostRecent.title)
            
            // Load the scheduled fetch to the homepage
            await MainActor.run {
                // Set combined summary
                combined = Combined(
                    id: mostRecent.id,
                    title: mostRecent.title,
                    summary: mostRecent.summary,
                    audioUrl: mostRecent.audioUrl
                )
                
                // Set last fetched topics from the scheduled fetch's topics
                lastFetchedTopics = Set(mostRecent.topics)
                
                // Convert sources to items if available
                if let sources = mostRecent.sources, !sources.isEmpty {
                    items = sources.enumerated().map { index, sourceItem in
                        Item(
                            id: sourceItem.id ?? "\(mostRecent.id)-source-\(index)",
                            title: sourceItem.title ?? sourceItem.source,
                            summary: sourceItem.summary ?? "",
                            url: sourceItem.url ?? "",
                            source: sourceItem.source,
                            topic: sourceItem.topic ?? mostRecent.topics.first ?? "",
                            audioUrl: nil
                        )
                    }
                } else {
                    items = []
                }
                
                // Reset player state for new summary
                resetPlayerState()
                
                print("✅ Loaded scheduled fetch '\(mostRecent.title)' to homepage")
            }
        } catch {
            print("Failed to check for scheduled fetch: \(error)")
        }
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
        let squashed = replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
        return squashed.trimmingCharacters(in: .whitespacesAndNewlines)
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
