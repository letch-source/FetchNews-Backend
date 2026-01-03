//
//  ApiClient.swift
//  FetchNews
//
//  Created by Finlay Smith on 8/14/25.
//

import Foundation

// Notification for token expiration
extension Notification.Name {
    static let userDidLogout = Notification.Name("userDidLogout")
    static let userDidLogin = Notification.Name("userDidLogin")
    static let tokenExpired = Notification.Name("tokenExpired")
}

final class ApiClient {
        // Production backend URL:
        static let base = URL(string: "https://fetchnews-backend.onrender.com")!
    private static var authToken: String?
    
    // MARK: - Authentication Methods
    
    static func setAuthToken(_ token: String?) {
        authToken = token
    }
    
    static func getAuthToken() -> String? {
        return authToken
    }
    
    static var isAuthenticated: Bool {
        return authToken != nil
    }
    
    static func setTimezone(_ timezone: String) async throws {
        let endpoint = "/api/auth/timezone"
        var req = URLRequest(url: base.appendingPathComponent(endpoint))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        if let token = authToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        let body = ["timezone": timezone]
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (data, response) = try await session.data(for: req)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.invalidResponse
        }
        
        if httpResponse.statusCode != 200 {
            let errorResponse = try JSONDecoder().decode(ErrorResponse.self, from: data)
            throw NetworkError.serverError(errorResponse.error)
        }
    }
    
    static func updateUserName(_ name: String?) async throws {
        let endpoint = "/api/auth/name"
        var req = URLRequest(url: base.appendingPathComponent(endpoint))
        req.httpMethod = "PUT"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        if let token = authToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        let body: [String: Any?] = ["name": name]
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (data, response) = try await session.data(for: req)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.invalidResponse
        }
        
        if httpResponse.statusCode != 200 {
            let errorResponse = try JSONDecoder().decode(ErrorResponse.self, from: data)
            throw NetworkError.serverError(errorResponse.error)
        }
    }
    
    static func authenticateWithGoogle(idToken: String) async throws -> AuthResponse {
        let endpoint = "/api/auth/google"
        var req = URLRequest(url: base.appendingPathComponent(endpoint))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body = ["idToken": idToken]
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (data, response) = try await session.data(for: req)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.invalidResponse
        }
        
        if httpResponse.statusCode == 200 {
            return try JSONDecoder().decode(AuthResponse.self, from: data)
        } else {
            let errorResponse = try JSONDecoder().decode(ErrorResponse.self, from: data)
            throw NetworkError.serverError(errorResponse.error)
        }
    }
    
    static func getCurrentUser() async throws -> UserResponse {
        let endpoint = "/api/auth/me"
        var req = URLRequest(url: base.appendingPathComponent(endpoint))
        req.httpMethod = "GET"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        if let token = authToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        let (data, response) = try await session.data(for: req)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.invalidResponse
        }
        
        if httpResponse.statusCode == 200 {
            return try JSONDecoder().decode(UserResponse.self, from: data)
        } else {
            let errorResponse = try JSONDecoder().decode(ErrorResponse.self, from: data)
            throw NetworkError.serverError(errorResponse.error)
        }
    }
    
    // MARK: - Receipt Validation
    
    static func validateReceipt(receipt: String, transactionID: String) async throws {
        let endpoint = "/api/subscriptions/validate-receipt"
        var req = URLRequest(url: base.appendingPathComponent(endpoint))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        if let token = authToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        let body = [
            "receipt": receipt,
            "transactionID": transactionID,
            "platform": "ios"
        ]
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (data, response) = try await session.data(for: req)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.invalidResponse
        }
        
        if httpResponse.statusCode != 200 {
            let errorResponse = try JSONDecoder().decode(ErrorResponse.self, from: data)
            throw NetworkError.serverError(errorResponse.error)
        }
    }
    
    static func verifyEmail(token: String) async throws -> String {
        let endpoint = "/api/auth/verify-email?token=\(token)"
        var req = URLRequest(url: base.appendingPathComponent(endpoint))
        req.httpMethod = "GET"
        
        let (data, response) = try await session.data(for: req)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.invalidResponse
        }
        
        if httpResponse.statusCode == 200 {
            let response = try JSONDecoder().decode([String: String].self, from: data)
            return response["message"] ?? "Email verified successfully"
        } else {
            let errorResponse = try JSONDecoder().decode(ErrorResponse.self, from: data)
            throw NetworkError.serverError(errorResponse.error)
        }
    }
    
    // MARK: - Custom Topics
    
    static func getCustomTopics() async throws -> [String] {
        let endpoint = "/api/custom-topics"
        var req = URLRequest(url: base.appendingPathComponent(endpoint))
        req.httpMethod = "GET"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        if let token = authToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        let (data, response) = try await session.data(for: req)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.invalidResponse
        }
        
        if httpResponse.statusCode == 200 {
            let response = try JSONDecoder().decode(CustomTopicsResponse.self, from: data)
            return response.customTopics
        } else {
            let errorResponse = try JSONDecoder().decode(ErrorResponse.self, from: data)
            throw NetworkError.serverError(errorResponse.error)
        }
    }
    
    static func addCustomTopic(_ topic: String) async throws -> [String] {
        let endpoint = "/api/custom-topics"
        var req = URLRequest(url: base.appendingPathComponent(endpoint))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        if let token = authToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        let body = ["topic": topic]
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (data, response) = try await session.data(for: req)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.invalidResponse
        }
        
        if httpResponse.statusCode == 200 {
            let response = try JSONDecoder().decode(CustomTopicsResponse.self, from: data)
            return response.customTopics
        } else {
            let errorResponse = try JSONDecoder().decode(ErrorResponse.self, from: data)
            throw NetworkError.serverError(errorResponse.error)
        }
    }
    
    static func removeCustomTopic(_ topic: String) async throws -> [String] {
        let endpoint = "/api/custom-topics/remove"
        var req = URLRequest(url: base.appendingPathComponent(endpoint))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        if let token = authToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        let body = ["topic": topic]
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (data, response) = try await session.data(for: req)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.invalidResponse
        }
        
        if httpResponse.statusCode == 200 {
            let response = try JSONDecoder().decode(CustomTopicsResponse.self, from: data)
            return response.customTopics
        } else {
            let errorResponse = try JSONDecoder().decode(ErrorResponse.self, from: data)
            throw NetworkError.serverError(errorResponse.error)
        }
    }
    
    static func updateCustomTopics(_ topics: [String]) async throws -> [String] {
        let endpoint = "/api/custom-topics"
        var req = URLRequest(url: base.appendingPathComponent(endpoint))
        req.httpMethod = "PUT"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        if let token = authToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        let body = ["customTopics": topics]
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (data, response) = try await session.data(for: req)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.invalidResponse
        }
        
        if httpResponse.statusCode == 200 {
            let response = try JSONDecoder().decode(CustomTopicsResponse.self, from: data)
            return response.customTopics
        } else {
            let errorResponse = try JSONDecoder().decode(ErrorResponse.self, from: data)
            throw NetworkError.serverError(errorResponse.error)
        }
    }
    
    static func deleteCustomTopics(_ topics: [String]) async throws -> [String] {
        let endpoint = "/api/custom-topics/bulk"
        var req = URLRequest(url: base.appendingPathComponent(endpoint))
        req.httpMethod = "DELETE"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        if let token = authToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        let body = ["topics": topics]
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (data, response) = try await session.data(for: req)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.invalidResponse
        }
        
        if httpResponse.statusCode == 200 {
            let response = try JSONDecoder().decode(CustomTopicsResponse.self, from: data)
            return response.customTopics
        } else {
            let errorResponse = try JSONDecoder().decode(ErrorResponse.self, from: data)
            throw NetworkError.serverError(errorResponse.error)
        }
    }
    
    // MARK: - Predefined Topics
    
    static func getPredefinedTopics() async throws -> PredefinedTopicsResponse {
        let endpoint = "/api/custom-topics/predefined"
        var req = URLRequest(url: base.appendingPathComponent(endpoint))
        req.httpMethod = "GET"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let (data, response) = try await session.data(for: req)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.invalidResponse
        }
        
        if httpResponse.statusCode == 200 {
            return try JSONDecoder().decode(PredefinedTopicsResponse.self, from: data)
        } else {
            let errorResponse = try JSONDecoder().decode(ErrorResponse.self, from: data)
            throw NetworkError.serverError(errorResponse.error)
        }
    }
    
    // MARK: - Trending Topics
    
    static func getTrendingTopics() async throws -> TrendingTopicsResponse {
        let endpoint = "/api/trending-topics"
        var req = URLRequest(url: base.appendingPathComponent(endpoint))
        req.httpMethod = "GET"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let (data, response) = try await session.data(for: req)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.invalidResponse
        }
        
        if httpResponse.statusCode == 200 {
            return try JSONDecoder().decode(TrendingTopicsResponse.self, from: data)
        } else {
            let errorResponse = try JSONDecoder().decode(ErrorResponse.self, from: data)
            throw NetworkError.serverError(errorResponse.error)
        }
    }
    
    // MARK: - Summary History
    
    static func getSummaryHistory() async throws -> [SummaryHistoryEntry] {
        let endpoint = "/api/summary-history"
        var req = URLRequest(url: base.appendingPathComponent(endpoint))
        req.httpMethod = "GET"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        if let token = authToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        let (data, response) = try await session.data(for: req)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.invalidResponse
        }
        
        if httpResponse.statusCode == 200 {
            
            do {
                let decoder = JSONDecoder()
                decoder.dateDecodingStrategy = .iso8601
                let summaryHistory = try decoder.decode([SummaryHistoryEntry].self, from: data)
                return summaryHistory
            } catch {
                if let decodingError = error as? DecodingError {
                    switch decodingError {
                    case .keyNotFound(_, _):
                        break
                    case .typeMismatch(_, _):
                        break
                    case .valueNotFound(_, _):
                        break
                    case .dataCorrupted(_):
                        break
                    @unknown default:
                        break
                    }
                }
                throw error
            }
        } else {
            
            // Handle token expiration specifically
            if httpResponse.statusCode == 401 {
                let errorResponse = try JSONDecoder().decode(ErrorResponse.self, from: data)
                if errorResponse.error.contains("Token expired") || errorResponse.error.contains("expired") {
                    // Clear the stored token and user data
                    DispatchQueue.main.async {
                        NotificationCenter.default.post(name: .tokenExpired, object: nil)
                    }
                    throw NetworkError.authenticationError("Your session has expired. Please log in again.")
                }
            }
            
            let errorResponse = try JSONDecoder().decode(ErrorResponse.self, from: data)
            throw NetworkError.serverError(errorResponse.error)
        }
    }
    
    static func addSummaryToHistory(summaryData: [String: Any]) async throws {
        let endpoint = "/api/summary-history"
        var req = URLRequest(url: base.appendingPathComponent(endpoint))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        if let token = authToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        let body = ["summaryData": summaryData]
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (data, response) = try await session.data(for: req)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.invalidResponse
        }
        
        if httpResponse.statusCode != 200 {
            let errorResponse = try JSONDecoder().decode(ErrorResponse.self, from: data)
            throw NetworkError.serverError(errorResponse.error)
        }
    }
    
    static func clearSummaryHistory() async throws {
        let endpoint = "/api/summary-history"
        var req = URLRequest(url: base.appendingPathComponent(endpoint))
        req.httpMethod = "DELETE"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        if let token = authToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        let (data, response) = try await session.data(for: req)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.invalidResponse
        }
        
        if httpResponse.statusCode != 200 {
            let errorResponse = try JSONDecoder().decode(ErrorResponse.self, from: data)
            throw NetworkError.serverError(errorResponse.error)
        }
    }
    
    static func deleteSummaryFromHistory(summaryId: String) async throws {
        let endpoint = "/api/summary-history/\(summaryId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? summaryId)"
        var req = URLRequest(url: base.appendingPathComponent(endpoint))
        req.httpMethod = "DELETE"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        if let token = authToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        let (data, response) = try await session.data(for: req)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.invalidResponse
        }
        
        if httpResponse.statusCode != 200 {
            let errorResponse = try JSONDecoder().decode(ErrorResponse.self, from: data)
            throw NetworkError.serverError(errorResponse.error)
        }
    }
    
    // MARK: - Saved Summaries API
    
    static func getSavedSummaries() async throws -> [SummaryHistoryEntry] {
        let endpoint = "/api/saved-summaries"
        var req = URLRequest(url: base.appendingPathComponent(endpoint))
        req.httpMethod = "GET"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        if let token = authToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        let (data, response) = try await session.data(for: req)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.invalidResponse
        }
        
        if httpResponse.statusCode == 200 {
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            
            do {
                struct SavedSummariesResponse: Codable {
                    let savedSummaries: [SummaryHistoryEntry]
                }
                let response = try decoder.decode(SavedSummariesResponse.self, from: data)
                return response.savedSummaries
            } catch {
                return []
            }
        } else {
            let errorResponse = try JSONDecoder().decode(ErrorResponse.self, from: data)
            throw NetworkError.serverError(errorResponse.error)
        }
    }
    
    static func saveSummary(summary: Combined, items: [Item], topics: [String], length: String) async throws {
        let endpoint = "/api/saved-summaries"
        var req = URLRequest(url: base.appendingPathComponent(endpoint))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        if let token = authToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        // Break up expression to help compiler - map items to sources
        var sources: [[String: Any]] = []
        for item in items {
            let sourceDict: [String: Any] = [
                "id": item.id,
                "title": item.title,
                "summary": item.summary,
                "source": item.source ?? "",
                "url": item.url ?? "",
                "topic": item.topic ?? ""
            ]
            sources.append(sourceDict)
        }
        
        let timestamp = ISO8601DateFormatter().string(from: Date())
        let audioUrl = summary.audioUrl ?? ""
        
        let summaryData: [String: Any] = [
            "id": summary.id,
            "title": summary.title,
            "summary": summary.summary,
            "topics": topics,
            "length": length,
            "timestamp": timestamp,
            "audioUrl": audioUrl,
            "sources": sources
        ]
        
        let body: [String: Any] = ["summaryData": summaryData]
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (data, response) = try await session.data(for: req)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.invalidResponse
        }
        
        if httpResponse.statusCode != 200 {
            let errorResponse = try JSONDecoder().decode(ErrorResponse.self, from: data)
            throw NetworkError.serverError(errorResponse.error)
        }
    }
    
    static func unsaveSummary(summaryId: String) async throws {
        let endpoint = "/api/saved-summaries/\(summaryId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? summaryId)"
        var req = URLRequest(url: base.appendingPathComponent(endpoint))
        req.httpMethod = "DELETE"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        if let token = authToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        let (data, response) = try await session.data(for: req)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.invalidResponse
        }
        
        if httpResponse.statusCode != 200 {
            let errorResponse = try JSONDecoder().decode(ErrorResponse.self, from: data)
            throw NetworkError.serverError(errorResponse.error)
        }
    }
    
    static func checkIfSummarySaved(summaryId: String) async throws -> Bool {
        let endpoint = "/api/saved-summaries/check/\(summaryId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? summaryId)"
        var req = URLRequest(url: base.appendingPathComponent(endpoint))
        req.httpMethod = "GET"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        if let token = authToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        let (data, response) = try await session.data(for: req)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.invalidResponse
        }
        
        if httpResponse.statusCode == 200 {
            struct SavedCheckResponse: Codable {
                let isSaved: Bool
            }
            let response = try JSONDecoder().decode(SavedCheckResponse.self, from: data)
            return response.isSaved
        } else {
            return false
        }
    }
    
    // MARK: - Recommended Topics API
    
    static func getRecommendedTopics() async throws -> [TopicSection] {
        let endpoint = "/api/recommended-topics"
        var req = URLRequest(url: base.appendingPathComponent(endpoint))
        req.httpMethod = "GET"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        if let token = authToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        let (data, response) = try await session.data(for: req)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.invalidResponse
        }
        
        if httpResponse.statusCode == 200 {
            struct RecommendedTopicsResponse: Codable {
                let topicSections: [TopicSection]
            }
            let decoder = JSONDecoder()
            let response = try decoder.decode(RecommendedTopicsResponse.self, from: data)
            return response.topicSections
        } else {
            let errorResponse = try? JSONDecoder().decode(ErrorResponse.self, from: data)
            throw NetworkError.serverError(errorResponse?.error ?? "Failed to fetch recommended topics")
        }
    }
    
    // MARK: - Admin Functions
    
    static func setUserPremiumStatus(email: String, isPremium: Bool) async throws {
        let endpoint = "/api/auth/admin/set-premium"
        var req = URLRequest(url: base.appendingPathComponent(endpoint))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        if let token = authToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        let body: [String: Any] = [
            "email": email,
            "isPremium": isPremium
        ]
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (data, response) = try await session.data(for: req)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.invalidResponse
        }
        
        if httpResponse.statusCode != 200 {
            let errorResponse = try JSONDecoder().decode(ErrorResponse.self, from: data)
            throw NetworkError.serverError(errorResponse.error)
        }
    }
    
    // Configure URLSession with optimized timeout and connection settings
    private static let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 60.0  // Increased for ChatGPT processing
        config.timeoutIntervalForResource = 90.0  // Increased for ChatGPT processing
        config.waitsForConnectivity = true
        config.allowsCellularAccess = true
        config.requestCachePolicy = .useProtocolCachePolicy
        config.urlCache = URLCache(memoryCapacity: 10 * 1024 * 1024, diskCapacity: 50 * 1024 * 1024) // 10MB memory, 50MB disk
        return URLSession(configuration: config)
    }()

    enum Length: Int, CaseIterable, Identifiable {
        case short = 200, medium = 1000, long = 2000
        var id: Int { rawValue }
        var label: String {
            switch self {
            case .short: return "Short"
            case .medium: return "Medium"
            case .long: return "Long"
            }
        }
    }

    static func summarize(topics: [String], wordCount: Int, skipTTS: Bool = true, goodNewsOnly: Bool = false, country: String? = nil) async throws -> SummarizeResponse {
        let endpoint = topics.count == 1 ? "/api/summarize" : "/api/summarize/batch"
        var comps = URLComponents(url: base.appendingPathComponent(endpoint), resolvingAgainstBaseURL: false)!
        if skipTTS { comps.queryItems = [URLQueryItem(name: "noTts", value: "1")] }
        let url = comps.url!

        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")

        // Add authentication header if available
        if let token = authToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let body: [String: Any]
        if topics.count == 1 {
            // Single topic - send directly
            var singleBody: [String: Any] = ["topics": topics, "wordCount": wordCount, "goodNewsOnly": goodNewsOnly]
            if let country = country {
                singleBody["country"] = country
            }
            body = singleBody
        } else {
            // Multi-topic - wrap in batches array
            var batchBody: [String: Any] = ["topics": topics, "wordCount": wordCount, "goodNewsOnly": goodNewsOnly]
            if let country = country {
                batchBody["country"] = country
            }
            body = ["batches": [batchBody]]
        }
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        // Debug: Log the request details
        print("Making summarize request to: \(req.url?.absoluteString ?? "unknown")")
        print("Request body: \(body)")
        if let token = authToken {
            print("Using auth token: \(String(token.prefix(20)))...")
        } else {
            print("No auth token available")
        }

        do {
            let (data, resp) = try await session.data(for: req)
            guard let http = resp as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                let statusCode = (resp as? HTTPURLResponse)?.statusCode ?? -1
                print("Summarize API error: HTTP \(statusCode)")
                
                // Log response body for debugging
                if let responseString = String(data: data, encoding: .utf8) {
                    print("Error response body: \(responseString)")
                }
                
                throw URLError(.badServerResponse)
            }
            
            
            // Handle different response formats based on endpoint
            if topics.count == 1 {
                // Single topic - use standard response format
            return try JSONDecoder().decode(SummarizeResponse.self, from: data)
            } else {
                // Multi-topic - use batch response format and convert
                let batchResponse = try JSONDecoder().decode(BatchSummarizeResponse.self, from: data)
                return convertBatchResponseToSummarizeResponse(batchResponse)
            }
        } catch {
            // Check if this is a cancellation - don't log or treat as error
            if let urlError = error as? URLError, urlError.code == .cancelled {
                // Silently handle cancellation - this is expected when tasks are cancelled
                throw CancellationError()
            }
            
            // Check for Swift Task cancellation
            if error is CancellationError {
                throw error
            }
            
            print("Error in summarize: \(error)")
            if let urlError = error as? URLError {
                switch urlError.code {
                case .notConnectedToInternet, .networkConnectionLost:
                    throw NetworkError.noConnection
                case .timedOut:
                    throw NetworkError.timeout
                case .cannotConnectToHost, .cannotFindHost:
                    throw NetworkError.serverUnreachable
                default:
                    throw NetworkError.unknown(error)
                }
            } else if error is DecodingError {
                throw NetworkError.decodingError(error)
            }
            throw NetworkError.unknown(error)
        }
    }

    // MARK: - Helper Methods
    
    private static func convertBatchResponseToSummarizeResponse(_ batchResponse: BatchSummarizeResponse) -> SummarizeResponse {
        // Flatten all items from all batch results
        let allItems = batchResponse.results.flatMap { $0.items }
        
        // Try to find a combined summary from the batch results
        // Look for the first non-nil combined summary, or create one from the first result
        let combinedSummary: Combined?
        if let firstCombined = batchResponse.results.first(where: { $0.combined != nil })?.combined {
            combinedSummary = firstCombined
        } else if let firstResult = batchResponse.results.first, !firstResult.items.isEmpty {
            // Create a combined summary from the first item if no combined summary exists
            let firstItem = firstResult.items.first!
            combinedSummary = Combined(
                title: "Multi-Topic Summary",
                summary: firstItem.summary,
                audioUrl: firstItem.audioUrl
            )
        } else {
            combinedSummary = nil
        }
        
        return SummarizeResponse(combined: combinedSummary, items: allItems)
    }

    /// Requests TTS. `speed` is optional hint for the backend (safe to send even if ignored).
    static func tts(text: String, voice: String? = nil, speed: Double? = nil) async throws -> String? {
        let url = base.appendingPathComponent("/api/tts")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        // Add authentication header if available
        if let token = authToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        var body: [String: Any] = ["text": text]
        if let voice { body["voice"] = voice }
        if let speed { body["speed"] = speed }
        
        req.httpBody = try JSONSerialization.data(withJSONObject: body)

        do {
            let (data, resp) = try await session.data(for: req)
            guard let http = resp as? HTTPURLResponse else {
                print("❌ [TTS] Invalid response type")
                throw URLError(.badServerResponse)
            }
            
            guard (200..<300).contains(http.statusCode) else {
                let statusCode = http.statusCode
                let responseBody = String(data: data, encoding: .utf8) ?? "Unable to decode"
                print("❌ [TTS] API error: HTTP \(statusCode)")
                print("   Response body: \(responseBody)")
                throw URLError(.badServerResponse)
            }
            
            guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                print("❌ [TTS] Invalid JSON response")
                throw NetworkError.decodingError(NSError(domain: "TTS", code: 0, userInfo: [NSLocalizedDescriptionKey: "Invalid response format"]))
            }
            
            let audioUrl = json["audioUrl"] as? String
            if audioUrl == nil {
                print("⚠️ [TTS] Response missing audioUrl field. Response: \(json)")
            }
            return audioUrl
        } catch {
            // Check if this is a cancellation - don't log or treat as error
            if let urlError = error as? URLError, urlError.code == .cancelled {
                // Silently handle cancellation - this is expected when tasks are cancelled
                throw CancellationError()
            }
            
            // Check for Swift Task cancellation
            if error is CancellationError {
                throw error
            }
            
            print("Error in TTS: \(error)")
            if let urlError = error as? URLError {
                switch urlError.code {
                case .notConnectedToInternet, .networkConnectionLost:
                    throw NetworkError.noConnection
                case .timedOut:
                    throw NetworkError.timeout
                case .cannotConnectToHost, .cannotFindHost:
                    throw NetworkError.serverUnreachable
                default:
                    throw NetworkError.unknown(error)
                }
            } else if error is DecodingError {
                throw NetworkError.decodingError(error)
            }
            throw NetworkError.unknown(error)
        }
    }
    
    // MARK: - Authentication
    
    static func signup(email: String, password: String) async throws -> AuthResponse {
        let url = base.appendingPathComponent("/api/auth/signup")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body = SignupRequest(email: email, password: password)
        req.httpBody = try JSONEncoder().encode(body)
        
        do {
            let (data, resp) = try await session.data(for: req)
            guard let http = resp as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                let statusCode = (resp as? HTTPURLResponse)?.statusCode ?? -1
                print("Signup API error: HTTP \(statusCode)")
                throw URLError(.badServerResponse)
            }
            return try JSONDecoder().decode(AuthResponse.self, from: data)
        } catch {
            print("Error in signup: \(error)")
            if let urlError = error as? URLError {
                switch urlError.code {
                case .notConnectedToInternet, .networkConnectionLost:
                    throw NetworkError.noConnection
                case .timedOut:
                    throw NetworkError.timeout
                case .cannotConnectToHost, .cannotFindHost:
                    throw NetworkError.serverUnreachable
                default:
                    throw NetworkError.unknown(error)
                }
            } else if error is DecodingError {
                throw NetworkError.decodingError(error)
            }
            throw NetworkError.unknown(error)
        }
    }
    
    // MARK: - Admin Actions
    
    static func getAdminActions() async throws -> [AdminAction] {
        let endpoint = "/api/admin-actions"
        var req = URLRequest(url: base.appendingPathComponent(endpoint))
        req.httpMethod = "GET"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        if let token = authToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        let (data, response) = try await session.data(for: req)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.invalidResponse
        }
        
        if httpResponse.statusCode == 200 {
            let response = try JSONDecoder().decode(AdminActionsResponse.self, from: data)
            return response.adminActions
        } else {
            let errorResponse = try JSONDecoder().decode(ErrorResponse.self, from: data)
            throw NetworkError.serverError(errorResponse.error)
        }
    }
    
    static func setUserPremiumStatus(email: String, isPremium: Bool, adminEmail: String) async throws {
        let endpoint = "/api/auth/admin/set-premium"
        var req = URLRequest(url: base.appendingPathComponent(endpoint))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        if let token = authToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        let body: [String: Any] = [
            "email": email,
            "isPremium": isPremium,
            "adminEmail": adminEmail
        ]
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (data, response) = try await session.data(for: req)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.invalidResponse
        }
        
        if httpResponse.statusCode != 200 {
            let errorResponse = try JSONDecoder().decode(ErrorResponse.self, from: data)
            throw NetworkError.serverError(errorResponse.error)
        }
    }
    
    // MARK: - User Preferences Methods
    
    static func getUserPreferences() async throws -> UserPreferences {
        let endpoint = "/api/preferences"
        var req = URLRequest(url: base.appendingPathComponent(endpoint))
        req.httpMethod = "GET"
        
        if let token = authToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        let (data, response) = try await session.data(for: req)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.invalidResponse
        }
        
        if httpResponse.statusCode != 200 {
            let errorResponse = try JSONDecoder().decode(ErrorResponse.self, from: data)
            throw NetworkError.serverError(errorResponse.error)
        }
        
        let preferences = try JSONDecoder().decode(UserPreferences.self, from: data)
        return preferences
    }
    
    static func updateUserPreferences(_ preferences: UserPreferences) async throws -> UserPreferences {
        let endpoint = "/api/preferences"
        var req = URLRequest(url: base.appendingPathComponent(endpoint))
        req.httpMethod = "PUT"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        if let token = authToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        let encoder = JSONEncoder()
        req.httpBody = try encoder.encode(preferences)
        
        let (data, response) = try await session.data(for: req)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.invalidResponse
        }
        
        if httpResponse.statusCode != 200 {
            let errorResponse = try JSONDecoder().decode(ErrorResponse.self, from: data)
            throw NetworkError.serverError(errorResponse.error)
        }
        
        let updatedPreferences = try JSONDecoder().decode(UserPreferences.self, from: data)
        return updatedPreferences
    }
    
    static func updateUserPreference(_ preference: String, value: Any) async throws -> UserPreferences {
        let endpoint = "/api/preferences/\(preference)"
        var req = URLRequest(url: base.appendingPathComponent(endpoint))
        req.httpMethod = "PATCH"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        if let token = authToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        let body = ["value": value]
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (data, response) = try await session.data(for: req)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.invalidResponse
        }
        
        if httpResponse.statusCode != 200 {
            let errorResponse = try JSONDecoder().decode(ErrorResponse.self, from: data)
            throw NetworkError.serverError(errorResponse.error)
        }
        
        let preferences = try JSONDecoder().decode(UserPreferences.self, from: data)
        return preferences
    }
    
    // MARK: - News Sources API
    
    static func getAvailableNewsSources() async throws -> NewsSourcesResponse {
        let endpoint = "/api/news-sources"
        var req = URLRequest(url: base.appendingPathComponent(endpoint))
        req.httpMethod = "GET"
        
        if let token = authToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        let (data, response) = try await session.data(for: req)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.invalidResponse
        }
        
        if httpResponse.statusCode == 200 {
            let response = try JSONDecoder().decode(NewsSourcesResponse.self, from: data)
            // Group sources by category for the frontend
            let sourcesByCategory = Dictionary(grouping: response.sources) { $0.category }
            return NewsSourcesResponse(sources: response.sources, sourcesByCategory: sourcesByCategory)
        } else {
            let errorResponse = try? JSONDecoder().decode(ErrorResponse.self, from: data)
            throw NetworkError.serverError(errorResponse?.error ?? "Failed to fetch news sources")
        }
    }
    
    static func getExcludedNewsSources() async throws -> [String] {
        // Get excluded news sources from user preferences
        let preferences = try await getUserPreferences()
        return preferences.excludedNewsSources
    }
    
    static func updateExcludedNewsSources(_ sources: [String]) async throws -> [String] {
        let endpoint = "/api/news-sources"
        var req = URLRequest(url: base.appendingPathComponent(endpoint))
        req.httpMethod = "PUT"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        if let token = authToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        let body = ["excludedSources": sources]
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (data, response) = try await session.data(for: req)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.invalidResponse
        }
        
        if httpResponse.statusCode == 200 {
            let response = try JSONDecoder().decode([String: [String]].self, from: data)
            return response["excludedSources"] ?? []
        } else {
            let errorResponse = try? JSONDecoder().decode(ErrorResponse.self, from: data)
            throw NetworkError.serverError(errorResponse?.error ?? "Failed to update selected news sources")
        }
    }
    
    // MARK: - Scheduled Summaries API
    
    static func getScheduledSummaries() async throws -> [ScheduledSummary] {
        let endpoint = "/api/scheduled-summaries"
        var req = URLRequest(url: base.appendingPathComponent(endpoint))
        req.httpMethod = "GET"
        if let token = authToken { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        let (data, response) = try await session.data(for: req)
        guard let httpResponse = response as? HTTPURLResponse else { throw NetworkError.invalidResponse }
        if httpResponse.statusCode == 200 {
            let response = try JSONDecoder().decode(ScheduledSummariesResponse.self, from: data)
            return response.scheduledSummaries
        } else {
            let errorResponse = try? JSONDecoder().decode(ErrorResponse.self, from: data)
            throw NetworkError.serverError(errorResponse?.error ?? "Failed to fetch scheduled summaries")
        }
    }
    
    static func createScheduledSummary(_ summary: ScheduledSummary) async throws -> ScheduledSummary {
        let endpoint = "/api/scheduled-summaries"
        var req = URLRequest(url: base.appendingPathComponent(endpoint))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token = authToken { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        req.httpBody = try JSONEncoder().encode(summary)
        let (data, response) = try await session.data(for: req)
        guard let httpResponse = response as? HTTPURLResponse else { throw NetworkError.invalidResponse }
        if httpResponse.statusCode == 201 {
            return try JSONDecoder().decode(ScheduledSummary.self, from: data)
        } else {
            let errorResponse = try? JSONDecoder().decode(ErrorResponse.self, from: data)
            throw NetworkError.serverError(errorResponse?.error ?? "Failed to create scheduled summary")
        }
    }
    
    static func updateScheduledSummary(_ summary: ScheduledSummary, timezone: String? = nil) async throws -> ScheduledSummary {
        let endpoint = "/api/scheduled-summaries/\(summary.id)"
        var req = URLRequest(url: base.appendingPathComponent(endpoint))
        req.httpMethod = "PUT"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token = authToken { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        
        // Include timezone if provided
        var body: [String: Any] = [
            "id": summary.id,
            "name": summary.name,
            "time": summary.time,
            "topics": summary.topics,
            "customTopics": summary.customTopics,
            "days": summary.days,
            "isEnabled": summary.isEnabled,
            "createdAt": summary.createdAt
        ]
        if let lastRun = summary.lastRun {
            body["lastRun"] = lastRun
        }
        if let timezone = timezone {
            body["timezone"] = timezone
        }
        
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await session.data(for: req)
        guard let httpResponse = response as? HTTPURLResponse else { throw NetworkError.invalidResponse }
        if httpResponse.statusCode == 200 {
            return try JSONDecoder().decode(ScheduledSummary.self, from: data)
        } else {
            let errorResponse = try? JSONDecoder().decode(ErrorResponse.self, from: data)
            throw NetworkError.serverError(errorResponse?.error ?? "Failed to update scheduled summary")
        }
    }
    
        static func deleteScheduledSummary(id: String) async throws {
            let endpoint = "/api/scheduled-summaries/\(id)"
            var req = URLRequest(url: base.appendingPathComponent(endpoint))
            req.httpMethod = "DELETE"
            if let token = authToken { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
            let (data, response) = try await session.data(for: req)
            guard let httpResponse = response as? HTTPURLResponse else { throw NetworkError.invalidResponse }
            if httpResponse.statusCode != 200 {
                let errorResponse = try? JSONDecoder().decode(ErrorResponse.self, from: data)
                throw NetworkError.serverError(errorResponse?.error ?? "Failed to delete scheduled summary")
            }
        }
        
        static func triggerScheduledSummaries() async throws -> ScheduledSummaryTriggerResponse {
            let endpoint = "/api/scheduled-summaries/execute"
            var req = URLRequest(url: base.appendingPathComponent(endpoint))
            req.httpMethod = "POST"
            if let token = authToken { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
            let (data, response) = try await session.data(for: req)
            guard let httpResponse = response as? HTTPURLResponse else { throw NetworkError.invalidResponse }
            if httpResponse.statusCode == 200 {
                return try JSONDecoder().decode(ScheduledSummaryTriggerResponse.self, from: data)
            } else {
                let errorResponse = try? JSONDecoder().decode(ErrorResponse.self, from: data)
                throw NetworkError.serverError(errorResponse?.error ?? "Failed to trigger scheduled summaries")
            }
        }
    
    // MARK: - Notifications
    
    static func sendFetchReadyNotification(fetchTitle: String) async throws {
        guard isAuthenticated else {
            print("[NOTIFICATIONS] Not authenticated, skipping notification")
            return
        }
        
        let endpoint = "/api/notifications/fetch-ready"
        var req = URLRequest(url: base.appendingPathComponent(endpoint))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        if let token = authToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        let body = ["fetchTitle": fetchTitle]
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (data, response) = try await session.data(for: req)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.invalidResponse
        }
        
        if httpResponse.statusCode == 200 {
            print("[NOTIFICATIONS] Successfully requested notification for: \(fetchTitle)")
        } else {
            let errorResponse = try? JSONDecoder().decode(ErrorResponse.self, from: data)
            print("[NOTIFICATIONS] Failed to send notification: \(errorResponse?.error ?? "Unknown error")")
            // Don't throw - notification failure shouldn't break the app
        }
    }
    
    // MARK: - Article Feedback
    
    static func submitArticleFeedbackWithComment(
        articleId: String,
        url: String?,
        title: String?,
        source: String?,
        topic: String?,
        feedback: String,
        comment: String?
    ) async throws {
        let endpoint = "/api/article-feedback/with-comment"
        var req = URLRequest(url: base.appendingPathComponent(endpoint))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        if let token = authToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        let body: [String: Any?] = [
            "articleId": articleId,
            "url": url,
            "title": title,
            "source": source,
            "topic": topic,
            "feedback": feedback,
            "comment": comment
        ]
        req.httpBody = try JSONSerialization.data(withJSONObject: body.compactMapValues { $0 })
        
        let (data, response) = try await session.data(for: req)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.invalidResponse
        }
        
        if httpResponse.statusCode != 200 {
            let errorResponse = try? JSONDecoder().decode(ErrorResponse.self, from: data)
            throw NetworkError.serverError(errorResponse?.error ?? "Failed to submit feedback")
        }
    }
    
    // MARK: - AI Assistant Methods
    
    /// Ask the AI assistant about a fetch
    static func askFetchAssistant(
        fetchId: String,
        message: String,
        conversationHistory: [[String: String]],
        audioProgress: Int? = nil,
        currentTime: String? = nil,
        totalDuration: String? = nil
    ) async throws -> AssistantResponse {
        let endpoint = "/api/fetch-assistant"
        var req = URLRequest(url: base.appendingPathComponent(endpoint))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        guard let token = authToken else {
            throw NetworkError.authenticationError("Not authenticated")
        }
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        
        var body: [String: Any] = [
            "fetchId": fetchId,
            "userMessage": message,
            "conversationHistory": conversationHistory
        ]
        
        // Add audio position context if available
        if let progress = audioProgress {
            body["audioProgress"] = progress
        }
        if let time = currentTime {
            body["currentTime"] = time
        }
        if let duration = totalDuration {
            body["totalDuration"] = duration
        }
        
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (data, response) = try await session.data(for: req)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.invalidResponse
        }
        
        if httpResponse.statusCode != 200 {
            let errorResponse = try? JSONDecoder().decode(ErrorResponse.self, from: data)
            throw NetworkError.serverError(errorResponse?.error ?? "Failed to get assistant response")
        }
        
        let decoder = JSONDecoder()
        return try decoder.decode(AssistantResponse.self, from: data)
    }
    
    /// Convert text to speech using the TTS endpoint
    static func textToSpeech(text: String, voice: String, speed: Double = 1.0) async throws -> URL {
        guard let audioPath = try await tts(text: text, voice: voice, speed: speed) else {
            throw NetworkError.serverError("No audio URL returned")
        }
        
        // If it's a full URL, return it directly
        if let url = URL(string: audioPath), url.scheme != nil {
            return url
        }
        
        // Otherwise, construct the full URL from the base
        var path = audioPath
        if !path.hasPrefix("/") {
            path = "/" + path
        }
        
        guard let url = URL(string: base.absoluteString + path) else {
            throw NetworkError.serverError("Invalid audio URL")
        }
        
        return url
    }
    
}
