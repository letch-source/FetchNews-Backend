//
//  NewsVM.swift
//  FetchNews
//
//  Created by Finlay Smith on 8/14/25.
//

import Foundation
import AVFoundation
import MediaPlayer
#if canImport(UIKit)
import UIKit
#endif

@MainActor
final class NewsVM: ObservableObject {
    enum Phase: String { case idle, gather, summarize, tts }

    // Selection & state
    @Published var selectedTopics: Set<String> = []
    @Published var length: ApiClient.Length = .short
    @Published var phase: Phase = .idle
    @Published var isBusy: Bool = false
    @Published var isDirty: Bool = true
    
    // Reference to AuthVM for checking user limits
    weak var authVM: AuthVM?
    
    // Custom topics (synced with backend)
    @Published var customTopics: [String] = []
    
    // User location
    @Published var userLocation: String = ""
    
    // Subscription UI
    @Published var showingSubscriptionView: Bool = false
    
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

    @Published var canPlay: Bool = false
    @Published var isPlaying: Bool = false
    @Published var nowPlayingTitle: String = ""

    // Timing (for progress bar)
    @Published var currentTime: Double = 0     // seconds
    @Published var duration: Double = 0        // seconds

    // Settings
    @Published var playbackRate: Double = 1.0
    @Published var selectedVoice: String = "Alloy"
    @Published var upliftingNewsOnly: Bool = false
    
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

    // MARK: - Intents
    func initializeIfNeeded() async {
        // Any heavy initialization that was previously done in init
        // This runs after the UI is shown, improving launch performance
        loadCachedVoiceIntroductions()
        
        // Only load custom topics if user is authenticated
        // This prevents unnecessary network calls during app startup
        if ApiClient.isAuthenticated {
            await loadCustomTopics()
        }
    }
    
    func toggle(_ topic: String) {
        if selectedTopics.contains(topic) { selectedTopics.remove(topic) }
        else { selectedTopics.insert(topic) }
        isDirty = true
    }

    func setLength(_ l: ApiClient.Length) { length = l; isDirty = true }
    
    
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

    func setPlaybackRate(_ r: Double) {
        playbackRate = r
        if let p = player, p.timeControlStatus == .playing {
            p.rate = Float(r)
            updateNowPlaying(isPlaying: true)
        }
    }
    
    func setVoice(_ v: String) {
        print("🔊 setVoice called: '\(v)'")
        print("🔊 Current selectedVoice: '\(selectedVoice)'")
        print("🔊 Current currentSummaryVoice: '\(currentSummaryVoice)'")
        print("🔊 Has combined summary: \(combined != nil)")
        print("🔊 Current needsNewAudio: \(needsNewAudio)")
        
        selectedVoice = v
        
        // Check if we have a current summary
        if combined != nil {
            if currentSummaryVoice != v {
                // Voice changed to a different voice - need new audio
                needsNewAudio = true
                print("🔊 Voice changed from '\(currentSummaryVoice)' to '\(v)', needsNewAudio set to true")
            } else {
                // Voice changed back to the original voice - no need for new audio
                needsNewAudio = false
                print("🔊 Voice changed back to original '\(currentSummaryVoice)', needsNewAudio set to false")
            }
        } else {
            print("🔊 No summary present, keeping needsNewAudio as \(needsNewAudio)")
        }
        
        print("🔊 Final needsNewAudio: \(needsNewAudio)")
        isDirty = true
    }
    
    func setUpliftingNewsOnly(_ enabled: Bool) {
        upliftingNewsOnly = enabled
        isDirty = true
    }
    
    func testVoice() async {
        print("🎵 Testing voice: \(selectedVoice)")
        
        // Stop any current voice preview
        voicePreviewPlayer?.pause()
        voicePreviewPlayer = nil
        isPlayingVoicePreview = false
        
        // Check if we have a cached introduction for this voice
        if let cachedUrl = cachedVoiceIntroductions[selectedVoice] {
            print("🎵 Using cached voice introduction for: \(selectedVoice)")
            // Play cached introduction
            await playCachedVoiceIntroduction(url: cachedUrl)
            return
        }
        
        // Generate new voice introduction
        let introductionText = "Hi, I'm \(selectedVoice), your personal news presenter."
        print("🎵 Generating new voice introduction: '\(introductionText)'")
        
        do {
            let url = try await ApiClient.tts(text: introductionText, voice: selectedVoice, speed: 1.0)
            if let audioUrl = url {
                print("🎵 Voice test generated successfully for: \(selectedVoice)")
                print("🎵 Audio URL from API: \(audioUrl)")
                
                // Cache the introduction
                cachedVoiceIntroductions[selectedVoice] = audioUrl
                saveCachedVoiceIntroductions()
                
                // Play the introduction
                await playCachedVoiceIntroduction(url: audioUrl)
            } else {
                print("🎵 Voice test failed - no audio URL returned for: \(selectedVoice)")
            }
        } catch {
            print("🎵 Failed to generate voice test for \(selectedVoice): \(error)")
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
        print("🎵 Playing cached voice introduction from: \(url)")
        
        // Check if URL is valid
        guard let audioUrl = URL(string: url) else { 
            print("🎵 Invalid audio URL: \(url)")
            return 
        }
        
        print("🎵 Audio URL components:")
        print("🎵   - Scheme: \(audioUrl.scheme ?? "nil")")
        print("🎵   - Host: \(audioUrl.host ?? "nil")")
        print("🎵   - Path: \(audioUrl.path)")
        print("🎵   - Full URL: \(audioUrl.absoluteString)")
        
        let playerItem = AVPlayerItem(url: audioUrl)
        voicePreviewPlayer = AVPlayer(playerItem: playerItem)
        
        // Set up error observer
        NotificationCenter.default.addObserver(
            forName: .AVPlayerItemFailedToPlayToEndTime,
            object: playerItem,
            queue: .main
        ) { [weak self] notification in
            print("🎵 Voice preview failed to play")
            if let error = notification.userInfo?[AVPlayerItemFailedToPlayToEndTimeErrorKey] as? Error {
                print("🎵 Playback error: \(error.localizedDescription)")
            }
            self?.isPlayingVoicePreview = false
            self?.voicePreviewPlayer = nil
        }
        
        // Set up completion observer
        NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: playerItem,
            queue: .main
        ) { [weak self] _ in
            print("🎵 Voice preview finished playing")
            self?.isPlayingVoicePreview = false
            self?.voicePreviewPlayer = nil
        }
        
        // Play the introduction
        isPlayingVoicePreview = true
        voicePreviewPlayer?.play()
        print("🎵 Voice preview started playing")
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
            lastError = "You've reached your daily limit of 1 summary. Upgrade to Premium for unlimited access."
            return
        }
        
        // Cancel any existing request
        currentTask?.cancel()
        
        currentTask = Task {
            isBusy = true; phase = .gather
            combined = nil; items = []; resetPlayerState()
            lastError = nil // Clear previous errors
            isDirty = false // Reset dirty flag at start to allow retries

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
                        title: (resp.combined?.title ?? resp.items.first?.title ?? "Summary").condenseWhitespace(),
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
            } catch {
                // Don't show error if task was cancelled
                if Task.isCancelled {
                    print("Fetch cancelled")
                    return
                }
                
                print("Fetch error:", error)
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
            
            // Save summary to history
            await saveSummaryToHistory()
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
            guard let self = self else { return }
            self.currentTime = time.seconds
            if let dur = p.currentItem?.duration.seconds, dur.isFinite {
                self.duration = dur
            }
        }

        // Observe end of playback
        endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: item,
            queue: .main
        ) { [weak self] _ in
            guard let self = self else { return }
            self.isPlaying = false
            self.currentTime = self.duration
            self.updateNowPlaying(isPlaying: false)
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
            guard let self = self else { return }
            self.currentTime = seconds
            self.updateNowPlaying(isPlaying: self.isPlaying)
        }
    }
    
    // MARK: - Subscription UI
    
    func showSubscriptionView() {
        showingSubscriptionView = true
    }
    
    // MARK: - Custom Topics Management
    
    func loadCustomTopics() async {
        do {
            let topics = try await ApiClient.getCustomTopics()
            await MainActor.run {
                self.customTopics = topics
            }
        } catch {
            print("Failed to load custom topics: \(error)")
        }
    }
    
    func addCustomTopic(_ topic: String) async {
        do {
            let updatedTopics = try await ApiClient.addCustomTopic(topic)
            await MainActor.run {
                self.customTopics = updatedTopics
            }
        } catch {
            print("Failed to add custom topic: \(error)")
        }
    }
    
    func removeCustomTopic(_ topic: String) async {
        do {
            let updatedTopics = try await ApiClient.removeCustomTopic(topic)
            await MainActor.run {
                self.customTopics = updatedTopics
            }
        } catch {
            print("Failed to remove custom topic: \(error)")
        }
    }
    
    func updateCustomTopics(_ topics: [String]) async {
        do {
            let updatedTopics = try await ApiClient.updateCustomTopics(topics)
            await MainActor.run {
                self.customTopics = updatedTopics
            }
        } catch {
            print("Failed to update custom topics: \(error)")
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
            "audioUrl": summary.audioUrl ?? ""
        ]
        
        do {
            try await ApiClient.addSummaryToHistory(summaryData: summaryData)
        } catch {
            print("Failed to save summary to history: \(error)")
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
        let squashed = replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
        return squashed.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
