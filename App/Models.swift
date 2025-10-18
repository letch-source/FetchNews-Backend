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
        self.source = try container.decodeIfPresent(String.self, forKey: .source)
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

struct Combined: Codable {
    let id: String
    let title: String
    let summary: String
    let audioUrl: String?
    
    // Memberwise initializer
    init(id: String, title: String, summary: String, audioUrl: String?) {
        self.id = id
        self.title = title
        self.summary = summary
        self.audioUrl = audioUrl
    }
    
    // Convenience initializer with default id
    init(title: String, summary: String, audioUrl: String? = nil) {
        self.id = "combined"
        self.title = title
        self.summary = summary
        self.audioUrl = audioUrl
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
    }
    
    // Custom encoding to maintain consistency
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(title, forKey: .title)
        try container.encode(summary, forKey: .summary)
        try container.encodeIfPresent(audioUrl, forKey: .audioUrl)
    }
    
    private enum CodingKeys: String, CodingKey {
        case id, title, summary, text, audioUrl
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
    let isPremium: Bool
    let dailyUsageCount: Int
    let subscriptionId: String?
    let subscriptionExpiresAt: String?
    let customTopics: [String]
    let summaryHistory: [SummaryHistoryEntry]
}

struct SummaryHistoryEntry: Codable, Identifiable {
    let id: String
    let title: String
    let summary: String
    let topics: [String]
    let length: String
    let timestamp: String
    let audioUrl: String?
    let sources: [String]?
    
    // Custom decoder to handle missing sources field gracefully
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.id = try container.decode(String.self, forKey: .id)
        self.title = try container.decode(String.self, forKey: .title)
        self.summary = try container.decode(String.self, forKey: .summary)
        self.topics = try container.decode([String].self, forKey: .topics)
        self.length = try container.decode(String.self, forKey: .length)
        self.timestamp = try container.decode(String.self, forKey: .timestamp)
        self.audioUrl = try container.decodeIfPresent(String.self, forKey: .audioUrl)
        self.sources = try container.decodeIfPresent([String].self, forKey: .sources)
    }
    
    private enum CodingKeys: String, CodingKey {
        case id, title, summary, topics, length, timestamp, audioUrl, sources
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
    let lastFetchedTopics: [String]
    let selectedNewsSources: [String]
    
    enum CodingKeys: String, CodingKey {
        case selectedVoice
        case playbackRate
        case upliftingNewsOnly
        case lastFetchedTopics
        case selectedNewsSources
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
