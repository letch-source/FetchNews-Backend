//
//  CustomTopicViewEnhanced.swift
//  FetchNews
//
//  Enhanced version with Topic Intelligence for custom topics
//

import SwiftUI

struct CustomTopicViewEnhanced: View {
    @EnvironmentObject var vm: NewsVM
    @Environment(\.dismiss) private var dismiss
    @State private var showingAlert = false
    @State private var alertMessage = ""
    @State private var searchText = ""
    @State private var predefinedTopics: [TopicCategory] = []
    @State private var isLoadingTopics = false
    
    // Topic Intelligence state
    @State private var topicAnalysis: TopicAnalysisResponse?
    @State private var isAnalyzing = false
    @State private var debounceTask: Task<Void, Never>?
    
    // Regular topics that users can already select (from ContentView)
    let regularTopics = [
        "business", "entertainment", "general", "health", "science", "sports", "technology", "world"
    ]
    
    // Filter predefined topics based on search and availability
    var filteredCategories: [TopicCategory] {
        let categories = predefinedTopics.map { category in
            TopicCategory(
                name: category.name,
                topics: category.topics.filter { topic in
                    let matchesSearch = searchText.isEmpty || 
                        topic.lowercased().contains(searchText.lowercased()) ||
                        category.name.lowercased().contains(searchText.lowercased())
                    let notInCustom = !vm.customTopics.contains(topic)
                    let notRegular = !regularTopics.contains(topic.lowercased())
                    return matchesSearch && notInCustom && notRegular
                }
            )
        }
        return categories.filter { !$0.topics.isEmpty }
    }
    
    var showCustomTopicInput: Bool {
        // Show custom input when:
        // 1. User is searching AND
        // 2. No predefined topics match OR user has scrolled past them
        !searchText.isEmpty && filteredCategories.isEmpty
    }
    
    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                // Title
                Text("Add Topics")
                    .font(.title2)
                    .fontWeight(.bold)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal)
                    .padding(.top, 20)
                    .padding(.bottom, 12)
                
                // Search bar
                HStack {
                    Image(systemName: "magnifyingglass")
                        .foregroundColor(.gray)
                    TextField("Search or create your own topic...", text: $searchText)
                        .textFieldStyle(PlainTextFieldStyle())
                        .autocorrectionDisabled()
                    if !searchText.isEmpty {
                        Button(action: { 
                            searchText = ""
                            topicAnalysis = nil
                        }) {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundColor(.gray)
                        }
                    }
                }
                .padding(12)
                .background(Color(.systemGray6))
                .cornerRadius(10)
                .padding(.horizontal)
                .padding(.bottom, 12)
                .onChange(of: searchText) { newValue in
                    handleSearchChange(newValue)
                }
                
                ScrollView {
                    VStack(spacing: 20) {
                        // Predefined topics organized by category
                        if isLoadingTopics {
                            ProgressView("Loading topics...")
                                .padding()
                        } else if !filteredCategories.isEmpty {
                            ForEach(filteredCategories) { category in
                                VStack(alignment: .leading, spacing: 12) {
                                    Text(category.name)
                                        .font(.headline)
                                        .padding(.horizontal)
                                        .padding(.top, 8)
                                    
                                    LazyVGrid(columns: [
                                        GridItem(.adaptive(minimum: 100), spacing: 8)
                                    ], spacing: 8) {
                                        ForEach(category.topics, id: \.self) { topic in
                                            Button(action: {
                                                Task {
                                                    await vm.addCustomTopic(topic)
                                                    searchText = ""
                                                }
                                            }) {
                                                Text(topic)
                                                    .font(.subheadline)
                                                    .lineLimit(2)
                                                    .multilineTextAlignment(.center)
                                                    .padding(.horizontal, 10)
                                                    .padding(.vertical, 6)
                                                    .frame(minHeight: 32)
                                                    .background(Color.gray.opacity(0.1))
                                                    .foregroundColor(.primary)
                                                    .cornerRadius(8)
                                            }
                                        }
                                    }
                                    .padding(.horizontal)
                                }
                            }
                        } else if showCustomTopicInput {
                            // CUSTOM TOPIC INPUT with Topic Intelligence
                            customTopicInputSection
                        } else if searchText.isEmpty {
                            // Empty state
                            VStack(spacing: 16) {
                                Image(systemName: "magnifyingglass")
                                    .font(.system(size: 50))
                                    .foregroundColor(.gray)
                                
                                Text("Search for topics")
                                    .font(.headline)
                                    .foregroundColor(.secondary)
                                
                                Text("Try searching for 'AI', 'Climate Change',\nor create your own custom topic")
                                    .font(.subheadline)
                                    .foregroundColor(.secondary)
                                    .multilineTextAlignment(.center)
                            }
                            .padding()
                        }
                
                        // Add bottom padding to ensure content is visible above keyboard
                        Color.clear.frame(height: 100)
                    }
                }
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button("Done") { dismiss() }
            }
        }
        .alert("Invalid Topic", isPresented: $showingAlert) {
            Button("OK") { }
        } message: {
            Text(alertMessage)
        }
        .task {
            await vm.loadCustomTopics()
            await loadPredefinedTopics()
        }
    }
    
    // MARK: - Custom Topic Input with Intelligence
    
    private var customTopicInputSection: some View {
        VStack(spacing: 16) {
            // Header
            VStack(spacing: 8) {
                Text("Create Custom Topic")
                    .font(.headline)
                
                Text("We'll analyze your topic and suggest improvements")
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
            }
            .padding(.top)
            
            // Show analyzing indicator
            if isAnalyzing {
                HStack {
                    ProgressView()
                        .scaleEffect(0.8)
                    Text("Analyzing topic...")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                .padding(.vertical, 8)
            }
            
            // Show analysis results
            if let analysis = topicAnalysis {
                intelligentTopicSuggestions(analysis: analysis)
            } else if !isAnalyzing {
                // Simple add button (no analysis yet or analysis failed)
                Button(action: {
                    addCustomTopicWithValidation(searchText)
                }) {
                    HStack {
                        Image(systemName: "plus.circle.fill")
                        Text("Add '\(searchText)' as custom topic")
                    }
                    .font(.subheadline)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(Color.blue.opacity(0.1))
                    .foregroundColor(.blue)
                    .cornerRadius(8)
                }
            }
        }
        .padding()
    }
    
    // MARK: - Intelligent Topic Suggestions
    
    @ViewBuilder
    private func intelligentTopicSuggestions(analysis: TopicAnalysisResponse) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            // Message header with icon
            HStack(spacing: 8) {
                Image(systemName: analysis.message.type == .warning ? "exclamationmark.triangle.fill" : 
                               analysis.message.type == .info ? "info.circle.fill" : 
                               "checkmark.circle.fill")
                    .foregroundColor(messageColor(for: analysis.message.type))
                
                Text(analysis.message.title)
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .foregroundColor(messageColor(for: analysis.message.type))
            }
            
            // Message body
            Text(analysis.message.message)
                .font(.caption)
                .foregroundColor(.secondary)
            
            // Suggestions
            if !analysis.suggestions.isEmpty {
                Text("Suggested alternatives:")
                    .font(.caption)
                    .fontWeight(.medium)
                    .padding(.top, 4)
                
                ForEach(analysis.suggestions.prefix(4), id: \.self) { suggestion in
                    Button(action: {
                        addCustomTopicWithValidation(suggestion)
                    }) {
                        HStack {
                            Text(suggestion)
                                .font(.subheadline)
                            Spacer()
                            Image(systemName: "arrow.right.circle.fill")
                                .font(.caption)
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(Color.green.opacity(0.1))
                        .foregroundColor(.green)
                        .cornerRadius(6)
                    }
                }
            }
            
            // "Add original anyway" button
            if analysis.needsImprovement {
                Button(action: {
                    addCustomTopicWithValidation(searchText)
                }) {
                    Text("Add '\(searchText)' anyway")
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .underline()
                }
                .padding(.top, 4)
            } else {
                // Good topic - show prominent add button
                Button(action: {
                    addCustomTopicWithValidation(searchText)
                }) {
                    HStack {
                        Image(systemName: "checkmark.circle.fill")
                        Text("Add '\(searchText)'")
                    }
                    .font(.subheadline)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(Color.green.opacity(0.1))
                    .foregroundColor(.green)
                    .cornerRadius(8)
                }
                .padding(.top, 8)
            }
        }
        .padding()
        .background(backgroundColor(for: analysis.message.type))
        .cornerRadius(12)
        .animation(.spring(), value: analysis.originalTopic)
    }
    
    // MARK: - Helper Functions
    
    private func messageColor(for type: TopicMessage.MessageType) -> Color {
        switch type {
        case .warning: return .orange
        case .info: return .blue
        case .success: return .green
        }
    }
    
    private func backgroundColor(for type: TopicMessage.MessageType) -> Color {
        switch type {
        case .warning: return Color.orange.opacity(0.1)
        case .info: return Color.blue.opacity(0.1)
        case .success: return Color.green.opacity(0.1)
        }
    }
    
    private func handleSearchChange(_ newValue: String) {
        // Cancel previous debounce task
        debounceTask?.cancel()
        
        // Reset analysis if search is cleared
        guard !newValue.isEmpty else {
            topicAnalysis = nil
            return
        }
        
        // Only analyze if no predefined topics match (user wants custom topic)
        guard filteredCategories.isEmpty else {
            topicAnalysis = nil
            return
        }
        
        // Debounce: wait 800ms after user stops typing
        debounceTask = Task {
            try? await Task.sleep(nanoseconds: 800_000_000)
            
            guard !Task.isCancelled else { return }
            
            await analyzeTopic(newValue)
        }
    }
    
    @MainActor
    private func analyzeTopic(_ topic: String) async {
        isAnalyzing = true
        
        do {
            let result = try await TopicIntelligenceService.shared.analyzeTopic(topic)
            topicAnalysis = result
        } catch {
            print("Failed to analyze topic: \(error)")
            // On error, allow user to add topic without analysis
            topicAnalysis = nil
        }
        
        isAnalyzing = false
    }
    
    private func loadPredefinedTopics() async {
        isLoadingTopics = true
        do {
            let response = try await ApiClient.getPredefinedTopics()
            predefinedTopics = response.categories
        } catch {
            print("Failed to load predefined topics: \(error)")
        }
        isLoadingTopics = false
    }
    
    private func addCustomTopicWithValidation(_ topicText: String) {
        let trimmedTopic = topicText.trimmingCharacters(in: .whitespacesAndNewlines)
        
        // Basic validation
        if trimmedTopic.isEmpty {
            alertMessage = "Please enter a topic name."
            showingAlert = true
            return
        }
        
        if vm.customTopics.contains(trimmedTopic) {
            alertMessage = "This topic already exists."
            showingAlert = true
            return
        }
        
        if regularTopics.contains(trimmedTopic.lowercased()) {
            alertMessage = "This topic is already available in the main topics list."
            showingAlert = true
            return
        }
        
        // Length validation
        if trimmedTopic.count > 50 {
            alertMessage = "Topic must be 50 characters or less."
            showingAlert = true
            return
        }
        
        // Add the topic
        Task {
            await vm.addCustomTopic(trimmedTopic)
            searchText = ""
            topicAnalysis = nil
        }
    }
}

// Keep backward compatibility
typealias TopicBrowserViewEnhanced = CustomTopicViewEnhanced

#Preview {
    CustomTopicViewEnhanced()
        .environmentObject(NewsVM())
}
