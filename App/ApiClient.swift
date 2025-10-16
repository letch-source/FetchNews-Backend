//
//  ApiClient.swift
//  FetchNews
//
//  Created by Finlay Smith on 8/14/25.
//

import Foundation

final class ApiClient {
    // Set to your Render backend base URL:
    static let base = URL(string: "https://fetchnews-backend.onrender.com")!
    private static var authToken: String?
    
    // MARK: - Authentication Methods
    
    static func setAuthToken(_ token: String?) {
        authToken = token
    }
    
    static var isAuthenticated: Bool {
        return authToken != nil
    }
    
    static func register(email: String, password: String) async throws -> AuthResponse {
        let endpoint = "/api/auth/register"
        var req = URLRequest(url: base.appendingPathComponent(endpoint))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body = ["email": email, "password": password]
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (data, response) = try await session.data(for: req)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.invalidResponse
        }
        
        if httpResponse.statusCode == 201 {
            return try JSONDecoder().decode(AuthResponse.self, from: data)
        } else {
            let errorResponse = try JSONDecoder().decode(ErrorResponse.self, from: data)
            throw NetworkError.serverError(errorResponse.error)
        }
    }
    
    static func login(email: String, password: String) async throws -> AuthResponse {
        let endpoint = "/api/auth/login"
        var req = URLRequest(url: base.appendingPathComponent(endpoint))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body = ["email": email, "password": password]
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
    
    // MARK: - Password Reset
    
    static func requestPasswordReset(email: String) async throws -> String {
        let endpoint = "/api/auth/forgot-password"
        var req = URLRequest(url: base.appendingPathComponent(endpoint))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body = ["email": email]
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (data, response) = try await session.data(for: req)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.invalidResponse
        }
        
        if httpResponse.statusCode == 200 {
            let response = try JSONDecoder().decode([String: String].self, from: data)
            return response["message"] ?? "Password reset email sent"
        } else {
            let errorResponse = try JSONDecoder().decode(ErrorResponse.self, from: data)
            throw NetworkError.serverError(errorResponse.error)
        }
    }
    
    static func resetPassword(token: String, newPassword: String) async throws -> String {
        let endpoint = "/api/auth/reset-password"
        var req = URLRequest(url: base.appendingPathComponent(endpoint))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body = [
            "token": token,
            "newPassword": newPassword
        ]
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (data, response) = try await session.data(for: req)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.invalidResponse
        }
        
        if httpResponse.statusCode == 200 {
            let response = try JSONDecoder().decode([String: String].self, from: data)
            return response["message"] ?? "Password reset successful"
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
        let endpoint = "/api/custom-topics/\(topic.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? topic)"
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
            // Debug: Log the raw JSON response
            if let jsonString = String(data: data, encoding: .utf8) {
                print("Summary History API Response JSON: \(jsonString)")
            }
            
            do {
                let decoder = JSONDecoder()
                decoder.dateDecodingStrategy = .iso8601
                let response = try decoder.decode(SummaryHistoryResponse.self, from: data)
                return response.summaryHistory
            } catch {
                print("Summary History JSON Decoding Error: \(error)")
                if let decodingError = error as? DecodingError {
                    switch decodingError {
                    case .keyNotFound(let key, let context):
                        print("Missing key '\(key)' in \(context.debugDescription)")
                    case .typeMismatch(let type, let context):
                        print("Type mismatch for type \(type) in \(context.debugDescription)")
                    case .valueNotFound(let type, let context):
                        print("Value not found for type \(type) in \(context.debugDescription)")
                    case .dataCorrupted(let context):
                        print("Data corrupted: \(context.debugDescription)")
                    @unknown default:
                        print("Unknown decoding error")
                    }
                }
                throw error
            }
        } else {
            // Debug: Log error response
            if let jsonString = String(data: data, encoding: .utf8) {
                print("Summary History API Error Response: \(jsonString)")
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

    static func summarize(topics: [String], wordCount: Int, skipTTS: Bool = true, goodNewsOnly: Bool = false) async throws -> SummarizeResponse {
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
            body = ["topics": topics, "wordCount": wordCount, "goodNewsOnly": goodNewsOnly]
        } else {
            // Multi-topic - wrap in batches array
            body = ["batches": [["topics": topics, "wordCount": wordCount, "goodNewsOnly": goodNewsOnly]]]
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
            
            // Debug: Log the raw JSON response
            if let jsonString = String(data: data, encoding: .utf8) {
                print("API Response JSON: \(jsonString)")
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
            guard let http = resp as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                let statusCode = (resp as? HTTPURLResponse)?.statusCode ?? -1
                print("TTS API error: HTTP \(statusCode)")
                throw URLError(.badServerResponse)
            }
            let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
            return json?["audioUrl"] as? String
        } catch {
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
    
}
