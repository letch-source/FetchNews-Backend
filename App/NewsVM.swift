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
        didSet { 
            print("🎯 [TOPICS] selectedTopics didSet triggered")
            print("   Old: \(oldValue.sorted())")
            print("   New: \(selectedTopics.sorted())")
            print("   Stack trace: \(Thread.callStackSymbols.prefix(5).joined(separator: "\n   "))")
            debouncedSaveSettings() 
        }
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
    
    // Recommended topics (based on user's selected topics)
    @Published var recommendedTopics: [String] = []
    @Published var isUsingRecommendedFeed: Bool = false
    private var isLoadingRecommendedFeed: Bool = false
    @Published var isShowingRecommendedAfterFetch: Bool = false
    
    // Scheduled summaries (premium feature)
    @Published var scheduledSummaries: [ScheduledSummary] = []
    
    // Track if we've already loaded remote settings to avoid double-loading
    private var hasLoadedRemoteSettings = false

    // Guard flag: prevents saves from firing while clearUserState() is running
    // Without this, selectedTopics.removeAll() triggers debouncedSaveSettings()
    // which immediately writes [] to UserDefaults and schedules a remote save of []
    private var isResettingState = false

    private func normalizeTopic(_ topic: String) -> String {
        let lowercased = topic.lowercased()
        return ALL_TOPICS.contains(lowercased) ? lowercased : topic
    }

    private func normalizeTopics(_ topics: Set<String>) -> Set<String> {
        Set(topics.map { normalizeTopic($0) })
    }

    private func applyNormalizedTopics(_ topics: Set<String>, source: String) {
        let normalized = normalizeTopics(topics)
        if normalized != topics {
            print("🧹 [TOPICS] Normalized \(source) topics: \(topics.sorted()) -> \(normalized.sorted())")
        }
        selectedTopics = normalized
    }
    
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
    @Published var forceProgressBarReset: Bool = false // Signal to reset scrubbing state in UI
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
        print("🚀 [INIT] NewsVM initializing...")
        loadSettings()
        print("🚀 [INIT] After loadSettings - selectedTopics: \(selectedTopics.sorted())")
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
        ) { [weak self] notification in
            Task { @MainActor in
                print("🔑 [AUTH] userDidLogin notification received")

                // Immediately load topics from the authenticated user object
                // (The login response already contains the user's selectedTopics).
                // Use the user attached to the notification since NewsVM's weak
                // authVM back-reference isn't wired up yet this early in login.
                await self?.loadTopicsFromAuthUser(user: notification.object as? User)

                // Load new user's data when they log in
                await self?.initializeIfNeeded()
                await self?.checkForScheduledSummary()
            }
        }
        
        // Observe app lifecycle to force save when backgrounded
        #if canImport(UIKit)
        NotificationCenter.default.addObserver(
            forName: UIApplication.willResignActiveNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                print("📱 [LIFECYCLE] App will resign active - force saving preferences")
                self?.forceSaveWithBackgroundTask()
            }
        }

        NotificationCenter.default.addObserver(
            forName: UIApplication.didEnterBackgroundNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                print("📱 [LIFECYCLE] App entered background - force saving preferences")
                self?.forceSaveWithBackgroundTask()
            }
        }
        #endif
    }

    #if canImport(UIKit)
    /// Holds the background task identifier so the expiration handler can reference
    /// it even though it's assigned after beginBackgroundTask returns.
    private final class BackgroundTaskBox: @unchecked Sendable {
        var id: UIBackgroundTaskIdentifier = .invalid
    }

    /// Runs forceSaveSettings() inside a UIKit background task so iOS grants extra
    /// execution time for the network PUT to complete. Without this, the app can be
    /// suspended mid-request when backgrounding right after a topic change, leaving
    /// the backend with a stale value that then overwrites the newer local selection
    /// on the next launch (loadRemoteSettings trusts any non-empty backend value).
    private func forceSaveWithBackgroundTask() {
        let box = BackgroundTaskBox()
        box.id = UIApplication.shared.beginBackgroundTask(withName: "ForceSavePreferences") {
            UIApplication.shared.endBackgroundTask(box.id)
        }
        Task { @MainActor [weak self] in
            await self?.forceSaveSettings()
            if box.id != .invalid {
                UIApplication.shared.endBackgroundTask(box.id)
                box.id = .invalid
            }
        }
    }
    #endif
    
    // MARK: - Intents
    
    /// Load topics immediately from the authenticated user object
    /// This is called right after login to use the data already in the auth response.
    /// Accepts the user directly (from the userDidLogin notification) since the weak
    /// authVM back-reference may not be wired up yet this early in the login flow.
    func loadTopicsFromAuthUser(user: User? = nil) async {
        guard let user = user ?? authVM?.currentUser else {
            print("🔑 [AUTH] No authenticated user, cannot load topics")
            return
        }
        
        print("🔑 [AUTH] Loading topics from authenticated user")
        print("   User has \(user.selectedTopics.count) topics: \(user.selectedTopics.sorted())")
        
        // Set topics from user object
        if !user.selectedTopics.isEmpty {
            applyNormalizedTopics(Set(user.selectedTopics), source: "auth user")
            print("🔑 [AUTH] ✅ Set selectedTopics to: \(selectedTopics.sorted())")
            
            // Save to UserDefaults for next session
            saveLocalSettings()
            
            // Force UI update
            objectWillChange.send()
            print("🔑 [AUTH] 🔄 Triggered UI refresh")
        } else {
            print("🔑 [AUTH] User has no selected topics")
        }
    }
    
    func initializeIfNeeded() async {
        print("🔧 [INIT] initializeIfNeeded called - selectedTopics before: \(selectedTopics.sorted())")
        
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
            
            // Fetch recommended topics based on user's selected topics
            await fetchRecommendedTopics()
            await loadRecommendedTopicsFeedIfNeeded()

            // Load news sources for premium users in parallel
            if let authVM = authVM, authVM.currentUser?.isPremium == true {
                async let availableSourcesTask = loadAvailableNewsSources()
                async let excludedSourcesTask = loadExcludedNewsSources()
                async let scheduledSummariesTask = loadScheduledSummaries()
                await availableSourcesTask
                await excludedSourcesTask
                await scheduledSummariesTask
            }
        } else {
            // Not authenticated - just fetch trending topics (will update cache)
            await fetchTrendingTopics()
        }
        
        print("🔧 [INIT] initializeIfNeeded completed - selectedTopics after: \(selectedTopics.sorted())")
    }
    
    func toggle(_ topic: String) {
        if selectedTopics.contains(topic) { 
            selectedTopics.remove(topic)
            print("🔵 [TOPICS] Removed '\(topic)' from selectedTopics. Current: \(selectedTopics.sorted())")
        } else { 
            selectedTopics.insert(topic)
            print("🔵 [TOPICS] Added '\(topic)' to selectedTopics. Current: \(selectedTopics.sorted())")
        }
        isDirty = true
        
        // Refresh recommended topics when user changes their selection
        Task {
            await fetchRecommendedTopics()
            if selectedTopics.isEmpty {
                await loadRecommendedTopicsFeedIfNeeded()
            } else {
                await clearRecommendedFeedIfNeeded()
            }
        }
    }

    func setLength(_ l: ApiClient.Length) { 
        print("📝 setLength called: \(l.label) (\(l.rawValue))")
        length = l // This will trigger didSet and debouncedSaveSettings()
        isDirty = true 
    }
    
    func fetchAgain() async {
        // Re-fetch the last topics without mutating the user's current selections
        await fetch(using: lastFetchedTopics, force: true)
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
        print("⚙️ [SETTINGS] loadSettings called")
        print("   ApiClient.isAuthenticated: \(ApiClient.isAuthenticated)")
        print("   hasLoadedRemoteSettings: \(hasLoadedRemoteSettings)")
        
        // First, load from local UserDefaults as fallback
        loadLocalSettings()
        print("⚙️ [SETTINGS] After loadLocalSettings - selectedTopics: \(selectedTopics.sorted())")
        
        // If user is authenticated, try to load from backend
        if ApiClient.isAuthenticated {
            print("⚙️ [SETTINGS] User is authenticated, will load remote settings")
            Task {
                await loadRemoteSettings()
                print("⚙️ [SETTINGS] After loadRemoteSettings - selectedTopics: \(selectedTopics.sorted())")
            }
        } else {
            print("⚙️ [SETTINGS] User not authenticated, skipping remote settings (will load after login)")
        }
    }
    
    private func loadLocalSettings() {
        let defaults = UserDefaults.standard
        
        print("📲 [LOCAL LOAD] loadLocalSettings called")
        
        // Migrate old keys to new format if they exist
        let hasOldKeys = defaults.object(forKey: "playbackRate") != nil ||
                        defaults.string(forKey: "selectedVoice") != nil ||
                        defaults.object(forKey: "upliftingNewsOnly") != nil ||
                        defaults.array(forKey: "lastFetchedTopics") != nil
        
        if hasOldKeys {
            print("📲 [LOCAL] Migrating old keys to new format")
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
            print("📲 [LOCAL LOAD] Found \(savedSelectedTopics.count) topics in UserDefaults: \(savedSelectedTopics.sorted())")
            let normalized = normalizeTopics(Set(savedSelectedTopics))
            if normalized != Set(savedSelectedTopics) {
                print("📲 [LOCAL LOAD] Normalized local topics for persistence")
            }
            selectedTopics = normalized
            print("📲 [LOCAL LOAD] ✅ Set selectedTopics to: \(selectedTopics.sorted())")
            if normalized != Set(savedSelectedTopics) {
                saveLocalSettings()
            }
        } else {
            print("📲 [LOCAL LOAD] ⚠️ No saved selectedTopics in UserDefaults")
            print("📲 [LOCAL LOAD] Keeping selectedTopics unchanged - will load from backend if authenticated")
            // DON'T clear selectedTopics here - let remote settings handle it
            // selectedTopics will be loaded from backend in loadRemoteSettings() if user is authenticated
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
        // Prevent double-loading which causes race conditions
        // Note: This flag is reset on logout in clearUserState()
        print("⚙️ [SETTINGS] loadRemoteSettings called")
        print("   hasLoadedRemoteSettings: \(hasLoadedRemoteSettings)")
        print("   ApiClient.isAuthenticated: \(ApiClient.isAuthenticated)")
        
        guard !hasLoadedRemoteSettings else {
            print("⚙️ [SETTINGS] ⚠️ Skipping loadRemoteSettings - already loaded this session")
            return
        }
        
        guard ApiClient.isAuthenticated else {
            print("⚙️ [SETTINGS] ⚠️ Not authenticated, cannot load remote settings")
            return
        }
        
        print("⚙️ [SETTINGS] ✅ Loading remote settings (first time this session)")
        
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
            
            // Handle selectedTopics with smart merge: preserve local data if backend seems outdated
            let loadedTopics = preferences.selectedTopics ?? []
            let currentLocalTopics = selectedTopics // Current topics (loaded from UserDefaults in loadLocalSettings)
            
            print("📥 [LOAD] Backend has \(loadedTopics.count) topics: \(loadedTopics.sorted())")
            print("📥 [LOAD] Local has \(currentLocalTopics.count) topics: \(currentLocalTopics.sorted())")
            
            if loadedTopics.isEmpty && !currentLocalTopics.isEmpty {
                // Backend is empty but we have local data - keep local and sync to backend
                print("📥 [LOAD] ⚠️ Backend selectedTopics is empty, but local has \(currentLocalTopics.count) topics. Keeping local and will sync to backend.")
                print("📥 [LOAD] Local topics being preserved: \(currentLocalTopics.sorted())")
                // selectedTopics already has local data, don't overwrite
                // Mark that we need to sync to backend
                isDirty = true
                // Schedule a sync to backend to fix the discrepancy (immediate, not debounced)
                Task {
                    print("🔄 [SYNC] Force syncing local topics to backend")
                    await self.forceSaveSettings()
                }
            } else if loadedTopics.count > 0 {
                // Backend has data - use it as source of truth (ALWAYS trust backend over empty local)
                let loadedSet = Set(loadedTopics)
                let normalized = normalizeTopics(loadedSet)
                selectedTopics = normalized
                print("📥 [LOAD] ✅ Loaded \(loadedTopics.count) selectedTopics from backend: \(loadedTopics.sorted())")
                if normalized != loadedSet {
                    Task {
                        print("🧹 [LOAD] Normalized backend topics - syncing back to backend")
                        await saveRemoteSettings()
                    }
                }
                // Also update UserDefaults cache for faster next load
                saveLocalSettings()
                // Force UI refresh to ensure views update
                objectWillChange.send()
                print("📥 [LOAD] 🔄 Triggered UI refresh")
            } else {
                // Both are empty - this is fine for new users OR after rebuild (will load from backend on next load)
                print("📥 [LOAD] ⚠️ Both backend and local selectedTopics are empty")
                print("📥 [LOAD]   This could be: 1) New user, 2) Fresh rebuild, 3) Backend save failed previously")
            }
            
            excludedNewsSources = Set(preferences.excludedNewsSources)

            // Cache backend values locally for offline use and faster subsequent loads
            // This ensures local settings are available if backend is temporarily unavailable
            saveLocalSettings()
            
            // Mark as successfully loaded after all processing is complete
            hasLoadedRemoteSettings = true
            print("⚙️ [SETTINGS] ✅ Remote settings loaded successfully")
        } catch {
            print("⚙️ [SETTINGS] ❌ Failed to load remote settings: \(error)")
            // Backend unavailable - fall back to local settings (already loaded in loadLocalSettings())
            // This ensures the app works offline and settings persist even when backend is down
            // Don't set hasLoadedRemoteSettings = true so we can retry next time
        }
    }
    
    // Debounced save to reduce API calls
    private func debouncedSaveSettings() {
        // Skip all saves while clearUserState() is running — we don't want
        // an empty selectedTopics (or any other cleared state) persisted to
        // UserDefaults or the backend during a logout/reset.
        guard !isResettingState else { return }

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
    
    /// Force save settings immediately (used when app is backgrounded)
    func forceSaveSettings() async {
        print("🔥 [FORCE SAVE] Force saving preferences immediately")
        print("   Current selectedTopics: \(selectedTopics.sorted())")
        print("   Authenticated: \(ApiClient.isAuthenticated)")
        
        // Cancel any pending debounced save
        saveSettingsTask?.cancel()
        saveSettingsTask = nil
        
        // Save to local immediately
        saveLocalSettings()
        
        // Save to backend immediately if authenticated
        if ApiClient.isAuthenticated {
            await saveRemoteSettings()
        } else {
            print("🔥 [FORCE SAVE] ⚠️ Not authenticated, skipping backend save")
        }
        
        print("🔥 [FORCE SAVE] ✅ Force save completed")
    }
    
    private func saveLocalSettings() {
        let defaults = UserDefaults.standard
        
        print("💾 [LOCAL SAVE] saveLocalSettings called")
        print("   selectedTopics to save: \(selectedTopics.sorted())")

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
        let topicsArray = Array(selectedTopics).sorted()
        defaults.set(topicsArray, forKey: "FetchNews_selectedTopics")
        defaults.synchronize() // Force immediate write
        
        // Verify it was saved
        if let verified = defaults.array(forKey: "FetchNews_selectedTopics") as? [String] {
            print("💾 [LOCAL SAVE] ✅ Saved and verified selectedTopics to UserDefaults: \(verified)")
        } else {
            print("💾 [LOCAL SAVE] ❌ WARNING: Could not verify save to UserDefaults!")
        }
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
                selectedCountry: selectedCountry
            )
            
            print("💾 [SAVE] Saving preferences to backend - selectedTopics: \(Array(selectedTopics).sorted())")
            let updated = try await ApiClient.updateUserPreferences(preferences)
            print("✅ [SAVE] Backend confirmed selectedTopics saved: \(updated.selectedTopics?.sorted() ?? [])")
        } catch {
            print("❌ [SAVE] Failed to save preferences to backend: \(error.localizedDescription)")
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
    func fetch(using topicsOverride: Set<String>? = nil, force: Bool = false) async {
        let topicsToFetch = topicsOverride ?? selectedTopics
        guard !topicsToFetch.isEmpty, phase == .idle, (isDirty || force) else { return }
        isShowingRecommendedAfterFetch = false

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
            topics: Array(topicsToFetch),
            wordCount: length.rawValue,
            skipTTS: false, // Backend will generate a combined audio track
            goodNewsOnly: upliftingNewsOnly,
            country: selectedCountry
        )

                // Handle empty or missing summary
                let rawSummary = resp.combined?.summary ?? resp.items.first?.summary ?? ""
                // Note: Don't call htmlStripped() on combined summary - it's already plain text from ChatGPT
                // and htmlStripped() can destroy paragraph breaks (\n\n)
                let cleanedCombinedSummary = rawSummary.isEmpty ? "(No summary provided.)" : rawSummary.condenseWhitespace()

                let summaryTitle = (resp.combined?.title ?? "Summary").condenseWhitespace()
                
                // Only create combined if we have actual content
                if !cleanedCombinedSummary.isEmpty && cleanedCombinedSummary != "(No summary provided.)" {
                    print("📱 NewsVM: Creating Combined with \(resp.combined?.topicSections?.count ?? 0) topicSections")
                    if let sections = resp.combined?.topicSections {
                        for (i, section) in sections.enumerated() {
                            print("   📱 Section \(i): \(section.topic) - \(section.articles.count) articles, audioUrl: \(section.audioUrl != nil ? "YES" : "NO")")
                        }
                    } else {
                        print("   📱 WARNING: No topicSections in response!")
                    }
                    self.combined = Combined(
                        id: resp.combined?.id ?? resp.items.first?.id ?? "combined",
                        title: summaryTitle,
                        summary: cleanedCombinedSummary,
                        audioUrl: resp.combined?.audioUrl,
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

                // Prepare combined audio if available
                if let audioUrl = self.combined?.audioUrl, !audioUrl.isEmpty {
                    self.prepareAudio(urlString: audioUrl, title: summaryTitle)
                } else {
                    self.resetPlayerState()
                }
                self.currentTopicAudioUrl = nil
                
                // Record the voice used for this summary
                self.currentSummaryVoice = self.selectedVoice
                self.needsNewAudio = false
                
                // Check if app is still in foreground after fetch completes
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

                isDirty = false
                
                // Save summary to history only on success
                await saveSummaryToHistory()
                
                // Store the topics that were used for this summary before deselecting
                lastFetchedTopics = topicsToFetch
                
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
                
                // NOTE: Do NOT clear selectedTopics anymore
                // Selected topics should persist for scheduled 6AM/6PM fetches
                // Users manage their topics via the Topics tab
                
                // Refresh recommended topics (lightweight names for HomeView)
                await fetchRecommendedTopics()
                
                // Replace timestamps/playback with recommended topics after fetch
                _ = await playRecommendedTopicsAfterFetch()
                
                // No per-topic feed: skip fetching recommended summaries
                
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
        // Cancel any in-flight or pending saves FIRST so they don't
        // overwrite good data on the backend or leave stale [] in UserDefaults.
        currentTask?.cancel()
        currentTask = nil
        saveSettingsTask?.cancel()
        saveSettingsTask = nil

        // Suppress all saves triggered by @Published property changes below.
        // Without this guard, selectedTopics.removeAll() immediately calls
        // debouncedSaveSettings() -> saveLocalSettings() -> writes [] to
        // UserDefaults, which causes topics to be lost on the next login.
        isResettingState = true
        defer { isResettingState = false }

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

        // Reset remote settings loaded flag so next user can load their settings
        hasLoadedRemoteSettings = false

        // Clear voice preview
        voicePreviewPlayer?.pause()
        voicePreviewPlayer = nil
        isPlayingVoicePreview = false

        // Explicitly wipe the per-user UserDefaults keys so the next login
        // loads fresh data from the backend rather than the previous user's cache.
        let defaults = UserDefaults.standard
        defaults.removeObject(forKey: "FetchNews_selectedTopics")
        defaults.removeObject(forKey: "FetchNews_lastFetchedTopics")
        defaults.removeObject(forKey: "FetchNews_excludedNewsSources")
    }
    
    // MARK: - Audio
    private func resetPlayerState() {
        print("🔄 resetPlayerState called")
        
        // Remove time observer first to stop any further updates
        if let p = player, let token = timeObserverToken {
            print("   Removing time observer")
            p.removeTimeObserver(token)
            timeObserverToken = nil
        }
        
        // Remove end observer
        if let endObs = endObserver {
            print("   Removing end observer")
            NotificationCenter.default.removeObserver(endObs)
            endObserver = nil
        }
        
        // Pause and clear player
        player?.pause()
        player = nil
        
        // Reset all state
        canPlay = false
        isPlaying = false
        nowPlayingTitle = ""
        currentTime = 0
        duration = 0
        
        print("   ✅ State reset complete - currentTime: \(currentTime), duration: \(duration)")
        
        // Force UI update
        objectWillChange.send()
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
        print("🎵 prepareAudio called")
        print("   urlString: \(urlString)")
        print("   title: \(title)")
        
        guard let url = resolveAudioURL(urlString) else {
            print("   ❌ Invalid audio URL:", urlString)
            canPlay = false
            return
        }
        
        print("   ✅ Resolved URL: \(url)")
        
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [])
            try AVAudioSession.sharedInstance().setActive(true)
            print("   ✅ Audio session configured")
        } catch {
            print("   ❌ AVAudioSession error:", error)
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
        
        // Explicitly reset time values to ensure UI shows 0:00
        currentTime = 0
        duration = 0
        
        // Force immediate UI update to show reset state
        objectWillChange.send()
        
        print("   ✅ Audio prepared - canPlay: \(canPlay)")

        // Observe time for progress bar
        timeObserverToken = p.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: 0.5, preferredTimescale: 600),
            queue: .main
        ) { [weak self] time in
            Task { @MainActor in
                guard let self = self else { return }
                let newTime = time.seconds
                
                // Only update if the new time is valid
                if newTime.isFinite && newTime >= 0 {
                    self.currentTime = newTime
                }
                
                if let dur = p.currentItem?.duration.seconds, dur.isFinite && dur > 0 {
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
                print("🎵 Audio playback ended")
                print("   Duration was: \(self.duration)")
                
                self.isPlaying = false
                self.currentTime = self.duration // Show at end momentarily
                self.updateNowPlaying(isPlaying: false)
                
                print("   ⏭️ Triggering auto-scroll to next topic")
                
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
        print("🎵 playPause() called")
        print("   Current state: isPlaying=\(isPlaying), canPlay=\(canPlay)")
        print("   Player exists: \(player != nil)")
        
        // Stop any voice preview first
        voicePreviewPlayer?.pause()
        voicePreviewPlayer = nil
        isPlayingVoicePreview = false
        
        if player == nil {
            let fallbackAudioUrl = currentTopicAudioUrl
                ?? combined?.audioUrl
                ?? combined?.topicSections?.first?.audioUrl
            let fallbackTitle = currentTopicAudioUrl != nil
                ? (combined?.topicSections?.first?.topic.capitalized ?? nowPlayingTitle)
                : (combined?.title ?? nowPlayingTitle)
            
            if let audioUrl = fallbackAudioUrl, !audioUrl.isEmpty {
                print("   🔄 No player - preparing fallback audio")
                prepareAudio(urlString: audioUrl, title: fallbackTitle.isEmpty ? "Summary" : fallbackTitle)
            }
        }
        
        guard let p = player else {
            print("   ⚠️ No player available!")
            return
        }
        
        if isPlaying {
            print("   ⏸️ Pausing audio")
            p.pause()
            isPlaying = false
            updateNowPlaying(isPlaying: false)
        } else {
            print("   ▶️ Playing audio at rate \(playbackRate)")
            p.play()
            p.rate = Float(playbackRate)
            isPlaying = true
            updateNowPlaying(isPlaying: true)
            print("   ✅ Audio started - isPlaying=\(isPlaying)")
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
    
    /// Ensure combined summary audio is prepared and active (for timestamp seeking).
    func switchToCombinedAudio(autoPlay: Bool = false) {
        guard let audioUrl = combined?.audioUrl, !audioUrl.isEmpty else {
            print("⚠️ No combined audio available")
            return
        }
        
        let title = combined?.title.isEmpty == false ? combined!.title : "Summary"
        
        if currentTopicAudioUrl != nil || player == nil || !canPlay || nowPlayingTitle != title {
            currentTopicAudioUrl = nil
            prepareAudio(urlString: audioUrl, title: title)
        }
        
        if autoPlay {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
                self?.playPause()
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
        print("⏹️ stopTopicAudio called")
        print("   Current state - isPlaying: \(isPlaying), currentTime: \(currentTime)")
        
        if isPlaying {
            player?.pause()
            isPlaying = false
            updateNowPlaying(isPlaying: false)
        }
        
        // Reset time to 0 when stopping (prevents bar staying at end)
        currentTime = 0
        
        print("   ✅ Stopped - currentTime reset to: \(currentTime)")
        
        // Force UI update
        objectWillChange.send()
    }
    
    /// Switch to a different topic's audio
    func switchToTopicAudio(for topicSection: TopicSection, autoPlay: Bool = false) {
        print("🎵 switchToTopicAudio called for: \(topicSection.topic)")
        print("   Has audioUrl: \(topicSection.audioUrl != nil)")
        print("   Current audioUrl: \(currentTopicAudioUrl ?? "nil")")
        print("   Current isPlaying: \(isPlaying), canPlay: \(canPlay)")
        print("   Current time: \(currentTime), duration: \(duration)")
        print("   autoPlay: \(autoPlay)")
        
        guard let audioUrl = topicSection.audioUrl else {
            print("   ⚠️ No audio URL, returning")
            return
        }
        
        print("   New Audio URL: \(audioUrl)")
        
        // Only switch if it's a different audio URL
        if currentTopicAudioUrl != audioUrl {
            print("   ✅ Different URL detected - switching audio")
            
            // FIRST: Signal UI to reset any scrubbing state BEFORE changing anything else
            print("   🔄 Step 1: Signaling UI to reset scrubbing state...")
            forceProgressBarReset.toggle()
            print("   🔄 Toggled forceProgressBarReset to: \(forceProgressBarReset)")
            
            // SECOND: Stop current audio and explicitly reset ALL state
            print("   🔄 Step 2: Stopping current audio and resetting state...")
            stopTopicAudio()
            
            // THIRD: Explicitly reset time values
            print("   🔄 Step 3: Resetting time values...")
            currentTime = 0
            duration = 0
            canPlay = false
            isPlaying = false
            
            print("   ✅ State reset complete - currentTime: \(currentTime), duration: \(duration)")
            
            // Force UI update
            objectWillChange.send()
            
            // Small delay to let UI process the reset
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { [weak self] in
                guard let self = self else { return }
                
                // Prepare new audio
                print("   Preparing new audio...")
                self.prepareAudio(urlString: audioUrl, title: topicSection.topic.capitalized)
                self.currentTopicAudioUrl = audioUrl
                
                print("   ✅ After prepareAudio - canPlay: \(self.canPlay), isPlaying: \(self.isPlaying)")
                print("   After prepareAudio - currentTime: \(self.currentTime), duration: \(self.duration)")
                
                // Always auto-play when explicitly requested
                if autoPlay {
                    print("   🎵 Auto-play requested - will start playback in 0.4s")
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in
                        guard let self = self else { return }
                        print("   🎵 Starting playback now - isPlaying before: \(self.isPlaying)")
                        if !self.isPlaying {
                            self.playPause()
                            print("   🎵 Playback started - isPlaying after: \(self.isPlaying)")
                        } else {
                            print("   ⚠️ Already playing, skipping playPause")
                        }
                    }
                } else {
                    print("   ℹ️ Auto-play NOT requested")
                }
            }
        } else {
            print("   ⚠️ Same URL detected")
            // Even if same URL, reset to beginning if autoPlay is requested
            if autoPlay {
                print("   🔄 Same URL but autoPlay requested - seeking to start")
                currentTime = 0
                duration = player?.currentItem?.duration.seconds ?? 0
                seek(to: 0)
                objectWillChange.send()
                if !isPlaying {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
                        self?.playPause()
                    }
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
    
    // MARK: - Custom Topics Management
    
    func loadCustomTopics() async {
        do {
            let topics = try await ApiClient.getCustomTopics()
            await MainActor.run {
                self.customTopics = topics
                // Don't merge with selectedTopics - they're separate concepts
                // customTopics = user's saved topics
                // selectedTopics = topics user wants to fetch
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
                // When adding from discovery, ALSO add to selectedTopics so it's actively fetched
                // User can later unselect it if they don't want it fetched
                self.selectedTopics.insert(topic)
            }
            // Save to backend preferences immediately to persist selectedTopics
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
                // When removing a custom topic, also remove from selectedTopics
                // (user is removing it from their library entirely)
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
    
    func fetchRecommendedTopics() async {
        print("🌟 [RECOMMENDED] fetchRecommendedTopics called - selectedTopics: \(selectedTopics.sorted()), authenticated: \(ApiClient.isAuthenticated)")

        // Only fetch if user is authenticated
        guard ApiClient.isAuthenticated else {
            print("🌟 [RECOMMENDED] Skipping - user not authenticated")
            await MainActor.run {
                self.recommendedTopics = []
            }
            return
        }

        do {
            print("🌟 [RECOMMENDED] Fetching from backend...")
            let response = try await ApiClient.getRecommendedTopicNames()
            await MainActor.run {
                self.recommendedTopics = response.recommendedTopics
                print("🌟 [RECOMMENDED] ✅ Fetched \(self.recommendedTopics.count) recommended topics: \(self.recommendedTopics.joined(separator: ", "))")
            }
        } catch {
            print("🌟 [RECOMMENDED] ❌ Failed to fetch recommended topics: \(error)")
            // On error, clear recommended topics
            await MainActor.run {
                self.recommendedTopics = []
            }
        }
    }

    private func playRecommendedTopicsAfterFetch() async -> Bool {
        guard ApiClient.isAuthenticated else { return false }
        
        let recommendedNames: [String]
        do {
            let response = try await ApiClient.getRecommendedTopicNames()
            recommendedNames = response.recommendedTopics
        } catch {
            print("🌟 [RECOMMENDED] ❌ Failed to load recommended names after fetch: \(error)")
            return false
        }
        
        guard !recommendedNames.isEmpty else { return false }
        
        do {
            let resp = try await ApiClient.summarize(
                topics: recommendedNames,
                wordCount: length.rawValue,
                skipTTS: false,
                goodNewsOnly: upliftingNewsOnly,
                country: selectedCountry
            )
            
            let rawSummary = resp.combined?.summary ?? resp.items.first?.summary ?? ""
            let cleanedCombinedSummary = rawSummary.isEmpty ? "(No summary provided.)" : rawSummary.condenseWhitespace()
            let summaryTitle = (resp.combined?.title ?? "Recommended").condenseWhitespace()
            
            guard !cleanedCombinedSummary.isEmpty && cleanedCombinedSummary != "(No summary provided.)" else {
                return false
            }
            
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
            
            await MainActor.run {
                self.resetPlayerState()
                self.combined = Combined(
                    id: resp.combined?.id ?? "recommended-\(UUID().uuidString)",
                    title: summaryTitle,
                    summary: cleanedCombinedSummary,
                    audioUrl: resp.combined?.audioUrl,
                    topicSections: resp.combined?.topicSections
                )
                self.items = processedItems
                self.fetchCreatedAt = Date()
                self.currentTopicIndex = 0
                self.currentTopicAudioUrl = nil
                self.nowPlayingTitle = summaryTitle
                self.recommendedTopics = recommendedNames
                self.isShowingRecommendedAfterFetch = true
            }
            
            if let audioUrl = resp.combined?.audioUrl, !audioUrl.isEmpty {
                prepareAudio(urlString: audioUrl, title: summaryTitle)
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
                    self?.playPause()
                }
            } else {
                resetPlayerState()
            }
            
            return true
        } catch {
            print("🌟 [RECOMMENDED] ❌ Failed to load recommended after fetch: \(error)")
            return false
        }
    }

    func loadRecommendedTopicsFeedIfNeeded() async {
        guard selectedTopics.isEmpty else { return }
        guard ApiClient.isAuthenticated else { return }
        guard !isLoadingRecommendedFeed else { return }
        if isUsingRecommendedFeed, combined?.audioUrl != nil {
            return
        }

        isLoadingRecommendedFeed = true
        defer { isLoadingRecommendedFeed = false }

        do {
            let namesResponse = try await ApiClient.getRecommendedTopicNames()
            let recommendedNames = namesResponse.recommendedTopics
            await MainActor.run {
                guard !recommendedNames.isEmpty else {
                    self.isUsingRecommendedFeed = false
                    return
                }
                self.recommendedTopics = recommendedNames
            }

            let resp = try await ApiClient.summarize(
                topics: recommendedNames,
                wordCount: length.rawValue,
                skipTTS: false,
                goodNewsOnly: upliftingNewsOnly,
                country: selectedCountry
            )

            let rawSummary = resp.combined?.summary ?? resp.items.first?.summary ?? ""
            let cleanedCombinedSummary = rawSummary.isEmpty ? "(No summary provided.)" : rawSummary.condenseWhitespace()
            let summaryTitle = (resp.combined?.title ?? "Recommended").condenseWhitespace()

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

            await MainActor.run {
                guard !cleanedCombinedSummary.isEmpty && cleanedCombinedSummary != "(No summary provided.)" else {
                    self.isUsingRecommendedFeed = false
                    self.combined = nil
                    self.items = []
                    self.fetchCreatedAt = nil
                    self.resetPlayerState()
                    return
                }

                // Replace any stale summary with a recommended feed.
                self.resetPlayerState()
                self.combined = Combined(
                    id: resp.combined?.id ?? "recommended-\(UUID().uuidString)",
                    title: summaryTitle,
                    summary: cleanedCombinedSummary,
                    audioUrl: resp.combined?.audioUrl,
                    topicSections: resp.combined?.topicSections
                )
                self.items = processedItems
                self.fetchCreatedAt = Date()
                self.currentTopicIndex = 0
                self.currentTopicAudioUrl = nil
                self.nowPlayingTitle = summaryTitle
                self.isUsingRecommendedFeed = true
                if let audioUrl = resp.combined?.audioUrl, !audioUrl.isEmpty {
                    self.prepareAudio(urlString: audioUrl, title: summaryTitle)
                }
            }
        } catch {
            print("🌟 [RECOMMENDED] ❌ Failed to load recommended feed: \(error)")
        }
    }

    private func clearRecommendedFeedIfNeeded() async {
        guard isUsingRecommendedFeed else { return }
        await MainActor.run {
            self.isUsingRecommendedFeed = false
            self.combined = nil
            self.items = []
            self.fetchCreatedAt = nil
            self.currentTopicIndex = 0
            self.currentTopicAudioUrl = nil
            self.nowPlayingTitle = ""
            self.resetPlayerState()
        }
    }
    
    func fetchRecommendedTopicSummaries() async {
        print("🌟 [RECOMMENDED SUMMARIES] Starting background fetch - selectedTopics: \(selectedTopics.sorted())")
        
        // Only fetch if user has selected topics
        guard !selectedTopics.isEmpty else {
            print("🌟 [RECOMMENDED SUMMARIES] Skipping - no selected topics")
            return
        }
        
        // Skip if user has too many topics (backend timeout risk)
        guard selectedTopics.count < 6 else {
            print("🌟 [RECOMMENDED SUMMARIES] Skipping - user has \(selectedTopics.count) topics (too many for recommendations)")
            return
        }
        
        // Only fetch if we have a current summary
        guard combined != nil else {
            print("🌟 [RECOMMENDED SUMMARIES] Skipping - no current summary")
            return
        }
        
        // Only fetch if user is authenticated
        guard ApiClient.isAuthenticated else {
            print("🌟 [RECOMMENDED SUMMARIES] Skipping - user not authenticated")
            return
        }
        
        do {
            // Get recommended topic names first
            print("🌟 [RECOMMENDED SUMMARIES] Getting topic names...")
            let response = try await ApiClient.getRecommendedTopicNames()
            let recommendedNames = Array(response.recommendedTopics.prefix(3))
            
            guard !recommendedNames.isEmpty else {
                print("🌟 [RECOMMENDED SUMMARIES] No recommendations available")
                return
            }
            
            print("🌟 [RECOMMENDED SUMMARIES] Fetching summaries for: \(recommendedNames.joined(separator: ", "))")
            
            // Add delay to ensure user's topics are already loaded
            try? await Task.sleep(nanoseconds: 2_000_000_000) // 2 seconds
            
            // Fetch full summaries for recommended topics
            let recommendedResp = try await ApiClient.summarize(
                topics: recommendedNames,
                wordCount: length.rawValue,
                skipTTS: false,
                goodNewsOnly: upliftingNewsOnly,
                country: selectedCountry
            )
            
            // Check if we still have the same summary (user didn't fetch again)
            guard let currentCombined = combined, currentCombined.id == combined?.id else {
                print("🌟 [RECOMMENDED SUMMARIES] Summary changed, aborting")
                return
            }
            
            // Get the new recommended topic sections
            let newRecommendedSections = recommendedResp.combined?.topicSections ?? []
            
            guard !newRecommendedSections.isEmpty else {
                print("🌟 [RECOMMENDED SUMMARIES] No topic sections in response")
                return
            }
            
            print("🌟 [RECOMMENDED SUMMARIES] ✅ Got \(newRecommendedSections.count) recommended summaries")
            
            // Append to existing topic sections by creating a new Combined
            await MainActor.run {
                if let existingCombined = self.combined,
                   var existingSections = existingCombined.topicSections {
                    existingSections.append(contentsOf: newRecommendedSections)
                    
                    // Create new Combined with updated sections
                    self.combined = Combined(
                        id: existingCombined.id,
                        title: existingCombined.title,
                        summary: existingCombined.summary,
                        audioUrl: existingCombined.audioUrl,
                        topicSections: existingSections
                    )
                    print("🌟 [RECOMMENDED SUMMARIES] ✅ Appended to feed - now have \(existingSections.count) total topics")
                }
            }
        } catch {
            print("🌟 [RECOMMENDED SUMMARIES] ❌ Failed: \(error)")
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
    
    // MARK: - Scheduled Summaries Management
    
    func loadScheduledSummaries() async {
        do {
            let summaries = try await ApiClient.getScheduledSummaries()
            await MainActor.run {
                self.scheduledSummaries = summaries
            }
        } catch {
            print("Failed to load scheduled summaries: \(error)")
            // Silently fail - scheduled summaries are optional
        }
    }
    
    func createScheduledSummary(_ summary: ScheduledSummary) async throws -> ScheduledSummary {
        let created = try await ApiClient.createScheduledSummary(summary)
        await MainActor.run {
            self.scheduledSummaries.append(created)
        }
        return created
    }
    
    func updateScheduledSummary(_ summary: ScheduledSummary) async throws -> ScheduledSummary {
        let updated = try await ApiClient.updateScheduledSummary(summary)
        await MainActor.run {
            if let index = self.scheduledSummaries.firstIndex(where: { $0.id == summary.id }) {
                self.scheduledSummaries[index] = updated
            }
        }
        return updated
    }
    
    func deleteScheduledSummary(id: String) async throws {
        try await ApiClient.deleteScheduledSummary(id: id)
        await MainActor.run {
            self.scheduledSummaries.removeAll { $0.id == id }
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
        
        // Include topicSections if available (per-topic summaries with individual audio)
        if let topicSections = summary.topicSections {
            let topicSectionsData: [[String: Any]] = topicSections.map { section in
                var sectionDict: [String: Any] = [
                    "id": section.id,
                    "topic": section.topic,
                    "summary": section.summary
                ]
                
                // Include audioUrl if available
                if let audioUrl = section.audioUrl, !audioUrl.isEmpty {
                    sectionDict["audioUrl"] = audioUrl
                }
                
                // Include articles
                let articlesData: [[String: Any]] = section.articles.map { article in
                    var articleDict: [String: Any] = [
                        "id": article.id,
                        "title": article.title,
                        "summary": article.summary
                    ]
                    if let source = article.source {
                        articleDict["source"] = source
                    }
                    if let url = article.url {
                        articleDict["url"] = url
                    }
                    if let topic = article.topic {
                        articleDict["topic"] = topic
                    }
                    return articleDict
                }
                sectionDict["articles"] = articlesData
                
                return sectionDict
            }
            summaryData["topicSections"] = topicSectionsData
            print("💾 Saving \(topicSections.count) topicSections to history")
        } else {
            print("⚠️ No topicSections to save")
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

            if selectedTopics.isEmpty {
                await loadRecommendedTopicsFeedIfNeeded()
                return
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
            // Set combined summary with topicSections if available
            print("📥 Loading from history: \(entry.title)")
            print("   topicSections: \(entry.topicSections?.count ?? 0)")
            combined = Combined(
                id: entry.id,
                title: entry.title,
                summary: entry.summary,
                audioUrl: entry.audioUrl,
                topicSections: entry.topicSections // Now includes topicSections!
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
