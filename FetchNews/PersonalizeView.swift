//
//  PersonalizeView.swift
//  FetchNews
//
//  Created by Finlay Smith on 8/14/25.
//

import SwiftUI

struct PersonalizeView: View {
    @EnvironmentObject var vm: NewsVM
    @EnvironmentObject var authVM: AuthVM
    @State private var showingScheduledTopics = false
    @State private var scheduledTime: Date = Date()
    @State private var scheduledEnabled: Bool = false
    @State private var scheduledTopics: Set<String> = []
    @State private var scheduledCustomTopics: Set<String> = []
    @State private var saveTask: Task<Void, Never>? = nil
    @State private var isLoadingScheduledSummary = false // Flag to prevent onChange saves during load
    
    var body: some View {
        VStack(spacing: 0) {
            // Header
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
            
            // Personalization Content
            ScrollView {
                VStack(spacing: 24) {
                    
                    // Title
                    Text("Customize")
                        .font(.title3)
                        .fontWeight(.semibold)
                        .foregroundColor(.primary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.top, 8)
                        .padding(.horizontal, 20)
                    
                    // Morning Summary Section - Hidden for now
                    // MorningSummarySection()
                        
                        // Summary Length Section
                        SummaryLengthSection()
                        
                        // Playback Speed Section
                        PlaybackSpeedSection()
                        
                        // Voice Section
                        VoiceSection()
                        
                        // Content Filter Section
                        ContentFilterSection()
                        
                        // Daily Fetch Section - Available for everyone
                        DailyFetchSection(
                            scheduledTime: $scheduledTime,
                            scheduledEnabled: $scheduledEnabled,
                            scheduledTopics: $scheduledTopics,
                            scheduledCustomTopics: $scheduledCustomTopics,
                            showingTopics: $showingScheduledTopics
                        )
                        
                        // Small bottom spacer
                        Spacer(minLength: 8)
                    }
                    .padding(.vertical, 16)
                }
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
            .sheet(isPresented: $showingScheduledTopics) {
                ScheduledTopicsSelectorView(
                    selectedTopics: $scheduledTopics,
                    selectedCustomTopics: $scheduledCustomTopics
                )
                .environmentObject(vm)
            }
            .onAppear {
                Task {
                    await loadScheduledSummary()
                }
            }
            .onChange(of: scheduledTime) { oldValue, newValue in
                Task {
                    // Ensure we have loaded the summary first
                    if vm.scheduledSummaries.isEmpty {
                        await loadScheduledSummary()
                    }
                    await saveScheduledSummary()
                }
            }
            .onChange(of: scheduledEnabled) { oldValue, newValue in
                Task {
                    // Ensure we have loaded the summary first
                    if vm.scheduledSummaries.isEmpty {
                        await loadScheduledSummary()
                    }
                    await saveScheduledSummary()
                }
            }
            .onChange(of: scheduledTopics) { oldValue, newValue in
                // Only save if this is a user-initiated change, not a load from backend
                guard !isLoadingScheduledSummary else { return }
                
                // Don't save if topics are being cleared (empty set)
                // Scheduled fetch topics should persist unless explicitly changed by user
                guard !newValue.isEmpty || !oldValue.isEmpty else { return }
                
                Task {
                    // Ensure we have loaded the summary first
                    if vm.scheduledSummaries.isEmpty {
                        await loadScheduledSummary()
                    }
                    await saveScheduledSummary()
                }
            }
            .onChange(of: scheduledCustomTopics) { oldValue, newValue in
                // Only save if this is a user-initiated change, not a load from backend
                guard !isLoadingScheduledSummary else { return }
                
                // Don't save if custom topics are being cleared (empty set) unless regular topics are also empty
                // Scheduled fetch topics should persist unless explicitly changed by user
                guard !newValue.isEmpty || !oldValue.isEmpty || !scheduledTopics.isEmpty else { return }
                
                Task {
                    // Ensure we have loaded the summary first
                    if vm.scheduledSummaries.isEmpty {
                        await loadScheduledSummary()
                    }
                    await saveScheduledSummary()
                }
            }
            .sheet(isPresented: $vm.showingSubscriptionView) {
                SubscriptionView()
                    .environmentObject(vm)
                    .environmentObject(authVM)
            }
        }
    
    // MARK: - Scheduled Fetch Functions
    
    private func debouncedSave() {
        // Cancel previous save task
        saveTask?.cancel()
        
        // Create new save task with delay
        saveTask = Task {
            // Wait 500ms before saving to debounce rapid changes
            try? await Task.sleep(nanoseconds: 500_000_000)
            
            // Ensure we haven't been cancelled
            guard !Task.isCancelled else { return }
            
            // Ensure we have loaded the summary first
            if vm.scheduledSummaries.isEmpty {
                await loadScheduledSummary()
            }
            await saveScheduledSummary()
        }
    }
    
    private func loadScheduledSummary() async {
        // Set loading flag to prevent onChange handlers from triggering saves
        await MainActor.run {
            isLoadingScheduledSummary = true
        }
        
        defer {
            // Always clear the loading flag when done
            Task { @MainActor in
                isLoadingScheduledSummary = false
            }
        }
        
        do {
            let summaries = try await ApiClient.getScheduledSummaries()
            if let summary = summaries.first {
                await MainActor.run {
                    // Update vm.scheduledSummaries first
                    vm.scheduledSummaries = [summary]
                    
                    // IMPORTANT: Always load topics from backend to ensure they persist
                    // This ensures scheduled fetch topics are never lost
                    // Only update if backend has topics (don't overwrite with empty if backend is empty and we have local selections)
                    if !summary.topics.isEmpty || scheduledTopics.isEmpty {
                        scheduledTopics = Set(summary.topics)
                    }
                    if !summary.customTopics.isEmpty || scheduledCustomTopics.isEmpty {
                        scheduledCustomTopics = Set(summary.customTopics)
                    }
                    
                    // Always load time and enabled state from backend
                    let formatter = DateFormatter()
                    formatter.dateFormat = "HH:mm"
                    if let time = formatter.date(from: summary.time) {
                        scheduledTime = roundTo10Minutes(time)
                    }
                    
                    scheduledEnabled = summary.isEnabled
                }
            } else {
                // No summary yet - set defaults
                await MainActor.run {
                    vm.scheduledSummaries = []
                    scheduledTime = roundTo10Minutes(Calendar.current.date(bySettingHour: 8, minute: 0, second: 0, of: Date()) ?? Date())
                    scheduledEnabled = false
                    // Only set defaults if we don't already have topics
                    if scheduledTopics.isEmpty {
                        scheduledTopics = ["general"]
                    }
                    if scheduledCustomTopics.isEmpty {
                        scheduledCustomTopics = []
                    }
                }
            }
        } catch {
            print("Error loading scheduled fetch: \(error)")
        }
    }
    
    private func saveScheduledSummary() async {
        // Round time to nearest 10 minutes
        let roundedTime = roundTo10Minutes(scheduledTime)
        
        let timeFormatter = DateFormatter()
        timeFormatter.dateFormat = "HH:mm"
        let timeString = timeFormatter.string(from: roundedTime)
        
        let allDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        
        // Always get the existing summary (backend ensures one always exists)
        var existingSummary = vm.scheduledSummaries.first
        
        // If not in vm, load from API (which will create one if needed)
        if existingSummary == nil {
            do {
                let summaries = try await ApiClient.getScheduledSummaries()
                existingSummary = summaries.first
                // Update vm with what we found
                if let found = existingSummary {
                    await MainActor.run {
                        vm.scheduledSummaries = [found]
                        // Sync local state
                        scheduledTopics = Set(found.topics)
                        scheduledCustomTopics = Set(found.customTopics)
                    }
                }
                // If still no summary after loading, something went wrong
                guard existingSummary != nil else {
                    print("Error: No scheduled fetch found after loading from API")
                    return
                }
            } catch {
                print("Error loading scheduled fetch: \(error)")
                return
            }
        }
        
        // Ensure we have a valid summary with ID
        guard let summary = existingSummary, !summary.id.isEmpty else {
            print("Error: No valid scheduled fetch ID found")
            return
        }
        
        // Always use current topics (don't fall back to existing - save what user selected)
        // IMPORTANT: Validate that we have at least one topic before saving
        // Scheduled fetch topics should never be empty unless explicitly cleared by user
        let topicsToSave = Array(scheduledTopics)
        let customTopicsToSave = Array(scheduledCustomTopics)
        
        // Validate: must have at least one topic (regular or custom)
        guard !topicsToSave.isEmpty || !customTopicsToSave.isEmpty else {
            print("⚠️ Cannot save scheduled summary: no topics selected")
            return
        }
        
        print("💾 Saving scheduled summary - topics: \(topicsToSave.count), customTopics: \(customTopicsToSave.count)")
        
        let summaryToSave = ScheduledSummary(
            id: summary.id, // Use the existing ID (backend ensures it exists)
            name: "Daily Fetch",
            time: timeString,
            topics: topicsToSave,
            customTopics: customTopicsToSave,
            days: allDays,
            isEnabled: scheduledEnabled,
            createdAt: summary.createdAt,
            lastRun: summary.lastRun
        )
        
        do {
            // Always update (summary always exists) - include timezone
            let userTimezone = TimeZone.current.identifier
            let updatedSummary = try await ApiClient.updateScheduledSummary(summaryToSave, timezone: userTimezone)
            await MainActor.run {
                vm.scheduledSummaries = [updatedSummary]
                
                // IMPORTANT: Only sync topics if we actually sent them (preserve user's current selections)
                // This prevents scheduled fetches from overwriting the user's selected topics
                // Only update if the user explicitly changed topics (which triggers this save)
                // The updatedSummary should match what we sent, so we can verify it matches
                let sentTopics = Set(topicsToSave)
                let receivedTopics = Set(updatedSummary.topics)
                
                // Only update if they match what we sent (user explicitly saved)
                // If they don't match, the server might have returned different topics
                // In that case, preserve the user's current selections
                if sentTopics == receivedTopics {
                    scheduledTopics = receivedTopics
                }
                // Similarly for custom topics
                let sentCustomTopics = Set(customTopicsToSave)
                let receivedCustomTopics = Set(updatedSummary.customTopics)
                if sentCustomTopics == receivedCustomTopics {
                    scheduledCustomTopics = receivedCustomTopics
                }
            }
        } catch {
            print("Error saving scheduled fetch: \(error)")
            // If update fails, try reloading from API to get fresh data
            do {
                let summaries = try await ApiClient.getScheduledSummaries()
                if let freshSummary = summaries.first {
                    await MainActor.run {
                        vm.scheduledSummaries = [freshSummary]
                        scheduledTopics = Set(freshSummary.topics)
                        scheduledCustomTopics = Set(freshSummary.customTopics)
                    }
                }
            } catch {
                print("Error reloading scheduled fetch after save failure: \(error)")
            }
        }
    }
    
    private func roundTo10Minutes(_ date: Date) -> Date {
        let calendar = Calendar.current
        let components = calendar.dateComponents([.hour, .minute], from: date)
        let roundedMinute = Int(round(Double(components.minute ?? 0) / 10.0)) * 10
        return calendar.date(bySettingHour: components.hour ?? 0, minute: roundedMinute, second: 0, of: date) ?? date
    }
}

// MARK: - Daily Fetch Section

struct DailyFetchSection: View {
    @Binding var scheduledTime: Date
    @Binding var scheduledEnabled: Bool
    @Binding var scheduledTopics: Set<String>
    @Binding var scheduledCustomTopics: Set<String>
    @Binding var showingTopics: Bool
    @EnvironmentObject var vm: NewsVM
    
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Daily Fetch")
                .font(.headline)
                .fontWeight(.semibold)
                .foregroundColor(.primary)
            
            // Time picker and toggle box
            HStack(spacing: 16) {
                // Time picker on the left (10-minute increments)
                TimePicker10Min(scheduledTime: $scheduledTime)
                    .frame(height: 80)
                    .frame(maxWidth: .infinity)
                
                // Toggle on the right
                Toggle("", isOn: $scheduledEnabled)
                    .labelsHidden()
                    .toggleStyle(SwitchToggleStyle(tint: .green))
            }
            .padding()
            .background(Color(.systemGray6))
            .cornerRadius(12)
            
            // Topics button in separate box below
            Button(action: {
                showingTopics = true
            }) {
                HStack {
                    Image(systemName: "list.bullet")
                        .font(.title3)
                        .foregroundColor(.blue)
                    
                    let topicCount = scheduledTopics.count + scheduledCustomTopics.count
                    Text(topicCount > 0 ? "\(topicCount) Topics Selected" : "Select Topics")
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .foregroundColor(.blue)
                    
                    Spacer()
                    
                    Image(systemName: "chevron.right")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                .padding()
                .background(Color(.systemGray6))
                .cornerRadius(12)
            }
        }
        .padding(.horizontal, 20)
    }
}

// MARK: - Scheduled Topics Selector View

struct ScheduledTopicsSelectorView: View {
    @Binding var selectedTopics: Set<String>
    @Binding var selectedCustomTopics: Set<String>
    @EnvironmentObject var vm: NewsVM
    @Environment(\.dismiss) var dismiss
    
    var body: some View {
        NavigationView {
            ZStack {
                Color.darkGreyBackground
                    .ignoresSafeArea()
                
                Form {
                if !vm.trendingTopics.isEmpty {
                    Section(header: Text("Trending Topics")) {
                        ForEach(vm.trendingTopics, id: \.self) { topic in
                            HStack {
                                Text(topic.capitalized)
                                Spacer()
                                if selectedTopics.contains(topic) {
                                    Image(systemName: "checkmark")
                                        .foregroundColor(.blue)
                                }
                            }
                            .contentShape(Rectangle())
                            .onTapGesture {
                                if selectedTopics.contains(topic) {
                                    selectedTopics.remove(topic)
                                } else {
                                    selectedTopics.insert(topic)
                                }
                            }
                        }
                    }
                }
                
                if !vm.customTopics.isEmpty {
                    Section(header: Text("My Topics")) {
                        ForEach(vm.customTopics, id: \.self) { topic in
                            HStack {
                                Text(topic)
                                Spacer()
                                if selectedCustomTopics.contains(topic) {
                                    Image(systemName: "checkmark")
                                        .foregroundColor(.blue)
                                }
                            }
                            .contentShape(Rectangle())
                            .onTapGesture {
                                if selectedCustomTopics.contains(topic) {
                                    selectedCustomTopics.remove(topic)
                                } else {
                                    selectedCustomTopics.insert(topic)
                                }
                            }
                        }
                    }
                }
                
                Section(footer: Text("Select at least one topic for your daily fetch.")) {
                    EmptyView()
                }
            }
            .scrollContentBackground(.hidden)
            }
            .navigationTitle("Select Topics")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
        .onAppear {
            Task {
                await vm.loadCustomTopics()
                // Ensure trending topics are loaded
                if vm.trendingTopics.isEmpty {
                    await vm.fetchTrendingTopics()
                }
            }
        }
    }
}

// MARK: - Time Picker with 10-Minute Increments

struct TimePicker10Min: View {
    @Binding var scheduledTime: Date
    @State private var selectedHour: Int = 8
    @State private var selectedMinute: Int = 0
    @State private var selectedAMPM: Int = 0 // 0 = AM, 1 = PM
    
    var body: some View {
        HStack(spacing: 8) {
            // Hour picker (1-12)
            Picker("Hour", selection: $selectedHour) {
                ForEach(1...12, id: \.self) { hour in
                    Text("\(hour)").tag(hour)
                }
            }
            .pickerStyle(.wheel)
            .onChange(of: selectedHour) { _, _ in
                updateTime()
            }
            
            Text(":")
                .font(.title2)
                .fontWeight(.bold)
            
            // Minute picker (0, 10, 20, 30, 40, 50)
            Picker("Minute", selection: $selectedMinute) {
                ForEach([0, 10, 20, 30, 40, 50], id: \.self) { minute in
                    Text(String(format: "%02d", minute)).tag(minute)
                }
            }
            .pickerStyle(.wheel)
            .onChange(of: selectedMinute) { _, _ in
                updateTime()
            }
            
            // AM/PM picker
            Picker("AM/PM", selection: $selectedAMPM) {
                Text("AM").tag(0)
                Text("PM").tag(1)
            }
            .pickerStyle(.wheel)
            .onChange(of: selectedAMPM) { _, _ in
                updateTime()
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(
            Capsule()
                .fill(Color(.systemGray6))
        )
        .onAppear {
            updateFromDate()
        }
        .onChange(of: scheduledTime) { _, _ in
            updateFromDate()
        }
    }
    
    private func updateFromDate() {
        let calendar = Calendar.current
        let components = calendar.dateComponents([.hour, .minute], from: scheduledTime)
        let hour24 = components.hour ?? 8
        
        // Determine AM/PM
        if hour24 >= 12 {
            selectedAMPM = 1
            selectedHour = hour24 == 12 ? 12 : hour24 - 12
        } else {
            selectedAMPM = 0
            selectedHour = hour24 == 0 ? 12 : hour24
        }
        
        // Round minute to nearest 10
        let minute = components.minute ?? 0
        selectedMinute = Int(round(Double(minute) / 10.0)) * 10
        if selectedMinute >= 60 {
            selectedMinute = 0
            // Could increment hour here, but let's keep it simple
        }
    }
    
    private func updateTime() {
        var hour24 = selectedHour
        
        // Convert 12-hour to 24-hour
        if selectedAMPM == 1 {
            // PM
            if selectedHour != 12 {
                hour24 = selectedHour + 12
            }
        } else {
            // AM
            if selectedHour == 12 {
                hour24 = 0
            }
        }
        
        let calendar = Calendar.current
        if let newDate = calendar.date(bySettingHour: hour24, minute: selectedMinute, second: 0, of: Date()) {
            scheduledTime = newDate
        }
    }
}

// MARK: - Morning Summary Section

struct MorningSummarySection: View {
    @EnvironmentObject var vm: NewsVM
    @State private var fetchTime = Date()
    @State private var isEnabled = false
    
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Daily Fetch")
                .font(.headline)
                .fontWeight(.semibold)
                .foregroundColor(.primary)
            
            VStack(spacing: 12) {
                HStack {
                    DatePicker("", selection: $fetchTime, displayedComponents: .hourAndMinute)
                        .labelsHidden()
                    
                    Spacer()
                    
                    Toggle("", isOn: $isEnabled)
                        .toggleStyle(SwitchToggleStyle(tint: .green))
                }
            }
            .padding()
            .background(Color(.systemGray6))
            .cornerRadius(12)
        }
    }
}

// MARK: - Playback Speed Section

struct PlaybackSpeedSection: View {
    @EnvironmentObject var vm: NewsVM
    private let speeds: [Double] = [0.8, 1.0, 1.25, 1.5, 1.75, 2.0]
    
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Playback Speed")
                .font(.headline)
                .fontWeight(.semibold)
                .foregroundColor(.primary)
            
            VStack(spacing: 12) {
                Text("Adjust the playback speed for audio summaries.")
                    .font(.caption)
                    .foregroundColor(.secondary)
                
                Picker("Speed", selection: $vm.playbackRate) {
                    ForEach(speeds, id: \.self) { speed in
                        Text(speed == 1.0 ? "1× (Normal)" : String(format: "%.2gx", speed)).tag(speed)
                    }
                }
                .pickerStyle(WheelPickerStyle())
                .frame(height: 100)
            }
            .padding()
            .background(Color(.systemGray6))
            .cornerRadius(12)
        }
        .padding(.horizontal, 20)
    }
}

// MARK: - Voice Section

struct VoiceSection: View {
    @EnvironmentObject var vm: NewsVM
    
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Voice")
                .font(.headline)
                .fontWeight(.semibold)
                .foregroundColor(.primary)
            
            VStack(spacing: 12) {
                Text("Choose the voice for audio summaries.")
                    .font(.caption)
                    .foregroundColor(.secondary)
                
                Picker("Voice", selection: $vm.selectedVoice) {
                    ForEach(vm.availableVoices, id: \.self) { voice in
                        Text(voice).tag(voice)
                    }
                }
                .pickerStyle(WheelPickerStyle())
                .frame(height: 100)
                .onChange(of: vm.selectedVoice) { oldValue, newValue in
                    vm.setVoice(newValue)
                }
                
                // Test Voice Button
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
                            .font(.subheadline.weight(.medium))
                            .foregroundColor(.blue)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(Color.blue.opacity(0.1))
                    .cornerRadius(10)
                }
                .disabled(vm.isPlayingVoicePreview)
            }
            .padding()
            .background(Color(.systemGray6))
            .cornerRadius(12)
        }
        .padding(.horizontal, 20)
    }
}

// MARK: - Summary Length Section

struct SummaryLengthSection: View {
    @EnvironmentObject var vm: NewsVM
    
    private func lengthDescription(for length: ApiClient.Length) -> String {
        switch length {
        case .short:
            return "Quick 2-3 minute summary"
        case .medium:
            return "Detailed 5-7 minute summary"
        case .long:
            return "Comprehensive 10+ minute summary"
        }
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Summary Length")
                .font(.headline)
                .fontWeight(.semibold)
                .foregroundColor(.primary)
            
            VStack(spacing: 12) {
                ForEach(ApiClient.Length.allCases, id: \.self) { length in
                    Button(action: {
                        vm.setLength(length)
                    }) {
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(length.label)
                                    .font(.subheadline)
                                    .fontWeight(.medium)
                                    .foregroundColor(.primary)
                                
                                Text(lengthDescription(for: length))
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                            
                            Spacer()
                            
                            if vm.length == length {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundColor(.blue)
                            } else {
                                Image(systemName: "circle")
                                    .foregroundColor(.secondary)
                            }
                        }
                        .padding()
                        .background(vm.length == length ? Color.blue.opacity(0.1) : Color(.systemGray6))
                        .cornerRadius(10)
                    }
                    .buttonStyle(PlainButtonStyle())
                }
            }
        }
        .padding(.horizontal, 20)
    }
}

// MARK: - Content Filter Section

struct ContentFilterSection: View {
    @EnvironmentObject var vm: NewsVM
    
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Content Filter")
                .font(.headline)
                .fontWeight(.semibold)
                .foregroundColor(.primary)
            
            VStack(spacing: 12) {
                HStack {
                    Text("Uplifting News Only")
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .foregroundColor(.primary)
                    
                    Spacer()
                    
                    Toggle("", isOn: $vm.upliftingNewsOnly)
                        .toggleStyle(SwitchToggleStyle(tint: .blue))
                        .onChange(of: vm.upliftingNewsOnly) { oldValue, newValue in
                            vm.setUpliftingNewsOnly(newValue)
                        }
                }
            }
            .padding()
            .background(Color(.systemGray6))
            .cornerRadius(12)
        }
        .padding(.horizontal, 20)
    }
}

// MARK: - Premium Features Section

struct PremiumFeaturesSection: View {
    @EnvironmentObject var vm: NewsVM
    @Binding var showingNewsSources: Bool
    @Binding var showingScheduledSummaries: Bool
    
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Premium Features")
                .font(.headline)
                .fontWeight(.semibold)
                .foregroundColor(.primary)
            
            VStack(spacing: 12) {
                // News Sources - Hidden
                // Button(action: { showingNewsSources = true }) {
                //     HStack {
                //         Image(systemName: "newspaper")
                //             .foregroundColor(.blue)
                //             .frame(width: 24)
                //         
                //         VStack(alignment: .leading, spacing: 2) {
                //             Text("News Sources")
                //                 .font(.subheadline)
                //                 .fontWeight(.medium)
                //                 .foregroundColor(.primary)
                //             Text("Choose which news sources to use")
                //                 .font(.caption)
                //                 .foregroundColor(.secondary)
                //         }
                //         
                //         Spacer()
                //         
                //         if !vm.selectedNewsSources.isEmpty {
                //             Text("\(vm.selectedNewsSources.count) selected")
                //                 .font(.caption)
                //                 .foregroundColor(.secondary)
                //         }
                //         
                //         Image(systemName: "chevron.right")
                //             .font(.caption)
                //             .foregroundColor(.secondary)
                //     }
                //     .padding()
                //     .background(Color(.systemGray6))
                //     .cornerRadius(12)
                // }
                // .buttonStyle(PlainButtonStyle())
                
                // Scheduled Summaries
                Button(action: { showingScheduledSummaries = true }) {
                    HStack {
                        Image(systemName: "clock")
                            .foregroundColor(.blue)
                            .frame(width: 24)
                        
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Scheduled Summaries")
                                .font(.subheadline)
                                .fontWeight(.medium)
                                .foregroundColor(.primary)
                            Text("Set up automatic news summaries")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                        
                        Spacer()
                        
                        if !vm.scheduledSummaries.isEmpty {
                            Text("\(vm.scheduledSummaries.count) scheduled")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                        
                        Image(systemName: "chevron.right")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    .padding()
                    .background(Color(.systemGray6))
                    .cornerRadius(12)
                }
                .buttonStyle(PlainButtonStyle())
            }
        }
    }
}

#Preview {
    PersonalizeView()
        .environmentObject(NewsVM())
        .environmentObject(AuthVM())
}
