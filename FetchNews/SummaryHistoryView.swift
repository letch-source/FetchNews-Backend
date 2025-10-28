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
    @State private var summaryHistory: [SummaryHistoryEntry] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var selectedSummary: SummaryHistoryEntry?
    @State private var showingSummaryDetail = false
    
    var body: some View {
        NavigationView {
            VStack {
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
                    List {
                        ForEach(Array(summaryHistory.enumerated()), id: \.element.id) { index, entry in
                            SummaryHistoryRow(entry: entry) {
                                selectedSummary = entry
                            }
                        }
                        .onDelete(perform: deleteSummary)
                    }
                    .listStyle(PlainListStyle())
                }
            }
            .navigationTitle("Summary History")
            .navigationBarTitleDisplayMode(.inline)
        }
        .task {
            await loadSummaryHistory()
        }
        .sheet(item: $selectedSummary) { summary in
            SummaryDetailView(entry: summary)
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
                    let _ = try await ApiClient.deleteSummaryFromHistory(summaryId: summaryToDelete.id)
                    await MainActor.run {
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
            .padding(.vertical, 4)
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
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    // Header
                    VStack(alignment: .leading, spacing: 8) {
                        Text(entry.title)
                            .font(.title2)
                            .fontWeight(.bold)
                        
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
                                .font(.headline)
                            
                            LazyVGrid(columns: [
                                GridItem(.adaptive(minimum: 80), spacing: 8)
                            ], spacing: 8) {
                                ForEach(entry.topics, id: \.self) { topic in
                                    Text(topic.capitalized)
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
                    
                    // Audio Player
                    if let audioUrl = entry.audioUrl, !audioUrl.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Audio")
                                .font(.headline)
                            
                            AudioPlayerView(audioUrl: audioUrl)
                        }
                    }
                    
                    // Summary
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Summary")
                            .font(.headline)
                        
                        Text(entry.summary)
                            .font(.body)
                            .lineSpacing(4)
                    }
                    
                    // Sources
                    if let sources = entry.sources, !sources.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Sources")
                                .font(.headline)
                            
                            ForEach(sources, id: \.self) { source in
                                HStack {
                                    Image(systemName: "link")
                                        .font(.caption)
                                        .foregroundColor(.blue)
                                    
                                    Text(source)
                                        .font(.body)
                                        .foregroundColor(.blue)
                                    
                                    Spacer()
                                }
                                .padding(.vertical, 2)
                            }
                        }
                    }
                }
                .padding()
            }
            .navigationTitle("Summary Details")
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
    
    var body: some View {
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
                print("Failed to load duration: \(error)")
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
