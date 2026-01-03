//
//  TopicIntelligenceHelper.swift
//  FetchNews
//
//  Topic Intelligence Integration
//  Helps users create better topics and get more relevant news
//

import Foundation
import SwiftUI

// MARK: - Models

/// Response from topic analysis endpoint
struct TopicAnalysisResponse: Codable {
    let success: Bool
    let originalTopic: String
    let needsImprovement: Bool
    let reason: String
    let suggestions: [String]
    let message: TopicMessage
}

struct TopicMessage: Codable {
    let type: MessageType
    let title: String
    let message: String
    let suggestions: [String]
    
    enum MessageType: String, Codable {
        case warning
        case info
        case success
    }
}

/// Response from batch analysis endpoint
struct BatchAnalysisResponse: Codable {
    let success: Bool
    let topics: [TopicAnalysis]
}

struct TopicAnalysis: Codable {
    let topic: String
    let analysis: TopicAnalysisDetail
}

struct TopicAnalysisDetail: Codable {
    let specificity: TopicSpecificity
    let suggestions: [String]
    let expandedTerms: [String]
    let reasoning: String?
    
    enum TopicSpecificity: String, Codable {
        case tooBroad = "too_broad"
        case tooSpecific = "too_specific"
        case justRight = "just_right"
        case unknown
    }
}

/// Response from feedback learning endpoint
struct FeedbackLearningResponse: Codable {
    let success: Bool
    let refinedTopic: String
    let reasoning: String
    let confidence: Int
    let suggestions: [String]
    let excludeTerms: [String]?
}

// MARK: - Topic Intelligence Service

class TopicIntelligenceService {
    static let shared = TopicIntelligenceService()
    
    private init() {}
    
    /// Analyze a single topic and get suggestions
    func analyzeTopic(_ topic: String) async throws -> TopicAnalysisResponse {
        let endpoint = "/api/topics/analyze"
        let url = ApiClient.base.appendingPathComponent(endpoint)
        
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        if let token = ApiClient.getAuthToken() {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        let body: [String: Any] = ["topic": topic]
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (data, _) = try await URLSession.shared.data(for: req)
        return try JSONDecoder().decode(TopicAnalysisResponse.self, from: data)
    }
    
    /// Analyze multiple topics at once (efficient for onboarding)
    func analyzeTopics(_ topics: [String]) async throws -> BatchAnalysisResponse {
        let endpoint = "/api/topics/analyze-batch"
        let url = ApiClient.base.appendingPathComponent(endpoint)
        
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        if let token = ApiClient.getAuthToken() {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        let body: [String: Any] = ["topics": topics]
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (data, _) = try await URLSession.shared.data(for: req)
        return try JSONDecoder().decode(BatchAnalysisResponse.self, from: data)
    }
    
    /// Learn from user feedback to suggest topic refinements
    func learnFromFeedback(topic: String) async throws -> FeedbackLearningResponse {
        let endpoint = "/api/topics/learn-from-feedback"
        let url = ApiClient.base.appendingPathComponent(endpoint)
        
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        if let token = ApiClient.getAuthToken() {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        let body: [String: Any] = ["topic": topic]
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (data, _) = try await URLSession.shared.data(for: req)
        return try JSONDecoder().decode(FeedbackLearningResponse.self, from: data)
    }
    
    /// Quick suggestions (lightweight endpoint)
    func getQuickSuggestions(topic: String) async throws -> TopicAnalysisResponse {
        let encodedTopic = topic.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? topic
        let endpoint = "/api/topics/suggestions/\(encodedTopic)"
        let url = ApiClient.base.appendingPathComponent(endpoint)
        
        var req = URLRequest(url: url)
        req.httpMethod = "GET"
        
        if let token = ApiClient.getAuthToken() {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        let (data, _) = try await URLSession.shared.data(for: req)
        return try JSONDecoder().decode(TopicAnalysisResponse.self, from: data)
    }
}

// MARK: - SwiftUI Components

/// View that shows topic suggestions when user types a topic
struct TopicSuggestionView: View {
    let message: TopicMessage
    let onSelectSuggestion: (String) -> Void
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: iconName)
                    .foregroundColor(iconColor)
                Text(message.title)
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .foregroundColor(iconColor)
            }
            
            Text(message.message)
                .font(.caption)
                .foregroundColor(.secondary)
            
            if !message.suggestions.isEmpty {
                VStack(spacing: 8) {
                    ForEach(message.suggestions, id: \.self) { suggestion in
                        Button(action: {
                            onSelectSuggestion(suggestion)
                        }) {
                            HStack {
                                Text(suggestion)
                                    .font(.subheadline)
                                Spacer()
                                Text("Use This")
                                    .font(.caption)
                                    .foregroundColor(.blue)
                            }
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(Color.blue.opacity(0.1))
                            .cornerRadius(8)
                        }
                    }
                }
            }
        }
        .padding()
        .background(backgroundColor)
        .cornerRadius(12)
        .padding(.horizontal)
    }
    
    private var iconName: String {
        switch message.type {
        case .warning: return "exclamationmark.triangle.fill"
        case .info: return "info.circle.fill"
        case .success: return "checkmark.circle.fill"
        }
    }
    
    private var iconColor: Color {
        switch message.type {
        case .warning: return .orange
        case .info: return .blue
        case .success: return .green
        }
    }
    
    private var backgroundColor: Color {
        switch message.type {
        case .warning: return Color.orange.opacity(0.1)
        case .info: return Color.blue.opacity(0.1)
        case .success: return Color.green.opacity(0.1)
        }
    }
}

/// View modifier to add topic intelligence to any text field
struct TopicIntelligenceModifier: ViewModifier {
    @Binding var topic: String
    @State private var analysis: TopicAnalysisResponse?
    @State private var isAnalyzing = false
    @State private var debounceTask: Task<Void, Never>?
    
    let onSuggestionSelected: (String) -> Void
    
    func body(content: Content) -> some View {
        VStack(spacing: 16) {
            content
            
            if isAnalyzing {
                ProgressView()
                    .padding()
            }
            
            if let analysis = analysis, analysis.needsImprovement {
                TopicSuggestionView(
                    message: analysis.message,
                    onSelectSuggestion: onSuggestionSelected
                )
                .transition(.scale.combined(with: .opacity))
            }
        }
        .onChange(of: topic) { newValue in
            // Debounce: wait 800ms after user stops typing
            debounceTask?.cancel()
            
            guard !newValue.isEmpty else {
                analysis = nil
                return
            }
            
            debounceTask = Task {
                try? await Task.sleep(nanoseconds: 800_000_000) // 800ms
                
                guard !Task.isCancelled else { return }
                
                await analyzeTopic(newValue)
            }
        }
    }
    
    @MainActor
    private func analyzeTopic(_ topic: String) async {
        isAnalyzing = true
        
        do {
            let result = try await TopicIntelligenceService.shared.analyzeTopic(topic)
            withAnimation {
                analysis = result
            }
        } catch {
            print("Failed to analyze topic: \(error)")
            analysis = nil
        }
        
        isAnalyzing = false
    }
}

extension View {
    /// Add topic intelligence to a text field
    /// Shows suggestions when user types a broad or specific topic
    func withTopicIntelligence(
        topic: Binding<String>,
        onSuggestionSelected: @escaping (String) -> Void
    ) -> some View {
        self.modifier(TopicIntelligenceModifier(
            topic: topic,
            onSuggestionSelected: onSuggestionSelected
        ))
    }
}

// MARK: - Usage Example View

struct TopicIntelligenceExampleView: View {
    @State private var newTopic = ""
    @State private var selectedTopics: [String] = []
    
    var body: some View {
        NavigationView {
            VStack(spacing: 20) {
                // Topic input with intelligence
                TextField("Enter topic (e.g., Politics, AI, Sports)", text: $newTopic)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                    .padding(.horizontal)
                    .withTopicIntelligence(topic: $newTopic) { suggestion in
                        // User selected a suggestion
                        newTopic = suggestion
                        addTopic(suggestion)
                    }
                
                Button("Add Topic") {
                    addTopic(newTopic)
                }
                .disabled(newTopic.isEmpty)
                
                // List of selected topics
                List(selectedTopics, id: \.self) { topic in
                    Text(topic)
                }
                
                Spacer()
            }
            .navigationTitle("Add Topics")
        }
    }
    
    private func addTopic(_ topic: String) {
        guard !topic.isEmpty, !selectedTopics.contains(topic) else { return }
        selectedTopics.append(topic)
        newTopic = ""
    }
}

// MARK: - Batch Analysis Helper

extension TopicIntelligenceService {
    /// Analyze all user topics and return ones that need improvement
    func reviewUserTopics(_ topics: [String]) async throws -> [(topic: String, suggestions: [String])] {
        let response = try await analyzeTopics(topics)
        
        var needsImprovement: [(String, [String])] = []
        
        for topicAnalysis in response.topics {
            let specificity = topicAnalysis.analysis.specificity
            if specificity == .tooBroad || specificity == .tooSpecific {
                needsImprovement.append((
                    topicAnalysis.topic,
                    topicAnalysis.analysis.suggestions
                ))
            }
        }
        
        return needsImprovement
    }
}

// MARK: - Periodic Refinement Helper

extension TopicIntelligenceService {
    /// Check if a topic should be refined based on feedback
    /// Call this after user has given significant feedback (e.g., 20+ articles)
    func shouldRefineTopic(_ topic: String, threshold: Int = 70) async throws -> (shouldRefine: Bool, newTopic: String?, suggestions: [String]) {
        let response = try await learnFromFeedback(topic: topic)
        
        if response.confidence >= threshold {
            return (true, response.refinedTopic, response.suggestions)
        }
        
        return (false, nil, [])
    }
}

// MARK: - Notification Helper

extension TopicIntelligenceService {
    /// Show a notification suggesting topic refinement
    static func showRefinementNotification(originalTopic: String, refinedTopic: String, onAccept: @escaping () -> Void, onDismiss: @escaping () -> Void) {
        // In production, use UNUserNotificationCenter or an in-app banner
        print("📢 Suggestion: Change '\(originalTopic)' to '\(refinedTopic)'")
        
        // Example in-app alert (you'd want to use a custom banner)
        DispatchQueue.main.async {
            let alert = UIAlertController(
                title: "Topic Refinement Suggestion",
                message: "We noticed you prefer '\(refinedTopic)' over '\(originalTopic)'. Would you like to update your topic?",
                preferredStyle: .alert
            )
            
            alert.addAction(UIAlertAction(title: "Yes, Update", style: .default) { _ in
                onAccept()
            })
            
            alert.addAction(UIAlertAction(title: "No, Keep Current", style: .cancel) { _ in
                onDismiss()
            })
            
            // Present from root view controller
            if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
               let rootViewController = windowScene.windows.first?.rootViewController {
                rootViewController.present(alert, animated: true)
            }
        }
    }
}

// MARK: - Preview

#if DEBUG
struct TopicIntelligenceExampleView_Previews: PreviewProvider {
    static var previews: some View {
        TopicIntelligenceExampleView()
    }
}
#endif
