//
//  Models.swift
//  FetchNews
//
//  Created by Finlay Smith on 8/14/25.
//

import Foundation

// MARK: - Network Error Types

enum NetworkError: LocalizedError {
    case noConnection
    case timeout
    case serverUnreachable
    case invalidResponse
    case serverError(String)
    case decodingError(Error)
    case authenticationError(String)
    case unknown(Error)
    
    var errorDescription: String? {
        switch self {
        case .noConnection:
            return "No internet connection. Please check your network settings."
        case .timeout:
            return "Request timed out. The server may be busy."
        case .serverUnreachable:
            return "Cannot reach the server. Please try again later."
        case .invalidResponse:
            return "Invalid response from server."
        case .serverError(let message):
            return "Server error: \(message)"
        case .decodingError(let error):
            return "Server response format error: \(error.localizedDescription)"
        case .authenticationError(let message):
            return message
        case .unknown(let error):
            return "Network error: \(error.localizedDescription)"
        }
    }
}

// MARK: - Data Models

struct Item: Identifiable, Codable {
    let id: String
    let title: String
    let summary: String
    let url: String?
    let source: String?
    let topic: String?
    let audioUrl: String?
    
    // Memberwise initializer
    init(id: String, title: String, summary: String, url: String?, source: String?, topic: String?, audioUrl: String?) {
        self.id = id
        self.title = title
        self.summary = summary
        self.url = url
        self.source = source
        self.topic = topic
        self.audioUrl = audioUrl
    }
    
    // Custom decoding to handle missing fields gracefully
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.id = try container.decodeIfPresent(String.self, forKey: .id) ?? UUID().uuidString
        self.title = try container.decodeIfPresent(String.self, forKey: .title) ?? "Untitled"
        self.summary = try container.decodeIfPresent(String.self, forKey: .summary) ?? ""
        self.url = try container.decodeIfPresent(String.self, forKey: .url)
        
        // Handle source as either String or Object with name property
        if let sourceString = try? container.decodeIfPresent(String.self, forKey: .source) {
            self.source = sourceString
        } else if let sourceDict = try? container.decodeIfPresent([String: String].self, forKey: .source),
                  let sourceName = sourceDict["name"] {
            self.source = sourceName
        } else {
            self.source = nil
        }
        
        self.topic = try container.decodeIfPresent(String.self, forKey: .topic)
        self.audioUrl = try container.decodeIfPresent(String.self, forKey: .audioUrl)
    }
    
    // Custom encoding to maintain consistency
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(title, forKey: .title)
        try container.encode(summary, forKey: .summary)
        try container.encodeIfPresent(url, forKey: .url)
        try container.encodeIfPresent(source, forKey: .source)
        try container.encodeIfPresent(topic, forKey: .topic)
        try container.encodeIfPresent(audioUrl, forKey: .audioUrl)
    }
    
    private enum CodingKeys: String, CodingKey {
        case id, title, summary, url, source, topic, audioUrl
    }
}

// Topic section with articles for feedback
struct TopicSection: Codable, Identifiable {
    let id: String
    let topic: String
    let summary: String
    let articles: [Item]
    let audioUrl: String? // Per-topic audio URL
    
    // Memberwise initializer
    init(id: String, topic: String, summary: String, articles: [Item], audioUrl: String? = nil) {
        self.id = id
        self.topic = topic
        self.summary = summary
        self.articles = articles
        self.audioUrl = audioUrl
    }
    
    // Custom decoding
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.id = try container.decodeIfPresent(String.self, forKey: .id) ?? UUID().uuidString
        self.topic = try container.decodeIfPresent(String.self, forKey: .topic) ?? ""
        self.summary = try container.decodeIfPresent(String.self, forKey: .summary) ?? ""
        self.articles = try container.decodeIfPresent([Item].self, forKey: .articles) ?? []
        self.audioUrl = try container.decodeIfPresent(String.self, forKey: .audioUrl)
    }
    
    private enum CodingKeys: String, CodingKey {
        case id, topic, summary, articles, audioUrl
    }
}

struct Combined: Codable {
    let id: String
    let title: String
    let summary: String
    let audioUrl: String?
    let topicSections: [TopicSection]? // New: structured topics for feedback
    
    // Memberwise initializer
    init(id: String, title: String, summary: String, audioUrl: String?, topicSections: [TopicSection]? = nil) {
        self.id = id
        self.title = title
        self.summary = summary
        self.audioUrl = audioUrl
        self.topicSections = topicSections
    }
    
    // Convenience initializer with default id
    init(title: String, summary: String, audioUrl: String? = nil, topicSections: [TopicSection]? = nil) {
        self.id = "combined"
        self.title = title
        self.summary = summary
        self.audioUrl = audioUrl
        self.topicSections = topicSections
    }
    
    // Custom decoding to handle API response structure
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.id = try container.decodeIfPresent(String.self, forKey: .id) ?? "combined"
        
        // Handle both "text" field (from API) and separate "title"/"summary" fields
        if let text = try container.decodeIfPresent(String.self, forKey: .text) {
            // API returns "text" field - use it for both title and summary
            self.title = "Summary"
            self.summary = text
        } else {
            // Fallback to separate title and summary fields
            self.title = try container.decodeIfPresent(String.self, forKey: .title) ?? "Summary"
            self.summary = try container.decodeIfPresent(String.self, forKey: .summary) ?? ""
        }
        
        self.audioUrl = try container.decodeIfPresent(String.self, forKey: .audioUrl)
        self.topicSections = try container.decodeIfPresent([TopicSection].self, forKey: .topicSections)
    }
    
    // Custom encoding to maintain consistency
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(title, forKey: .title)
        try container.encode(summary, forKey: .summary)
        try container.encodeIfPresent(audioUrl, forKey: .audioUrl)
        try container.encodeIfPresent(topicSections, forKey: .topicSections)
    }
    
    private enum CodingKeys: String, CodingKey {
        case id, title, summary, text, audioUrl, topicSections
    }
}

struct SummarizeResponse: Codable {
    let combined: Combined?
    let items: [Item]
}

// MARK: - Batch Response Models

struct BatchResult: Codable {
    let items: [Item]
    let combined: Combined?
}

struct BatchSummarizeResponse: Codable {
    let results: [BatchResult]
    let batches: [BatchResult] // Array of batch results (same structure as results)
}

// MARK: - Authentication Models

struct User: Codable {
    let id: String
    let email: String
    let emailVerified: Bool
    let isPremium: Bool
    let dailyUsageCount: Int
    let subscriptionId: String?
    let subscriptionExpiresAt: String?
    let customTopics: [String]
    let summaryHistory: [SummaryHistoryEntry]
    let selectedTopics: [String]
    let name: String?
    
    // Memberwise initializer for creating User instances in code
    init(id: String, email: String, emailVerified: Bool, isPremium: Bool, dailyUsageCount: Int, subscriptionId: String?, subscriptionExpiresAt: String?, customTopics: [String], summaryHistory: [SummaryHistoryEntry], selectedTopics: [String] = [], name: String? = nil) {
        self.id = id
        self.email = email
        self.emailVerified = emailVerified
        self.isPremium = isPremium
        self.dailyUsageCount = dailyUsageCount
        self.subscriptionId = subscriptionId
        self.subscriptionExpiresAt = subscriptionExpiresAt
        self.customTopics = customTopics
        self.summaryHistory = summaryHistory
        self.selectedTopics = selectedTopics
        self.name = name
    }
    
    // Custom decoder to handle missing or null values gracefully
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        
        // Backend should always send id as a string (ObjectId converted via String())
        let id = try container.decode(String.self, forKey: .id)
        let email = try container.decode(String.self, forKey: .email)
        let emailVerified = try container.decodeIfPresent(Bool.self, forKey: .emailVerified) ?? false
        let isPremium = try container.decodeIfPresent(Bool.self, forKey: .isPremium) ?? false
        let dailyUsageCount = try container.decodeIfPresent(Int.self, forKey: .dailyUsageCount) ?? 0
        let subscriptionId = try container.decodeIfPresent(String.self, forKey: .subscriptionId)
        let subscriptionExpiresAt = try container.decodeIfPresent(String.self, forKey: .subscriptionExpiresAt)
        let customTopics = try container.decodeIfPresent([String].self, forKey: .customTopics) ?? []
        let summaryHistory = try container.decodeIfPresent([SummaryHistoryEntry].self, forKey: .summaryHistory) ?? []
        let selectedTopics = try container.decodeIfPresent([String].self, forKey: .selectedTopics) ?? []
        let name = try container.decodeIfPresent(String.self, forKey: .name)
        
        self.init(id: id, email: email, emailVerified: emailVerified, isPremium: isPremium, dailyUsageCount: dailyUsageCount, subscriptionId: subscriptionId, subscriptionExpiresAt: subscriptionExpiresAt, customTopics: customTopics, summaryHistory: summaryHistory, selectedTopics: selectedTopics, name: name)
    }
    
    private enum CodingKeys: String, CodingKey {
        case id, email, emailVerified, isPremium, dailyUsageCount, subscriptionId, subscriptionExpiresAt, customTopics, summaryHistory, selectedTopics, name
    }
}

struct SummaryHistoryEntry: Codable, Identifiable {
    let id: String
    let title: String
    let summary: String
    let topics: [String]
    let length: String
    let timestamp: String
    let audioUrl: String?
    let sources: [SourceItem]?
    
    // Custom decoder to handle missing sources field gracefully and decode as objects or strings
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.id = try container.decode(String.self, forKey: .id)
        self.title = try container.decode(String.self, forKey: .title)
        self.summary = try container.decode(String.self, forKey: .summary)
        self.topics = try container.decode([String].self, forKey: .topics)
        self.length = try container.decode(String.self, forKey: .length)
        self.timestamp = try container.decode(String.self, forKey: .timestamp)
        self.audioUrl = try container.decodeIfPresent(String.self, forKey: .audioUrl)
        
        // Try to decode sources as array of objects first, then fallback to strings
        if let sourceObjects = try? container.decodeIfPresent([SourceItem].self, forKey: .sources) {
            self.sources = sourceObjects
        } else if let sourceStrings = try? container.decodeIfPresent([String].self, forKey: .sources) {
            // Convert strings to SourceItem objects
            self.sources = sourceStrings.map { SourceItem(source: $0) }
        } else {
            self.sources = nil
        }
    }
    
    private enum CodingKeys: String, CodingKey {
        case id, title, summary, topics, length, timestamp, audioUrl, sources
    }
}

struct SourceItem: Codable, Hashable {
    let id: String?
    let title: String?
    let summary: String?
    let source: String
    let url: String?
    let topic: String?
    
    init(source: String) {
        self.id = nil
        self.title = nil
        self.summary = nil
        self.source = source
        self.url = nil
        self.topic = nil
    }
    
    // Custom decoder to handle missing source field
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.id = try container.decodeIfPresent(String.self, forKey: .id)
        self.title = try container.decodeIfPresent(String.self, forKey: .title)
        self.summary = try container.decodeIfPresent(String.self, forKey: .summary)
        // Try to decode source, but provide empty string if missing
        self.source = try container.decodeIfPresent(String.self, forKey: .source) ?? ""
        self.url = try container.decodeIfPresent(String.self, forKey: .url)
        self.topic = try container.decodeIfPresent(String.self, forKey: .topic)
    }
    
    private enum CodingKeys: String, CodingKey {
        case id, title, summary, source, url, topic
    }
    
    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
        hasher.combine(source)
        hasher.combine(url)
    }
    
    static func == (lhs: SourceItem, rhs: SourceItem) -> Bool {
        return lhs.id == rhs.id && lhs.source == rhs.source && lhs.url == rhs.url
    }
}

struct AuthResponse: Codable {
    let message: String
    let token: String
    let user: User
}

struct UserResponse: Codable {
    let user: User
}

struct ErrorResponse: Codable {
    let error: String
}

struct CustomTopicsResponse: Codable {
    let customTopics: [String]
}

struct SummaryHistoryResponse: Codable {
    let summaryHistory: [SummaryHistoryEntry]
}

struct LoginRequest: Codable {
    let email: String
    let password: String
}

struct SignupRequest: Codable {
    let email: String
    let password: String
}

struct TopicRequest: Codable {
    let topic: String
}

struct LocationRequest: Codable {
    let location: String
}

struct AdminAction: Codable, Identifiable {
    let id: String
    let adminEmail: String
    let targetEmail: String
    let action: String
    let details: String
    let timestamp: String
}

struct AdminActionsResponse: Codable {
    let adminActions: [AdminAction]
}

struct UserPreferences: Codable {
    let selectedVoice: String
    let playbackRate: Double
    let upliftingNewsOnly: Bool
    let length: String
    let lastFetchedTopics: [String]
    let selectedTopics: [String]?
    let excludedNewsSources: [String]
    let scheduledSummaries: [ScheduledSummary]
    let selectedCountry: String?
    
    enum CodingKeys: String, CodingKey {
        case selectedVoice
        case playbackRate
        case upliftingNewsOnly
        case length
        case lastFetchedTopics
        case selectedTopics
        case excludedNewsSources
        case selectedNewsSources // Legacy key for migration
        case scheduledSummaries
        case selectedCountry
    }
    
    init(selectedVoice: String, playbackRate: Double, upliftingNewsOnly: Bool, length: String, lastFetchedTopics: [String], selectedTopics: [String]?, excludedNewsSources: [String], scheduledSummaries: [ScheduledSummary], selectedCountry: String? = nil) {
        self.selectedVoice = selectedVoice
        self.playbackRate = playbackRate
        self.upliftingNewsOnly = upliftingNewsOnly
        self.length = length
        self.lastFetchedTopics = lastFetchedTopics
        self.selectedTopics = selectedTopics
        self.excludedNewsSources = excludedNewsSources
        self.scheduledSummaries = scheduledSummaries
        self.selectedCountry = selectedCountry
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.selectedVoice = try container.decode(String.self, forKey: .selectedVoice)
        self.playbackRate = try container.decode(Double.self, forKey: .playbackRate)
        self.upliftingNewsOnly = try container.decode(Bool.self, forKey: .upliftingNewsOnly)
        self.length = try container.decode(String.self, forKey: .length)
        self.lastFetchedTopics = try container.decode([String].self, forKey: .lastFetchedTopics)
        self.selectedTopics = try container.decodeIfPresent([String].self, forKey: .selectedTopics)
        // Support both new and legacy field names for migration
        if let excluded = try? container.decode([String].self, forKey: .excludedNewsSources) {
            self.excludedNewsSources = excluded
        } else if let selected = try? container.decode([String].self, forKey: .selectedNewsSources) {
            // Migrate old allowlist to new blocklist
            self.excludedNewsSources = selected
        } else {
            self.excludedNewsSources = []
        }
        self.scheduledSummaries = try container.decodeIfPresent([ScheduledSummary].self, forKey: .scheduledSummaries) ?? []
        self.selectedCountry = try container.decodeIfPresent(String.self, forKey: .selectedCountry)
    }
    
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(selectedVoice, forKey: .selectedVoice)
        try container.encode(playbackRate, forKey: .playbackRate)
        try container.encode(upliftingNewsOnly, forKey: .upliftingNewsOnly)
        try container.encode(length, forKey: .length)
        try container.encode(lastFetchedTopics, forKey: .lastFetchedTopics)
        try container.encodeIfPresent(selectedTopics, forKey: .selectedTopics)
        try container.encode(excludedNewsSources, forKey: .excludedNewsSources)
        try container.encode(scheduledSummaries, forKey: .scheduledSummaries)
        try container.encodeIfPresent(selectedCountry, forKey: .selectedCountry)
    }
}

struct NewsSource: Codable, Identifiable {
    let id: String
    let name: String
    let description: String
    let url: String
    let category: String
    let language: String
    let country: String
}

struct NewsSourcesResponse: Codable {
    let sources: [NewsSource]
    let sourcesByCategory: [String: [NewsSource]]
}

struct TrendingTopicsResponse: Codable {
    let trendingTopics: [String]
    let lastUpdated: String?
}

struct RecommendedTopicsResponse: Codable {
    let recommendedTopics: [String]
    let lastUpdated: String?
}

struct PredefinedTopicsResponse: Codable {
    let categories: [TopicCategory]
}

struct TopicCategory: Codable, Identifiable {
    let name: String
    let topics: [String]
    
    var id: String { name }
}

// MARK: - Scheduled Summaries

struct ScheduledSummary: Codable, Identifiable {
    let id: String
    let name: String
    let time: String // Format: "HH:mm"
    let topics: [String]
    let customTopics: [String]
    let days: [String] // Days of week: ["Monday", "Tuesday", etc.]
    let isEnabled: Bool
    let createdAt: String
    let lastRun: String?
    
    enum CodingKeys: String, CodingKey {
        case id
        case name
        case time
        case topics
        case customTopics
        case days
        case isEnabled
        case createdAt
        case lastRun
    }
    
    // Regular initializer for creating instances in code
    init(id: String, name: String, time: String, topics: [String], customTopics: [String], days: [String], isEnabled: Bool, createdAt: String, lastRun: String?) {
        self.id = id
        self.name = name
        self.time = time
        self.topics = topics
        self.customTopics = customTopics
        self.days = days
        self.isEnabled = isEnabled
        self.createdAt = createdAt
        self.lastRun = lastRun
    }
    
    // Custom initializer to handle missing fields gracefully
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        
        // Generate ID if missing
        let id = try container.decodeIfPresent(String.self, forKey: .id) ?? UUID().uuidString
        
        let name = try container.decodeIfPresent(String.self, forKey: .name) ?? "Scheduled Fetch"
        let time = try container.decodeIfPresent(String.self, forKey: .time) ?? "09:00"
        let topics = try container.decodeIfPresent([String].self, forKey: .topics) ?? []
        let customTopics = try container.decodeIfPresent([String].self, forKey: .customTopics) ?? []
        let days = try container.decodeIfPresent([String].self, forKey: .days) ?? []
        let isEnabled = try container.decodeIfPresent(Bool.self, forKey: .isEnabled) ?? true
        
        // Generate createdAt if missing
        let createdAt = try container.decodeIfPresent(String.self, forKey: .createdAt) ?? ISO8601DateFormatter().string(from: Date())
        
        let lastRun = try container.decodeIfPresent(String.self, forKey: .lastRun)
        
        // Use the regular initializer
        self.init(id: id, name: name, time: time, topics: topics, customTopics: customTopics, days: days, isEnabled: isEnabled, createdAt: createdAt, lastRun: lastRun)
    }
}

struct ScheduledSummariesResponse: Codable {
    let scheduledSummaries: [ScheduledSummary]
}

struct ScheduledSummaryTriggerResponse: Codable {
    let message: String
    let executedCount: Int
}

// MARK: - AI Assistant Models

struct ChatMessage: Codable, Identifiable {
    let id: String
    let role: String // "user" or "assistant"
    let content: String
    let timestamp: Date
    
    init(id: String = UUID().uuidString, role: String, content: String, timestamp: Date = Date()) {
        self.id = id
        self.role = role
        self.content = content
        self.timestamp = timestamp
    }
}

struct AssistantResponse: Codable {
    let response: String
    let suggestedQuestions: [String]?
    let fetchContext: FetchContextInfo?
}

struct FetchContextInfo: Codable {
    let summary: String
    let topics: [String]
}
