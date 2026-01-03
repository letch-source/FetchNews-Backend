//
//  SummaryHistoryView.swift
//  FetchNews
//
//  Created by Finlay Smith on 8/14/25.
//

import SwiftUI
import AVFoundation

struct SummaryHistoryView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var vm: NewsVM
    @EnvironmentObject var authVM: AuthVM
    @State private var summaryHistory: [SummaryHistoryEntry] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var selectedSummary: SummaryHistoryEntry?
    @State private var showingSummaryDetail = false
    
    var body: some View {
        ZStack {
            Color.darkGreyBackground
                .ignoresSafeArea()
            
            VStack(spacing: 0) {
                // Header
                header
            
            // Content
            if isLoading {
                VStack(spacing: 16) {
                    ProgressView()
                        .scaleEffect(1.2)
                    Text("Loading history...")
                        .foregroundColor(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if summaryHistory.isEmpty {
                VStack(spacing: 20) {
                    Image(systemName: "clock.arrow.circlepath")
                        .font(.system(size: 60))
                        .foregroundColor(.gray)
                    
                    Text("No History Yet")
                        .font(.title2)
                        .fontWeight(.semibold)
                    
                    Text("Your summary history will appear here after you fetch your first news summary.")
                        .font(.body)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 24) {
                        // Title
                        Text("History")
                            .font(.title3)
                            .fontWeight(.semibold)
                            .foregroundColor(.primary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.top, 8)
                            .padding(.horizontal, 20)
                        
                        VStack(spacing: 0) {
                            ForEach(Array(summaryHistory.enumerated()), id: \.element.id) { index, entry in
                                SummaryHistoryRow(entry: entry) {
                                    selectedSummary = entry
                                }
                                
                                // Add divider between items (not after the last one)
                                if index < summaryHistory.count - 1 {
                                    Rectangle()
                                        .fill(Color(red: 0.5, green: 0.5, blue: 0.5))
                                        .frame(height: 1)
                                        .padding(.horizontal, 12)
                                        .padding(.vertical, 8)
                                }
                            }
                        }
                        .padding(.horizontal, 20)
                        
                        // Small bottom spacer
                        Spacer(minLength: 8)
                    }
                    .padding(.vertical, 16)
                }
                // Adjust scroll content insets when audio player is visible
                // This prevents scrolling too far and ensures content stops just above the audio bar
                .safeAreaInset(edge: .bottom, spacing: 0) {
                    if vm.canPlay {
                        // Spacer that matches the compact audio player height (~60px for bubble + 60px bottom padding = 120px)
                        // This prevents content from scrolling behind the audio player
                        Color.clear.frame(height: 120)
                    } else {
                        // Small bottom padding when no audio player
                        Color.clear.frame(height: 20)
                    }
                }
            }
            }
        }
        .task {
            await loadSummaryHistory()
        }
        .sheet(item: $selectedSummary) { summary in
            SummaryDetailView(entry: summary)
                .environmentObject(vm)
        }
        .alert("Error", isPresented: .constant(errorMessage != nil)) {
            Button("OK") {
                errorMessage = nil
            }
        } message: {
            if let error = errorMessage {
                Text(error)
            }
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
    
    private func loadSummaryHistory() async {
        do {
            let history = try await ApiClient.getSummaryHistory()
            await MainActor.run {
                self.summaryHistory = history
                self.isLoading = false
            }
        } catch {
            await MainActor.run {
                self.errorMessage = "Failed to load summary history: \(error.localizedDescription)"
                self.isLoading = false
            }
        }
    }
    
    private func deleteSummary(at offsets: IndexSet) {
        Task {
            for index in offsets {
                let summaryToDelete = summaryHistory[index]
                do {
                    _ = try await ApiClient.deleteSummaryFromHistory(summaryId: summaryToDelete.id)
                    _ = await MainActor.run {
                        self.summaryHistory.remove(at: index)
                    }
                } catch {
                    await MainActor.run {
                        self.errorMessage = "Failed to delete summary: \(error.localizedDescription)"
                    }
                }
            }
        }
    }
    
    private func clearHistory() async {
        do {
            try await ApiClient.clearSummaryHistory()
            await MainActor.run {
                self.summaryHistory = []
            }
        } catch {
            await MainActor.run {
                self.errorMessage = "Failed to clear history: \(error.localizedDescription)"
            }
        }
    }
}

struct SummaryHistoryRow: View {
    let entry: SummaryHistoryEntry
    let onTap: () -> Void
    
    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text(entry.title)
                        .font(.headline)
                        .foregroundColor(.primary)
                        .lineLimit(2)
                    
                    Spacer()
                    
                    Text(formatTimestamp(entry.timestamp))
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                
                Text(entry.summary)
                    .font(.body)
                    .foregroundColor(.secondary)
                    .lineLimit(3)
                
                HStack {
                    // Topics
                    if !entry.topics.isEmpty {
                        HStack(spacing: 4) {
                            Image(systemName: "tag.fill")
                                .font(.caption)
                                .foregroundColor(.blue)
                            Text(entry.topics.joined(separator: ", "))
                                .font(.caption)
                                .foregroundColor(.blue)
                        }
                    }
                    
                    Spacer()
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.darkGreyBackground)
            .cornerRadius(8)
        }
        .buttonStyle(PlainButtonStyle())
    }
    
    private func formatTimestamp(_ timestamp: String) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSSZ"
        
        if let date = formatter.date(from: timestamp) {
            let relativeFormatter = RelativeDateTimeFormatter()
            relativeFormatter.unitsStyle = .abbreviated
            return relativeFormatter.localizedString(for: date, relativeTo: Date())
        }
        
        return timestamp
    }
}

struct SummaryDetailView: View {
    let entry: SummaryHistoryEntry
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var vm: NewsVM
    
    var body: some View {
        NavigationView {
            ZStack {
                Color.darkGreyBackground
                    .ignoresSafeArea()
                
                ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    // Header
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(alignment: .top, spacing: 12) {
                            Text(entry.title)
                                .font(.title2)
                                .fontWeight(.bold)
                            
                            Spacer()
                            
                            // Audio play button - only show if audio is available
                            if let audioUrl = entry.audioUrl, !audioUrl.isEmpty {
                                Button(action: {
                                    Task {
                                        await vm.loadSummaryFromHistory(entry)
                                        // Small delay to ensure audio is prepared before playing
                                        try? await Task.sleep(nanoseconds: 100_000_000) // 0.1 seconds
                                        vm.playPause()
                                    }
                                }) {
                                    Image(systemName: vm.canPlay && vm.combined?.id == entry.id && vm.isPlaying ? "pause.circle.fill" : "play.circle.fill")
                                        .font(.system(size: 28))
                                        .foregroundColor(.blue)
                                }
                                .disabled(vm.canPlay && vm.combined?.id == entry.id && vm.isPlaying)
                            }
                        }
                        
                        HStack {
                            Text(formatTimestamp(entry.timestamp))
                                .font(.caption)
                                .foregroundColor(.secondary)
                            
                            Spacer()
                        }
                    }
                    
                    // Topics
                    if !entry.topics.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Topics")
                                .font(.title3)
                                .fontWeight(.semibold)
                                .foregroundColor(.primary)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.top, 8)
                            
                            LazyVGrid(columns: [
                                GridItem(.adaptive(minimum: 80), spacing: 8)
                            ], spacing: 8) {
                                ForEach(entry.topics, id: \.self) { topic in
                                    Text(smartCapitalized(topic))
                                        .font(.caption)
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 4)
                                        .background(Color.blue.opacity(0.1))
                                        .foregroundColor(.blue)
                                        .cornerRadius(8)
                                }
                            }
                        }
                    }
                    
                    // Summary
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Summary")
                            .font(.title3)
                            .fontWeight(.semibold)
                            .foregroundColor(.primary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.top, 8)
                        
                        Text(entry.summary)
                            .font(.body)
                            .lineSpacing(4)
                    }
                    
                    // Sources
                    if let sources = entry.sources, !sources.isEmpty {
                        // Filter to show sources that have at least title, source name, or URL
                        let validSources = sources.filter { sourceItem in
                            let hasTitle = sourceItem.title != nil && !sourceItem.title!.isEmpty
                            let hasSource = !sourceItem.source.isEmpty
                            let hasUrl = sourceItem.url != nil && !sourceItem.url!.isEmpty
                            return hasTitle || hasSource || hasUrl
                        }
                        
                        if !validSources.isEmpty {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Sources")
                                    .font(.title3)
                                    .fontWeight(.semibold)
                                    .foregroundColor(.primary)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(.top, 8)
                                
                                ForEach(Array(validSources.enumerated()), id: \.offset) { index, sourceItem in
                                    HStack {
                                        Image(systemName: "link")
                                            .font(.caption)
                                            .foregroundColor(.blue)
                                        
                                        Text(
                                            (sourceItem.title != nil && !sourceItem.title!.isEmpty) 
                                                ? sourceItem.title! 
                                                : (!sourceItem.source.isEmpty ? sourceItem.source : "Article")
                                        )
                                            .font(.body)
                                            .foregroundColor(.blue)
                                        
                                        Spacer()
                                        
                                        if let url = sourceItem.url, !url.isEmpty {
                                            Link(destination: URL(string: url) ?? URL(string: "https://example.com")!) {
                                                Image(systemName: "arrow.up.right.square")
                                                    .font(.caption)
                                                    .foregroundColor(.blue)
                                            }
                                        }
                                    }
                                    .padding(.vertical, 2)
                                }
                            }
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 16)
                }
            }
            .navigationTitle("Fetch Details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
            .onAppear {
                // Sources are now properly loaded - no need for verbose logging
            }
        }
    }
    
    private func formatTimestamp(_ timestamp: String) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSSZ"
        
        if let date = formatter.date(from: timestamp) {
            let displayFormatter = DateFormatter()
            displayFormatter.dateStyle = .medium
            displayFormatter.timeStyle = .short
            return displayFormatter.string(from: date)
        }
        
        return timestamp
    }
}

struct AudioPlayerView: View {
    let audioUrl: String
    @State private var isPlaying = false
    @State private var player: AVPlayer?
    @State private var currentTime: TimeInterval = 0
    @State private var duration: TimeInterval = 0
    @State private var timeObserver: Any?
    @State private var isAvailable = true
    @State private var errorObserver: Any?
    
    var body: some View {
        if isAvailable {
            VStack(spacing: 12) {
                // Play/Pause Button
                Button(action: togglePlayPause) {
                    Image(systemName: isPlaying ? "pause.circle.fill" : "play.circle.fill")
                        .font(.system(size: 50))
                        .foregroundColor(.blue)
                }
                
                // Progress Bar
                VStack(spacing: 4) {
                    Slider(value: $currentTime, in: 0...duration, onEditingChanged: { editing in
                        if !editing {
                            let time = CMTime(seconds: currentTime, preferredTimescale: CMTimeScale(NSEC_PER_SEC))
                            player?.seek(to: time)
                        }
                    })
                    .accentColor(.blue)
                    
                    HStack {
                        Text(formatTime(currentTime))
                            .font(.caption)
                            .foregroundColor(.secondary)
                        
                        Spacer()
                        
                        Text(formatTime(duration))
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
            }
            .onAppear {
                setupAudioPlayer()
            }
            .onDisappear {
                stopAudio()
            }
        } else {
            Text("Audio unavailable")
                .font(.caption)
                .foregroundColor(.secondary)
                .padding(.vertical, 8)
        }
    }
    
    private func setupAudioPlayer() {
        guard let url = URL(string: audioUrl) else { return }
        
        let playerItem = AVPlayerItem(url: url)
        player = AVPlayer(playerItem: playerItem)
        
        // Set up time observer
        let timeScale = CMTimeScale(NSEC_PER_SEC)
        let time = CMTime(seconds: 0.1, preferredTimescale: timeScale)
        timeObserver = player?.addPeriodicTimeObserver(forInterval: time, queue: .main) { [self] time in
            currentTime = time.seconds
        }
        
        // Set up error observer for failed playback
        errorObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemFailedToPlayToEndTime,
            object: playerItem,
            queue: .main
        ) { [self] notification in
            if let error = notification.userInfo?[AVPlayerItemFailedToPlayToEndTimeErrorKey] as? NSError {
                print("Audio playback failed: \(error.localizedDescription)")
                // Check if it's a 404 or file not found error
                if error.code == -1100 || error.domain == "CoreMediaErrorDomain" || error.code == -12938 {
                    isAvailable = false
                }
            }
        }
        
        // Check player item status immediately after a short delay
        Task {
            try? await Task.sleep(nanoseconds: 1_000_000_000) // 1 second
            await MainActor.run {
                if let item = player?.currentItem, item.status == .failed {
                    if let error = item.error as NSError? {
                        print("Player item failed: \(error.localizedDescription)")
                        if error.code == -12938 || error.domain == "CoreMediaErrorDomain" || error.code == -1100 {
                            isAvailable = false
                        }
                    }
                }
            }
        }
        
        // Get duration
        Task {
            do {
                let duration = try await playerItem.asset.load(.duration)
                if duration.seconds.isFinite {
                    await MainActor.run {
                        self.duration = duration.seconds
                    }
                }
            } catch {
                print("Failed to load duration: \(error.localizedDescription)")
                // Check if it's a 404 error
                if let urlError = error as? URLError {
                    if urlError.code == .fileDoesNotExist || urlError.code == .badServerResponse {
                        await MainActor.run {
                            isAvailable = false
                        }
                    }
                } else if let nsError = error as NSError? {
                    if nsError.code == -12938 || nsError.domain == "CoreMediaErrorDomain" || nsError.code == -1100 {
                        await MainActor.run {
                            isAvailable = false
                        }
                    }
                }
            }
        }
        
        // Set up completion observer
        NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: playerItem,
            queue: .main
        ) { [self] _ in
            isPlaying = false
            currentTime = 0
            player?.seek(to: .zero)
        }
    }
    
    private func togglePlayPause() {
        print("Toggle play/pause called, isPlaying: \(isPlaying), player: \(player != nil)")
        guard let player = player else { 
            print("No audio player available")
            return 
        }
        
        if isPlaying {
            print("Pausing audio")
            player.pause()
        } else {
            print("Playing audio")
            player.play()
        }
        
        isPlaying.toggle()
    }
    
    private func stopAudio() {
        player?.pause()
        if let timeObserver = timeObserver {
            player?.removeTimeObserver(timeObserver)
            self.timeObserver = nil
        }
        if let errorObserver = errorObserver {
            NotificationCenter.default.removeObserver(errorObserver)
            self.errorObserver = nil
        }
        isPlaying = false
        currentTime = 0
    }
    
    private func formatTime(_ time: TimeInterval) -> String {
        let minutes = Int(time) / 60
        let seconds = Int(time) % 60
        return String(format: "%d:%02d", minutes, seconds)
    }
}

#Preview {
    SummaryHistoryView()
}
