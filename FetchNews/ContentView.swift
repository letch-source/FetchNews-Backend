//
//  ContentView.swift
//  FetchNews
//
//  Created by Finlay Smith on 8/14/25.
//

import SwiftUI

// MARK: - Constants

let ALL_TOPICS: [String] = [
    "business","entertainment","general","health","science","sports","technology","world"
]

/// Adaptive grid so topic chips wrap into centered rows.
private let CHIP_COLUMNS: [GridItem] = [
    GridItem(.adaptive(minimum: 140), spacing: 10, alignment: .center)
]

// MARK: - Helpers

func normalizedURL(from raw: String?) -> URL? {
    guard var s = raw?.trimmingCharacters(in: .whitespacesAndNewlines), !s.isEmpty else { return nil }
    if !s.lowercased().hasPrefix("http://") && !s.lowercased().hasPrefix("https://") {
        s = "https://" + s
    }
    return URL(string: s)
}

func firstWords(_ text: String, count: Int) -> String {
    let words = text.split(whereSeparator: { $0.isWhitespace || $0.isNewline })
    guard words.count > count else { return text }
    return words.prefix(count).joined(separator: " ")
}

/// Builds "Topic News" / "Topic and Topic News" / "A, B, and C News"
func userNewsTitle(from topics: Set<String>) -> String {
    let arr = Array(topics).sorted().map { $0.capitalized }
    switch arr.count {
    case 0:
        return "News"
    case 1:
        return "\(arr[0]) News"
    case 2:
        return "\(arr[0]) and \(arr[1]) News"
    default:
        let head = arr.dropLast().joined(separator: ", ")
        return "\(head), and \(arr.last!) News"
    }
}

// MARK: - ContentView

struct ContentView: View {
    @EnvironmentObject var vm: NewsVM
    @EnvironmentObject var authVM: AuthVM
    @State private var showingSettings = false
    @State private var showingLocation = false
    @State private var showingCustomTopics = false
    @State private var showingHistory = false
    @State private var showingNewsSources = false
    @State private var expandSummary = false
    @State private var isScrubbing = false
    @State private var scrubValue: Double = 0


    private var fetchDisabled: Bool {
        vm.isBusy || vm.phase != .idle || vm.selectedTopics.isEmpty || !vm.isDirty
    }

    private var fetchTitle: String {
        switch vm.phase {
        case .gather: return "Gathering sources…"
        case .summarize: return "Building summary…"
        case .tts: return "Recording audio…"
        default: return "Fetch News"
        }
    }

    /// Title uses last fetched topics, not live selected topics.
    private var fetchedTitle: String { userNewsTitle(from: vm.lastFetchedTopics) }

    /// Only show items that actually have previewable text.
    private var displayableItems: [Item] {
        vm.items.filter { !$0.summary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    }

    var body: some View {
        VStack(spacing: 0) {
            header

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12, pinnedViews: [.sectionHeaders]) {

                    // Fetch again button (only show if we have last fetched topics)
                    if !vm.lastFetchedTopics.isEmpty {
                        VStack(spacing: 8) {
                            Button(action: {
                                expandSummary = false
                                Task { await vm.fetchAgain() }
                            }) {
                                VStack(spacing: 4) {
                                    Text(vm.lastFetchedTopics.count > 2 ? "Fetch mixed topic News again?" : "Fetch \(userNewsTitle(from: vm.lastFetchedTopics)) again?")
                                        .font(.headline)
                                        .foregroundColor(.white)
                                    
                                    Text(Array(vm.lastFetchedTopics).sorted().map { $0.capitalized }.joined(separator: ", "))
                                        .font(.caption)
                                        .foregroundColor(.white.opacity(0.8))
                                        .lineLimit(2)
                                }
                                .padding(.vertical, 12)
                                .padding(.horizontal, 16)
                                .frame(maxWidth: .infinity)
                                .background(Color.blue)
                                .cornerRadius(12)
                            }
                            .disabled(vm.isBusy || vm.phase != .idle)
                            .opacity((vm.isBusy || vm.phase != .idle) ? 0.6 : 1.0)
                        }
                        .padding(.horizontal)
                        .padding(.top, 6)
                    }

                    // Topic chips
                    LazyVGrid(columns: CHIP_COLUMNS, alignment: .center, spacing: 10) {
                        // Predefined topics
                        ForEach(ALL_TOPICS, id: \.self) { t in
                            TopicChip(
                                title: t.capitalized,
                                isActive: vm.selectedTopics.contains(t),
                                minWidth: 140
                            ) { vm.toggle(t) }
                        }
                        
                        // Custom topics
                        ForEach(vm.customTopics, id: \.self) { t in
                            TopicChip(
                                title: t, // Keep original case for custom topics
                                isActive: vm.selectedTopics.contains(t),
                                minWidth: 140
                            ) { vm.toggle(t) }
                        }
                    }
                    .padding(.horizontal)
                    .padding(.top, 6)

                    // "Length" label
                    HStack {
                        Spacer()
                        Text("Length")
                            .font(.title3.weight(.semibold))
                        Spacer()
                    }
                    .padding(.top, 2)
                    .padding(.horizontal)

                    // Length presets
                    HStack(spacing: 8) {
                        ForEach(ApiClient.Length.allCases) { len in
                            LengthChip(
                                title: len.label,
                                isActive: vm.length == len
                            ) { vm.setLength(len) }
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal)

                    // Actions
                    HStack(spacing: 12) {
                        Button(fetchTitle) {
                            expandSummary = false
                            Task { await vm.fetch() }
                        }
                        .disabled(fetchDisabled)
                        .padding(.vertical, 10)
                        .padding(.horizontal, 14)
                        .background(fetchDisabled ? Color(.systemGray5) : Color.black)
                        .foregroundColor(fetchDisabled ? Color(.systemGray) : .white)
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.white, lineWidth: 1))
                        .cornerRadius(12)

                        HStack(spacing: 12) {
                            Button("Reset") {
                                vm.selectedTopics.removeAll()
                                vm.items = []
                                vm.combined = nil
                                vm.isDirty = true
                                vm.lastError = nil
                                expandSummary = false
                                // Keep lastFetchedTopics so previous title remains until next fetch.
                            }
                            .disabled(vm.combined == nil && vm.items.isEmpty)
                            .padding(.vertical, 10)
                            .padding(.horizontal, 14)
                            .background(Color.clear)
                            .foregroundColor((vm.combined == nil && vm.items.isEmpty) ? Color(.systemGray) : .red)
                            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.white, lineWidth: 1))
                            .cornerRadius(12)
                            .onAppear {
                                print("🔊 Reset button area appeared - needsNewAudio: \(vm.needsNewAudio)")
                            }
                            
                            if vm.needsNewAudio || vm.isReRecordingAudio {
                                Button(vm.isReRecordingAudio ? "Recording..." : "New Audio") {
                                    Task {
                                        await vm.reRecordAudio()
                                    }
                                }
                                .disabled(vm.isReRecordingAudio)
                                .padding(.vertical, 10)
                                .padding(.horizontal, 14)
                                .background(vm.isReRecordingAudio ? Color(.systemGray5) : Color.blue)
                                .foregroundColor(vm.isReRecordingAudio ? Color(.systemGray) : .white)
                                .cornerRadius(12)
                                .onAppear {
                                    print("🔊 New Audio button appeared in UI - isReRecording: \(vm.isReRecordingAudio)")
                                }
                            } else {
                                // Debug view to see when button should appear
                                Color.clear
                                    .frame(width: 0, height: 0)
                                    .onAppear {
                                        print("🔊 New Audio button should NOT appear - needsNewAudio: \(vm.needsNewAudio), isReRecording: \(vm.isReRecordingAudio)")
                                        print("🔊 Current voice: \(vm.selectedVoice)")
                                        print("🔊 Summary voice: \(vm.currentSummaryVoice)")
                                        print("🔊 Has summary: \(vm.combined != nil)")
                                    }
                            }
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal)

                    // Error message
                    if let error = vm.lastError {
                        VStack(spacing: 12) {
                            HStack {
                                Image(systemName: "exclamationmark.triangle.fill")
                                    .foregroundColor(.orange)
                                Text("Error")
                                    .font(.headline)
                                    .foregroundColor(.orange)
                                Spacer()
                            }
                            Text(error)
                                .font(.body)
                                .foregroundColor(.secondary)
                                .multilineTextAlignment(.leading)
                            
                            Button("Retry") {
                                vm.lastError = nil
                                Task { await vm.fetch() }
                            }
                            .padding(.vertical, 8)
                            .padding(.horizontal, 16)
                            .background(Color.orange)
                            .foregroundColor(.white)
                            .cornerRadius(8)
                        }
                        .padding()
                        .background(Color.orange.opacity(0.1))
                        .cornerRadius(12)
                        .padding(.horizontal)
                        .padding(.top, 4)
                    }

                    // Main summary
                    if let c = vm.combined {
                        SummaryCard(
                            title: fetchedTitle,
                            fullText: c.summary,
                            isExpanded: expandSummary,
                            canPlay: vm.canPlay,
                            isPlaying: vm.isPlaying,
                            onToggle: { withAnimation(.easeInOut) { expandSummary.toggle() } },
                            onPlayPause: { vm.playPause() }
                        )
                        .padding(.horizontal)
                        .padding(.top, 4)
                    }

                    // Articles
                    if !displayableItems.isEmpty {
                        Section {
                            LazyVStack(spacing: 12) {
                                ForEach(displayableItems) { it in
                                    SourceCard(item: it)
                                        .padding(.horizontal)
                                }
                            }
                            .padding(.top, 16)
                        } header: {
                            VStack(spacing: 6) {
                                HStack {
                                    Spacer()
                                    Text("Articles")
                                        .font(.title3.weight(.semibold))
                                    Spacer()
                                }
                                Rectangle()
                                    .fill(Color(.systemBackground))
                                    .frame(height: 12)
                                    .accessibilityHidden(true)
                            }
                            .padding(.horizontal)
                            .padding(.top, 2)
                            .background(Color(.systemBackground))
                            .zIndex(1)
                        }
                    }

                    Spacer(minLength: 16)
                }
            }
        }
        // Now-playing bubble
        .safeAreaInset(edge: .bottom) {
            if vm.canPlay {
                NowPlayingBubble(
                    title: fetchedTitle,
                    isPlaying: vm.isPlaying,
                    current: isScrubbing ? scrubValue : vm.currentTime,
                    duration: vm.duration,
                    onPlayPause: { vm.playPause() },
                    onScrubChange: { newValue in
                        scrubValue = newValue
                        if !isScrubbing { vm.seek(to: newValue) }
                    },
                    onScrubEdit: { editing in
                        isScrubbing = editing
                        if !editing { vm.seek(to: scrubValue) }
                    }
                )
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        // iOS 17+ onChange form (no deprecation warning)
        .onChange(of: vm.combined?.id, initial: false) { _, _ in
            expandSummary = false
        }
        .onDisappear {
            vm.cancelCurrentRequest()
        }
        .sheet(isPresented: $showingSettings) {
            SettingsView().environmentObject(vm)
        }
        .sheet(isPresented: $showingLocation) {
            LocationView().environmentObject(vm)
        }
        .sheet(isPresented: $showingCustomTopics) {
            CustomTopicView().environmentObject(vm)
        }
        .sheet(isPresented: $vm.showingSubscriptionView) {
            SubscriptionView().environmentObject(vm)
        }
        .sheet(isPresented: $showingHistory) {
            SummaryHistoryView()
        }
        .sheet(isPresented: $showingNewsSources) {
            NewsSourcesView(vm: vm, authVM: authVM)
        }
        .onAppear {
            // Set the authVM reference in NewsVM for limit checking
            vm.authVM = authVM
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Fetch News").font(.title2).bold()
                    Text("Custom news updates").foregroundColor(.secondary)
                    
                    // Usage indicator
                    if let user = authVM.currentUser {
                        if !user.isPremium {
                            HStack(spacing: 4) {
                                Image(systemName: "clock")
                                    .font(.caption)
                                    .foregroundColor(.orange)
                                Text("\(max(0, 10 - user.dailyUsageCount)) summaries remaining today")
                                    .font(.caption)
                                    .foregroundColor(.orange)
                            }
                        } else {
                            HStack(spacing: 4) {
                                Image(systemName: "crown.fill")
                                    .font(.caption)
                                    .foregroundColor(.yellow)
                                Text("Premium - Unlimited")
                                    .font(.caption)
                                    .foregroundColor(.yellow)
                            }
                        }
                    }
                }
                Spacer()
                
                HStack(spacing: 12) {
                    // Location button - HIDDEN FOR NOW
                    // Button { showingLocation = true } label: {
                    //     Image(systemName: authVM.userLocation.isEmpty ? "location" : "location.fill")
                    //         .imageScale(.large)
                    //         .foregroundColor(.blue)
                    // }
                    // .accessibilityLabel("Set Location")
                    
                    // Custom topics button
                    Button { showingCustomTopics = true } label: {
                        Image(systemName: "plus.circle")
                            .imageScale(.large)
                            .padding(8)
                    }
                    .accessibilityLabel("Add Custom Topics")
                    
                    // Premium upgrade button removed from header (moved to settings)
                    
                    
                    // News sources button (premium only)
                    if authVM.currentUser?.isPremium == true {
                        Button { showingNewsSources = true } label: {
                            Image(systemName: "newspaper")
                                .imageScale(.large)
                                .foregroundColor(.blue)
                                .padding(8)
                        }
                        .accessibilityLabel("News Sources")
                    }
                    
                    // History button
                    Button { showingHistory = true } label: {
                        Image(systemName: "clock.arrow.circlepath")
                            .imageScale(.large)
                            .foregroundColor(.blue)
                            .padding(8)
                    }
                    .accessibilityLabel("Summary History")
                    
                    // Settings button
                    Button { showingSettings = true } label: {
                        Image(systemName: "gearshape")
                            .imageScale(.large)
                            .padding(8)
                    }
                    .accessibilityLabel("Settings")
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color(.systemBackground))
    }
}

// MARK: - Now Playing Bubble

struct NowPlayingBubble: View {
    let title: String
    let isPlaying: Bool
    let current: Double
    let duration: Double
    let onPlayPause: () -> Void
    let onScrubChange: (Double) -> Void
    let onScrubEdit: (Bool) -> Void

    private var displayTitle: String {
        title.isEmpty ? "Summary" : title
    }

    private func format(_ seconds: Double) -> String {
        guard seconds.isFinite, seconds >= 0 else { return "0:00" }
        let s = Int(seconds.rounded())
        let m = s / 60
        let r = s % 60
        return String(format: "%d:%02d", m, r)
    }

    var body: some View {
        HStack(spacing: 12) {
            Button { onPlayPause() } label: {
                Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                    .font(.system(size: 18, weight: .bold))
                    .frame(width: 36, height: 36)
                    .background(Color.black)
                    .foregroundColor(.white)
                    .cornerRadius(8)
            }
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(Color(.systemGray4))
            )

            VStack(alignment: .leading, spacing: 6) {
                Text(displayTitle)
                    .font(.subheadline).bold()
                    .lineLimit(1)
                    .truncationMode(.tail)

                VStack(spacing: 2) {
                    Slider(
                        value: Binding(
                            get: { min(current, duration > 0 ? duration : 0) },
                            set: { newVal in onScrubChange(newVal) }
                        ),
                        in: 0...(duration > 0 ? duration : 1),
                        step: 0.5,
                        onEditingChanged: { editing in onScrubEdit(editing) }
                    )
                    HStack {
                        Text(format(current)).font(.caption2).foregroundColor(.secondary)
                        Spacer()
                        Text(format(duration)).font(.caption2).foregroundColor(.secondary)
                    }
                }
            }
        }
        .padding(12)
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .shadow(color: Color.black.opacity(0.08), radius: 12, x: 0, y: 4)
    }
}

// MARK: - Chips, Cards, Settings

struct TopicChip: View {
    let title: String
    let isActive: Bool
    var minWidth: CGFloat = 140
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .lineLimit(1)
                .truncationMode(.tail)
                .minimumScaleFactor(0.9)
                .padding(.vertical, 6)
                .padding(.horizontal, 12)
                .frame(minWidth: minWidth)
                .background(isActive ? Color.white : Color.clear)
                .foregroundColor(isActive ? .black : .white)
                .overlay(
                    RoundedRectangle(cornerRadius: 999)
                        .stroke(Color.white, lineWidth: 1)
                )
                .cornerRadius(999)
        }
    }
}

struct LengthChip: View {
    let title: String
    let isActive: Bool
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .lineLimit(1)
                .padding(.vertical, 6)
                .padding(.horizontal, 12)
                .background(isActive ? Color.white : Color.clear)
                .foregroundColor(isActive ? .black : .white)
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.white, lineWidth: 1))
                .cornerRadius(10)
        }
    }
}

struct SummaryCard: View {
    let title: String
    let fullText: String
    let isExpanded: Bool
    let canPlay: Bool
    let isPlaying: Bool
    let onToggle: () -> Void
    let onPlayPause: () -> Void

    private var previewText: String { firstWords(fullText, count: 50) }
    private var displayText: String {
        if isExpanded { return fullText }
        if fullText == previewText { return fullText }
        return previewText + "…"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(title).font(.headline)
                Spacer()
                Button(action: onPlayPause) {
                    Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                        .font(.system(size: 14, weight: .bold))
                        .frame(width: 28, height: 28)
                        .background(canPlay ? Color.black : Color(.systemGray5))
                        .foregroundColor(canPlay ? .white : Color(.systemGray))
                        .cornerRadius(6)
                }
                .disabled(!canPlay)
                .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color(.systemGray4)))
            }

            Text(displayText)
                .font(.body)
                .fixedSize(horizontal: false, vertical: true)

            if fullText != previewText {
                Button(isExpanded ? "Show less" : "Read more", action: onToggle)
                    .font(.footnote.weight(.semibold))
            }
        }
        .padding()
        .background(RoundedRectangle(cornerRadius: 12).stroke(Color(.systemGray4)))
    }
}

struct SourceCard: View {
    let item: Item

    private let collapsedLimit = 30

    /// Sentence-aware clipping:
    /// - Take up to `maxWords`.
    /// - If more text exists, snap back to the last sentence terminator (., !, ?) within the clip.
    /// - If none exists, return the word-limited clip as-is.
    private func sentenceClipped(_ text: String, maxWords: Int) -> (String, Bool) {
        let words = text.split(whereSeparator: { $0.isWhitespace || $0.isNewline })
        if words.count == 0 { return ("", false) }
        if words.count <= maxWords { return (text, false) }

        let clipped = words.prefix(maxWords).joined(separator: " ")
        if let idx = clipped.lastIndex(where: { ".!?".contains($0) }) {
            let end = clipped.index(after: idx)
            let snapped = String(clipped[..<end])
            return (snapped, true)
        } else {
            return (clipped, true)
        }
    }

    private var collapsedText: (String, Bool) {
        sentenceClipped(item.summary, maxWords: collapsedLimit)
    }

    private var displayText: String {
        let (text, truncated) = collapsedText
        if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return ""
        }
        return truncated ? text + "…" : text
    }

    private var readURL: URL? {
        normalizedURL(from: item.url)
    }

    var body: some View {
        // If no preview text, render nothing (parent already filters, but double guard here)
        if displayText.isEmpty {
            EmptyView()
        } else {
            VStack(alignment: .leading, spacing: 6) {
                // Title row (no right-side Link anymore)
                Text(item.title).font(.subheadline).bold()

                if let topic = item.topic {
                    Text("\(item.source ?? "")  ·  Topic: \(topic)")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                Text(displayText)
                    .font(.footnote)
                    .fixedSize(horizontal: false, vertical: true)

                if let url = readURL {
                    // Bottom CTA is the external link
                    Link("Read article", destination: url)
                        .font(.footnote.weight(.semibold))
                }
            }
            .padding()
            .background(RoundedRectangle(cornerRadius: 12).stroke(Color(.systemGray4)))
        }
    }
}

struct SettingsView: View {
    @EnvironmentObject var vm: NewsVM
    @EnvironmentObject var authVM: AuthVM
    @Environment(\.dismiss) private var dismiss
    private let speeds: [Double] = [0.8, 1.0, 1.25, 1.5, 1.75, 2.0]

    var body: some View {
        NavigationView {
            Form {
                Section(header: Text("Playback Speed"), footer: Text("Adjust the playback speed for audio summaries.")) {
                    Picker("Speed", selection: $vm.playbackRate) {
                        ForEach(speeds, id: \.self) { s in
                            Text(s == 1.0 ? "1× (Normal)" : String(format: "%.2gx", s)).tag(s)
                        }
                    }
                }
                
                Section(header: Text("Voice"), footer: Text("Choose the voice for audio summaries.")) {
                    Picker("Voice", selection: $vm.selectedVoice) {
                        ForEach(vm.availableVoices, id: \.self) { voice in
                            Text(voice).tag(voice)
                        }
                    }
                    .onChange(of: vm.selectedVoice) { oldValue, newValue in
                        print("🔊 Voice picker changed from '\(oldValue)' to '\(newValue)'")
                        vm.setVoice(newValue)
                    }
                }
                
                Section {
                    Button(action: {
                        Task {
                            await vm.testVoice()
                        }
                    }) {
                        HStack {
                            if vm.isPlayingVoicePreview {
                                Image(systemName: "speaker.wave.2.fill")
                                    .foregroundColor(.blue)
                            } else {
                                Image(systemName: "play.circle.fill")
                                    .foregroundColor(.blue)
                            }
                            Text("Test Voice")
                                .font(.system(size: 16, weight: .medium))
                                .foregroundColor(.blue)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(Color.blue.opacity(0.1))
                        .cornerRadius(10)
                    }
                    .disabled(vm.isPlayingVoicePreview)
                }
                
                Section(header: Text("Content Filter")) {
                    Toggle("Uplifting News Only", isOn: $vm.upliftingNewsOnly)
                        .onChange(of: vm.upliftingNewsOnly) { oldValue, newValue in
                            print("🔊 Uplifting news toggle changed from \(oldValue) to \(newValue)")
                            vm.setUpliftingNewsOnly(newValue)
                        }
                }
                
                Section(header: Text("Account")) {
                    if let user = authVM.currentUser {
                        HStack {
                            Text("Email")
                            Spacer()
                            Text(user.email)
                                .foregroundColor(.secondary)
                        }
                        
                        HStack {
                            Text("Status")
                            Spacer()
                            Text(user.isPremium ? "Premium" : "Free")
                                .foregroundColor(user.isPremium ? .yellow : .secondary)
                        }
                        
                        // Premium upgrade option (only show for free users)
                        if !user.isPremium {
                            Button("Upgrade to Premium") {
                                vm.showSubscriptionView()
                                dismiss() // Dismiss settings to show premium tab immediately
                            }
                            .foregroundColor(.yellow)
                        }
                        
                        Button("Sign Out") {
                            authVM.logout()
                            dismiss()
                        }
                        .foregroundColor(.red)
                    }
                }
            }
            .navigationTitle("Settings")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}
