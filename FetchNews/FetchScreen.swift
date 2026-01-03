//
//  FetchScreen.swift
//  FetchNews
//
//  Created by Finlay Smith on 8/14/25.
//

import SwiftUI

// MARK: - Feedback State Storage
// Stores feedback state for a specific fetch so it persists when reopening
struct FeedbackState: Codable {
    var topicFeedback: [String: String] = [:] // Track feedback by topic: "like" or "dislike"
    var expandedTopic: String? = nil // Track which topic is expanded for comments
    var topicComments: [String: String] = [:] // Track comments by topic
    var isSubmitting: [String: Bool] = [:] // Track submission state (transient, not saved)
    var submittedTopics: Set<String> = [] // Track which topics have been submitted
    
    enum CodingKeys: String, CodingKey {
        case topicFeedback
        case expandedTopic
        case topicComments
        case submittedTopics
        // Note: isSubmitting is intentionally excluded from persistence
    }
    
    // Custom encoding to exclude transient state
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(topicFeedback, forKey: .topicFeedback)
        try container.encode(expandedTopic, forKey: .expandedTopic)
        try container.encode(topicComments, forKey: .topicComments)
        try container.encode(submittedTopics, forKey: .submittedTopics)
    }
    
    // Custom decoding
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        topicFeedback = try container.decode([String: String].self, forKey: .topicFeedback)
        expandedTopic = try container.decodeIfPresent(String.self, forKey: .expandedTopic)
        topicComments = try container.decode([String: String].self, forKey: .topicComments)
        submittedTopics = try container.decode(Set<String>.self, forKey: .submittedTopics)
        isSubmitting = [:] // Always start with empty submission state
    }
    
    // Default initializer
    init() {}
}

// MARK: - Image Display Code (Commented out for future use)
// Custom image loader with better error handling
/*struct RemoteImage: View {
    let url: URL
    @State private var image: UIImage?
    @State private var isLoading = true
    @State private var error: Error?
    
    var body: some View {
        Group {
            if let image = image {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(width: 300, height: 200)
                    .clipped()
                    .cornerRadius(12)
            } else if isLoading {
                Rectangle()
                    .fill(Color(.systemGray5))
                    .frame(width: 300, height: 200)
                    .cornerRadius(12)
                    .overlay(
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle())
                    )
            } else {
                Rectangle()
                    .fill(Color(.systemGray5))
                    .frame(width: 300, height: 200)
                    .cornerRadius(12)
                    .overlay(
                        VStack {
                            Image(systemName: "photo")
                                .foregroundColor(.gray)
                            Text("Failed to load")
                                .font(.caption)
                                .foregroundColor(.gray)
                        }
                    )
            }
        }
        .onAppear {
            loadImage()
        }
    }
    
    private func loadImage() {
        isLoading = true
        error = nil
        
        // Use URLSession with proper configuration
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30.0
        config.timeoutIntervalForResource = 60.0
        config.waitsForConnectivity = true
        config.allowsCellularAccess = true
        
        let session = URLSession(configuration: config)
        
        let task = session.dataTask(with: url) { data, response, err in
            DispatchQueue.main.async {
                isLoading = false
                
                if let err = err {
                    error = err
                    print("❌ RemoteImage failed to load: \(url.absoluteString)")
                    print("   Error: \(err.localizedDescription)")
                    if let nsError = err as NSError? {
                        print("   Error code: \(nsError.code), domain: \(nsError.domain)")
                    }
                    return
                }
                
                guard let httpResponse = response as? HTTPURLResponse else {
                    print("❌ RemoteImage invalid response for: \(url.absoluteString)")
                    return
                }
                
                guard (200...299).contains(httpResponse.statusCode) else {
                    print("❌ RemoteImage HTTP error \(httpResponse.statusCode) for: \(url.absoluteString)")
                    return
                }
                
                guard let data = data, let loadedImage = UIImage(data: data) else {
                    print("❌ RemoteImage invalid image data for: \(url.absoluteString)")
                    return
                }
                
                print("✅ RemoteImage successfully loaded: \(url.absoluteString)")
                image = loadedImage
            }
        }
        
        task.resume()
    }
}*/

struct FetchScreen: View {
    @EnvironmentObject var vm: NewsVM
    @EnvironmentObject var authVM: AuthVM
    @Environment(\.dismiss) private var dismiss
    @State private var isScrubbing = false
    @State private var scrubValue: Double = 0
    // Image-related state (commented out for future use)
    // @State private var selectedImageURL: URL?
    // @State private var showFullscreenImage = false
    
    // Persistent feedback state per fetch (keyed by combined.id)
    @State private var feedbackStates: [String: FeedbackState] = [:]
    
    // AI Assistant state
    @State private var showAIAssistant = false
    @State private var wasPlayingBeforeAssistant = false
    
    private var fetchedTitle: String { 
        // Use the backend-generated title if available, otherwise fallback to client-side generation
        vm.nowPlayingTitle.isEmpty ? userNewsTitle(from: vm.lastFetchedTopics) : vm.nowPlayingTitle
    }
    
    // Get or create feedback state for a specific fetch
    private func feedbackStateBinding(for fetchId: String) -> Binding<FeedbackState> {
        return Binding(
            get: {
                if let state = feedbackStates[fetchId] {
                    return state
                } else {
                    // Create new state for this fetch
                    let newState = FeedbackState()
                    return newState
                }
            },
            set: { newValue in
                feedbackStates[fetchId] = newValue
                saveFeedbackState(for: fetchId, state: newValue)
            }
        )
    }
    
    // Save feedback state to UserDefaults
    private func saveFeedbackState(for fetchId: String, state: FeedbackState) {
        let key = "FeedbackState_\(fetchId)"
        if let encoded = try? JSONEncoder().encode(state) {
            UserDefaults.standard.set(encoded, forKey: key)
        }
    }
    
    // Load feedback state from UserDefaults
    private func loadFeedbackState(for fetchId: String) -> FeedbackState? {
        let key = "FeedbackState_\(fetchId)"
        guard let data = UserDefaults.standard.data(forKey: key),
              let decoded = try? JSONDecoder().decode(FeedbackState.self, from: data) else {
            return nil
        }
        return decoded
    }
    
    // Load all feedback states on appear
    private func loadAllFeedbackStates() {
        guard let combined = vm.combined else { return }
        if let savedState = loadFeedbackState(for: combined.id) {
            feedbackStates[combined.id] = savedState
            print("✅ Loaded feedback state for fetch \(combined.id)")
        }
    }
    
    private func timeOfDayTitle() -> String {
        // Use fetch creation time, fallback to current time if not available
        let date = vm.fetchCreatedAt ?? Date()
        let hour = Calendar.current.component(.hour, from: date)
        switch hour {
        case 5..<12:
            return "Morning Fetch"
        case 12..<15:
            return "Midday Fetch"
        default:
            return "Afternoon Fetch"
        }
    }
    
    private func formatDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }
    
    private func formatTime(_ seconds: Double) -> String {
        guard seconds.isFinite, seconds >= 0 else { return "0:00" }
        let s = Int(seconds.rounded())
        let m = s / 60
        let r = s % 60
        return String(format: "%d:%02d", m, r)
    }
    
    // Image helper function (commented out for future use)
    /*
    private func getUniqueArticleImages(from items: [Item]) -> [(String, URL, String)] {
        var seenURLs = Set<String>()
        return items.compactMap { item -> (String, URL, String)? in
            guard let imageUrl = item.imageUrl, !imageUrl.isEmpty else {
                return nil
            }
            guard let url = URL(string: imageUrl) else {
                return nil
            }
            // Only include if we haven't seen this URL before
            if seenURLs.contains(imageUrl) {
                return nil
            }
            seenURLs.insert(imageUrl)
            let source = item.source ?? "Unknown Source"
            return (item.id, url, source)
        }
    }
    */
    
    var body: some View {
        ZStack {
            Color.darkGreyBackground
                .ignoresSafeArea()
            
            // Scrollable content - vertical only
            ScrollView(.vertical, showsIndicators: true) {
                VStack(alignment: .leading, spacing: 24) {
                    // Header with close button (down arrow on left) and centered time-based title
                    HStack {
                        Button(action: { dismiss() }) {
                            Image(systemName: "chevron.down")
                                .font(.system(size: 20, weight: .semibold))
                                .foregroundColor(.primary)
                        }
                        
                        Spacer()
                        
                        if vm.combined != nil {
                            Text(timeOfDayTitle())
                                .font(.headline)
                                .fontWeight(.semibold)
                                .foregroundColor(.primary)
                        } else if vm.isBusy || vm.phase != .idle {
                            Text("Fetching...")
                                .font(.headline)
                                .fontWeight(.semibold)
                                .foregroundColor(.primary)
                        }
                        
                        Spacer()
                        
                        // Invisible spacer to balance the down arrow button
                        Button(action: {}) {
                            Image(systemName: "chevron.down")
                                .font(.system(size: 20, weight: .semibold))
                                .foregroundColor(.clear)
                        }
                        .disabled(true)
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 24)
                    
                    // Show fetching state with dog animation
                    if vm.isBusy || vm.phase != .idle {
                        VStack(spacing: 24) {
                            // Dog running animation with grey circular background
                            AnimatedFetchImage()
                                .frame(width: 120, height: 120)
                                .clipShape(Circle())
                                .background(
                                    Circle()
                                        .fill(Color(.systemGray5))
                                        .frame(width: 120, height: 120)
                                )
                                .overlay(
                                    Circle()
                                        .stroke(Color(.systemBackground), lineWidth: 4)
                                )
                                .shadow(color: Color.primary.opacity(0.3), radius: 16, x: 0, y: 8)
                            
                            // Fetching message
                            Text("Fetching your news!")
                                .font(.title2)
                                .fontWeight(.semibold)
                                .foregroundColor(.primary)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.top, 100)
                        .padding(.bottom, 200)
                    } else if let combined = vm.combined {
                        // Articles
                        let displayableItems = vm.items.filter { !$0.summary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
                        
                        // Image carousel code (commented out for future use)
                        /*
                        // Image carousel - one unique image per article (deduplicated by URL)
                        if !displayableItems.isEmpty {
                            // Get unique images - one per article, deduplicated by URL
                            let articleImages = getUniqueArticleImages(from: displayableItems)
                            
                            // Show images above the summary text
                            if !articleImages.isEmpty {
                                VStack(alignment: .leading, spacing: 0) {
                                    ScrollView(.horizontal, showsIndicators: false) {
                                        HStack(spacing: 12) {
                                            ForEach(articleImages, id: \.0) { (id, url, source) in
                                                VStack(spacing: 8) {
                                                    Button(action: {
                                                        selectedImageURL = url
                                                        showFullscreenImage = true
                                                    }) {
                                                        RemoteImage(url: url)
                                                    }
                                                    .buttonStyle(PlainButtonStyle())
                                                    
                                                    Text(source)
                                                        .font(.caption)
                                                        .foregroundColor(.secondary)
                                                        .lineLimit(1)
                                                        .frame(width: 300)
                                                }
                                            }
                                        }
                                        .padding(.horizontal, 20)
                                    }
                                    .frame(height: 220)
                                }
                                .padding(.top, 16)
                                .onAppear {
                                    // Debug: Print image URLs
                                    print("🔍 FetchScreen: Found \(displayableItems.count) displayable items")
                                    for item in displayableItems.prefix(3) {
                                        print("  - Item \(item.id): imageUrl = \(item.imageUrl ?? "nil")")
                                    }
                                    print("🖼️ Found \(articleImages.count) unique image URLs out of \(displayableItems.count) items")
                                    for (id, url, source) in articleImages.prefix(3) {
                                        print("  - Image \(id): \(url.absoluteString) (Source: \(source))")
                                    }
                                }
                            }
                        }
                        */
                        
                        // Written Summary (no title or "Summary" label)
                        VStack(alignment: .leading, spacing: 12) {
                            // Split summary by double line breaks to create paragraphs
                            let paragraphs = combined.summary.components(separatedBy: "\n\n").filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
                            
                            ForEach(Array(paragraphs.enumerated()), id: \.offset) { index, paragraph in
                                Text(paragraph.trimmingCharacters(in: .whitespacesAndNewlines))
                                    .font(.body)
                                    .foregroundColor(.primary)
                                    .fixedSize(horizontal: false, vertical: true)
                                    .padding(.bottom, index < paragraphs.count - 1 ? 8 : 0)
                            }
                            
                            // Date/Time at the end of the written text
                            Text(formatDate(Date()))
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                                .padding(.top, 8)
                        }
                        .padding(.horizontal, 20)
                        .padding(.top, 16)
                        .onAppear {
                            // Debug: Check if topicSections are received
                            if let sections = combined.topicSections {
                                print("📊 Received \(sections.count) topic sections")
                                for section in sections {
                                    print("  - \(section.topic): \(section.articles.count) articles")
                                }
                            } else {
                                print("⚠️ No topicSections in response")
                            }
                        }
                        
                        // Topic Feedback Section
                        if let topicSections = combined.topicSections, !topicSections.isEmpty, ApiClient.isAuthenticated {
                            TopicFeedbackView(
                                topicSections: topicSections,
                                feedbackState: feedbackStateBinding(for: combined.id)
                            )
                            .padding(.horizontal, 20)
                            .padding(.top, 16)
                        }
                        
                        // Articles section
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
                                        .fill(Color.darkGreyBackground)
                                        .frame(height: 12)
                                        .accessibilityHidden(true)
                                }
                                .padding(.horizontal)
                                .padding(.top, 2)
                                .background(Color.darkGreyBackground)
                                .zIndex(1)
                            }
                        }
                        
                        // Add bottom padding so content can scroll behind the audio bar
                        Spacer(minLength: 200)
                    } else if let error = vm.lastError {
                        // Show error message
                        VStack(spacing: 16) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .font(.system(size: 48))
                                .foregroundColor(.orange)
                            
                            Text("Error")
                                .font(.title2)
                                .fontWeight(.semibold)
                                .foregroundColor(.primary)
                            
                            Text(error)
                                .font(.body)
                                .foregroundColor(.secondary)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal, 40)
                            
                            Button("Try Again") {
                                vm.lastError = nil
                                Task { await vm.fetch() }
                            }
                            .padding(.vertical, 10)
                            .padding(.horizontal, 20)
                            .background(Color.orange)
                            .foregroundColor(.white)
                            .cornerRadius(8)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.top, 60)
                    } else {
                        // No fetch available
                        VStack(spacing: 16) {
                            Text("No Fetch Available")
                                .font(.title2)
                                .fontWeight(.semibold)
                                .foregroundColor(.primary)
                            
                            Text("Create a new fetch to view it here.")
                                .font(.body)
                                .foregroundColor(.secondary)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.top, 60)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .scrollDisabled(false) // Allow vertical scroll
            
            // Top fade gradient to prevent text from scrolling behind time display
            VStack {
                LinearGradient(
                    gradient: Gradient(stops: [
                        .init(color: Color.darkGreyBackground.opacity(1.0), location: 0.0),
                        .init(color: Color.darkGreyBackground.opacity(0.8), location: 0.3),
                        .init(color: Color.darkGreyBackground.opacity(0.4), location: 0.6),
                        .init(color: Color.darkGreyBackground.opacity(0), location: 1.0)
                    ]),
                    startPoint: .top,
                    endPoint: .bottom
                )
                .frame(height: 100)
                Spacer()
            }
            .ignoresSafeArea(edges: .top)
            .allowsHitTesting(false)
            
            // Static audio bar at the bottom (Spotify-style) - only show when audio is loaded
            VStack {
                Spacer()
                if vm.canPlay {
                    VStack(spacing: 0) {
                        // Divider line
                        Divider()
                            .background(Color(.separator))
                        
                        // Audio player bar
                        VStack(spacing: 12) {
                            // Title above the audio bar - scrolls if too long
                            ScrollingText(
                                fetchedTitle,
                                font: .headline,
                                fontWeight: .semibold,
                                color: .primary
                            )
                            .frame(height: 22)
                            
                            // Controls row with play/pause button, AI assistant, and audio bar
                            HStack(spacing: 16) {
                                // Play/Pause button on the left
                                Button(action: { vm.playPause() }) {
                                    Image(systemName: vm.isPlaying ? "pause.fill" : "play.fill")
                                        .font(.system(size: 24, weight: .bold))
                                        .foregroundColor(.primary)
                                        .frame(width: 44, height: 44)
                                }
                                .disabled(!vm.canPlay)
                                .opacity(vm.canPlay ? 1.0 : 0.5)
                                
                                // AI Assistant button
                                Button(action: {
                                    // Remember if audio was playing
                                    wasPlayingBeforeAssistant = vm.isPlaying
                                    
                                    // Pause audio before opening assistant
                                    if vm.isPlaying {
                                        vm.playPause()
                                    }
                                    showAIAssistant = true
                                }) {
                                    Image(systemName: "bubble.left.and.bubble.right.fill")
                                        .font(.system(size: 20, weight: .bold))
                                        .foregroundColor(.blue)
                                        .frame(width: 44, height: 44)
                                }
                                .disabled(!vm.canPlay || vm.combined == nil)
                                .opacity(vm.canPlay && vm.combined != nil ? 1.0 : 0.5)
                                
                                // Audio bar (progress bar)
                                VStack(spacing: 6) {
                                    // Progress bar
                                    if vm.canPlay {
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
                                    } else {
                                        // Disabled progress bar
                                        Slider(value: .constant(0), in: 0...1)
                                            .disabled(true)
                                            .tint(.gray)
                                        
                                        HStack {
                                            Text("0:00")
                                                .font(.caption)
                                                .foregroundColor(.secondary)
                                            Spacer()
                                            Text("0:00")
                                                .font(.caption)
                                                .foregroundColor(.secondary)
                                        }
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
        }
        // Fullscreen image sheet (commented out for future use)
        /*
        .sheet(isPresented: $showFullscreenImage) {
            if let imageURL = selectedImageURL {
                FullscreenImageView(imageURL: imageURL)
            }
        }
        */
        .onAppear {
            loadAllFeedbackStates()
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
    }
}

// Fullscreen image view (commented out for future use)
/*
struct FullscreenImageView: View {
    let imageURL: URL
    @Environment(\.dismiss) private var dismiss
    @State private var image: UIImage?
    @State private var isLoading = true
    @State private var scale: CGFloat = 1.0
    @State private var lastScale: CGFloat = 1.0
    @State private var offset: CGSize = .zero
    @State private var lastOffset: CGSize = .zero
    
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            
            if isLoading {
                ProgressView()
                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
            } else if let image = image {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .scaleEffect(scale)
                    .offset(offset)
                    .gesture(
                        SimultaneousGesture(
                            MagnificationGesture()
                                .onChanged { value in
                                    scale = lastScale * value
                                }
                                .onEnded { _ in
                                    lastScale = scale
                                    if scale < 1.0 {
                                        withAnimation {
                                            scale = 1.0
                                            lastScale = 1.0
                                            offset = .zero
                                            lastOffset = .zero
                                        }
                                    } else if scale > 3.0 {
                                        withAnimation {
                                            scale = 3.0
                                            lastScale = 3.0
                                        }
                                    }
                                },
                            DragGesture()
                                .onChanged { value in
                                    // Only allow dragging when zoomed in
                                    if scale > 1.0 {
                                        offset = CGSize(
                                            width: lastOffset.width + value.translation.width,
                                            height: lastOffset.height + value.translation.height
                                        )
                                    }
                                }
                                .onEnded { _ in
                                    lastOffset = offset
                                }
                        )
                    )
                    .onTapGesture(count: 2) {
                        // Double tap to zoom
                        withAnimation {
                            if scale > 1.0 {
                                scale = 1.0
                                lastScale = 1.0
                                offset = .zero
                                lastOffset = .zero
                            } else {
                                scale = 2.0
                                lastScale = 2.0
                            }
                        }
                    }
            }
            
            VStack {
                HStack {
                    Spacer()
                    Button(action: { dismiss() }) {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 30))
                            .foregroundColor(.white)
                            .background(Color.black.opacity(0.5))
                            .clipShape(Circle())
                    }
                    .padding()
                }
                Spacer()
            }
        }
        .onAppear {
            loadImage()
        }
    }
    
    private func loadImage() {
        isLoading = true
        
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30.0
        config.timeoutIntervalForResource = 60.0
        
        let session = URLSession(configuration: config)
        let task = session.dataTask(with: imageURL) { data, response, error in
            DispatchQueue.main.async {
                isLoading = false
                
                if let error = error {
                    print("❌ FullscreenImage failed to load: \(error.localizedDescription)")
                    return
                }
                
                guard let data = data, let loadedImage = UIImage(data: data) else {
                    print("❌ FullscreenImage invalid image data")
                    return
                }
                
                image = loadedImage
            }
        }
        
        task.resume()
    }
}
*/

// MARK: - Topic Feedback View

struct TopicFeedbackView: View {
    let topicSections: [TopicSection]
    @Binding var feedbackState: FeedbackState
    
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Divider()
            
            Text("Rate each topic:")
                .font(.headline)
                .foregroundColor(.primary)
            
            VStack(spacing: 12) {
                ForEach(topicSections) { topicSection in
                    VStack(alignment: .leading, spacing: 12) {
                        // Show thank you message if already submitted
                        if feedbackState.submittedTopics.contains(topicSection.topic) {
                            HStack {
                                Image(systemName: "checkmark.circle.fill")
                                    .font(.system(size: 20))
                                    .foregroundColor(.green)
                                
                                Text("Thanks for giving feedback!")
                                    .font(.subheadline)
                                    .foregroundColor(.primary)
                                
                                Spacer()
                            }
                            .padding(.vertical, 12)
                        } else {
                            // Show normal feedback UI
                            HStack(spacing: 12) {
                                // Topic name
                                Text(smartCapitalized(topicSection.topic))
                                    .font(.subheadline)
                                    .foregroundColor(.primary)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                
                                // Thumbs up button
                                Button(action: {
                                    handleFeedback(for: topicSection, type: "like")
                                }) {
                                    Image(systemName: feedbackState.topicFeedback[topicSection.topic] == "like" ? "hand.thumbsup.fill" : "hand.thumbsup")
                                        .font(.system(size: 20))
                                        .foregroundColor(feedbackState.topicFeedback[topicSection.topic] == "like" ? .green : .secondary)
                                        .frame(width: 44, height: 44)
                                        .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                                
                                // Thumbs down button
                                Button(action: {
                                    handleFeedback(for: topicSection, type: "dislike")
                                }) {
                                    Image(systemName: feedbackState.topicFeedback[topicSection.topic] == "dislike" ? "hand.thumbsdown.fill" : "hand.thumbsdown")
                                        .font(.system(size: 20))
                                        .foregroundColor(feedbackState.topicFeedback[topicSection.topic] == "dislike" ? .red : .secondary)
                                        .frame(width: 44, height: 44)
                                        .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        
                        // Expandable comment section (only if not submitted)
                        if !feedbackState.submittedTopics.contains(topicSection.topic) && feedbackState.expandedTopic == topicSection.topic {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Tell us more (optional):")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                                
                                TextEditor(text: Binding(
                                    get: { feedbackState.topicComments[topicSection.topic] ?? "" },
                                    set: { feedbackState.topicComments[topicSection.topic] = $0 }
                                ))
                                .frame(height: 80)
                                .padding(8)
                                .background(Color(.systemBackground))
                                .cornerRadius(8)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 8)
                                        .stroke(Color(.systemGray4), lineWidth: 1)
                                )
                                
                                HStack {
                                    Button("Skip") {
                                        withAnimation {
                                            submitFeedback(for: topicSection, withComment: nil)
                                        }
                                    }
                                    .font(.subheadline)
                                    .foregroundColor(.secondary)
                                    
                                    Spacer()
                                    
                                    Button(action: {
                                        withAnimation {
                                            let comment = feedbackState.topicComments[topicSection.topic]?.trimmingCharacters(in: .whitespacesAndNewlines)
                                            submitFeedback(for: topicSection, withComment: comment?.isEmpty == false ? comment : nil)
                                        }
                                    }) {
                                        if feedbackState.isSubmitting[topicSection.topic] == true {
                                            ProgressView()
                                                .scaleEffect(0.8)
                                        } else {
                                            Text("Submit")
                                                .fontWeight(.semibold)
                                        }
                                    }
                                    .font(.subheadline)
                                    .foregroundColor(.white)
                                    .padding(.horizontal, 16)
                                    .padding(.vertical, 8)
                                    .background(Color.blue)
                                    .cornerRadius(8)
                                    .disabled(feedbackState.isSubmitting[topicSection.topic] == true)
                                }
                            }
                            .padding(.top, 4)
                            .transition(.opacity.combined(with: .scale))
                        }
                    }
                    .padding(.vertical, 8)
                    .padding(.horizontal, 12)
                    .background(Color(.systemGray6))
                    .cornerRadius(8)
                }
            }
        }
        .onAppear {
            print("🔍 TopicFeedbackView loaded with \(topicSections.count) topics")
            print("   Submitted topics: \(feedbackState.submittedTopics)")
            for section in topicSections {
                print("  - Topic: \(section.topic), Articles: \(section.articles.count)")
            }
        }
        .onDisappear {
            print("👋 TopicFeedbackView disappeared")
        }
    }
    
    private func handleFeedback(for topicSection: TopicSection, type: String) {
        let topicKey = topicSection.topic
        
        // Prevent changes after submission
        if feedbackState.submittedTopics.contains(topicKey) {
            print("⚠️ Feedback already submitted for \(topicKey)")
            return
        }
        
        let currentFeedback = feedbackState.topicFeedback[topicKey]
        
        // Toggle logic: if already set to this type, remove it and collapse; otherwise set it and expand
        if currentFeedback == type {
            // Deselecting - collapse and clear
            withAnimation {
                feedbackState.topicFeedback[topicKey] = nil
                feedbackState.expandedTopic = nil
                feedbackState.topicComments[topicKey] = nil
            }
            print("📊 Feedback removed for \(topicKey)")
        } else {
            // Selecting new feedback - expand for comment
            withAnimation {
                feedbackState.topicFeedback[topicKey] = type
                feedbackState.expandedTopic = topicKey
            }
            print("📊 Feedback for \(topicKey): \(type) (awaiting comment)")
        }
    }
    
    private func submitFeedback(for topicSection: TopicSection, withComment comment: String?) {
        let topicKey = topicSection.topic
        guard let feedback = feedbackState.topicFeedback[topicKey] else { return }
        
        // Prevent duplicate submissions
        if feedbackState.submittedTopics.contains(topicKey) {
            print("⚠️ Already submitted feedback for \(topicKey)")
            return
        }
        
        feedbackState.isSubmitting[topicKey] = true
        
        Task {
            do {
                // Submit feedback with optional comment for each article in the topic
                for article in topicSection.articles {
                    try await ApiClient.submitArticleFeedbackWithComment(
                        articleId: article.id,
                        url: article.url,
                        title: article.title,
                        source: article.source,
                        topic: topicSection.topic,
                        feedback: feedback,
                        comment: comment
                    )
                    print("✅ Submitted \(feedback) for \(topicKey): \(article.title)")
                }
                
                if let comment = comment {
                    print("💬 Comment: \(comment)")
                }
                
                // Mark as submitted and show thank you message
                await MainActor.run {
                    withAnimation {
                        feedbackState.submittedTopics.insert(topicKey)
                        feedbackState.expandedTopic = nil
                        feedbackState.isSubmitting[topicKey] = false
                    }
                }
            } catch {
                print("❌ Failed to submit feedback: \(error)")
                await MainActor.run {
                    feedbackState.isSubmitting[topicKey] = false
                }
            }
        }
    }
}

#Preview {
    FetchScreen()
        .environmentObject(NewsVM())
        .environmentObject(AuthVM())
}

