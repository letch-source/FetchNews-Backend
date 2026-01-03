//
//  NotificationManager.swift
//  FetchNews
//
//  Created for push notifications support
//

import Foundation
import UserNotifications
import UIKit

class NotificationManager: NSObject, ObservableObject {
    static let shared = NotificationManager()
    
    @Published var authorizationStatus: UNAuthorizationStatus = .notDetermined
    @Published var deviceToken: String?
    
    private override init() {
        super.init()
        checkAuthorizationStatus()
    }
    
    // Check current authorization status
    func checkAuthorizationStatus() {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            DispatchQueue.main.async {
                self.authorizationStatus = settings.authorizationStatus
            }
        }
    }
    
    // Request notification permissions
    func requestAuthorization() async -> Bool {
        do {
            let granted = try await UNUserNotificationCenter.current().requestAuthorization(
                options: [.alert, .sound, .badge]
            )
            
            await MainActor.run {
                self.authorizationStatus = granted ? .authorized : .denied
            }
            
            if granted {
                // Register for remote notifications
                await MainActor.run {
                    UIApplication.shared.registerForRemoteNotifications()
                }
            }
            
            return granted
        } catch {
            print("❌ Error requesting notification authorization: \(error)")
            return false
        }
    }
    
    // Register device token with backend
    func registerDeviceToken(_ token: Data) async {
        let tokenString = token.map { String(format: "%02.2hhx", $0) }.joined()
        
        await MainActor.run {
            self.deviceToken = tokenString
        }
        
        // Send token to backend
        await sendTokenToBackend(tokenString)
    }
    
    // Send device token to backend (public so it can be called after auth)
    func sendTokenToBackend(_ token: String) async {
        guard ApiClient.isAuthenticated else {
            print("⚠️ Not authenticated, skipping token registration")
            return
        }
        
        do {
            let endpoint = "/api/notifications/register-token"
            var req = URLRequest(url: ApiClient.base.appendingPathComponent(endpoint))
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            
            if let authToken = ApiClient.getAuthToken() {
                req.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
            }
            
            let body = ["deviceToken": token]
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
            
            let (data, response) = try await URLSession.shared.data(for: req)
            
            guard let httpResponse = response as? HTTPURLResponse else {
                throw NetworkError.invalidResponse
            }
            
            if httpResponse.statusCode == 200 {
                print("✅ Successfully registered push notification token")
            } else {
                let errorResponse = try? JSONDecoder().decode(ErrorResponse.self, from: data)
                print("❌ Failed to register token: \(errorResponse?.error ?? "Unknown error")")
            }
        } catch {
            print("❌ Error registering device token: \(error)")
        }
    }
    
    // Unregister device token
    func unregisterDeviceToken() async {
        guard ApiClient.isAuthenticated else {
            return
        }
        
        do {
            let endpoint = "/api/notifications/unregister-token"
            var req = URLRequest(url: ApiClient.base.appendingPathComponent(endpoint))
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            
            if let authToken = ApiClient.getAuthToken() {
                req.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
            }
            
            let (data, response) = try await URLSession.shared.data(for: req)
            
            guard let httpResponse = response as? HTTPURLResponse else {
                throw NetworkError.invalidResponse
            }
            
            if httpResponse.statusCode == 200 {
                await MainActor.run {
                    self.deviceToken = nil
                }
                print("✅ Successfully unregistered push notification token")
            } else {
                let errorResponse = try? JSONDecoder().decode(ErrorResponse.self, from: data)
                print("❌ Failed to unregister token: \(errorResponse?.error ?? "Unknown error")")
            }
        } catch {
            print("❌ Error unregistering device token: \(error)")
        }
    }
    
    // Handle notification tap
    func handleNotificationTap(userInfo: [AnyHashable: Any]) {
        guard let notificationType = userInfo["notificationType"] as? String else {
            return
        }
        
        switch notificationType {
        case "scheduledSummary":
            if let summaryId = userInfo["summaryId"] as? String {
                // Post notification to open summary
                NotificationCenter.default.post(
                    name: .openSummaryFromNotification,
                    object: nil,
                    userInfo: ["summaryId": summaryId]
                )
            }
        case "engagementReminder", "test":
            // Just open the app (default behavior)
            break
        default:
            break
        }
    }
}

// Notification names for handling notification taps
extension Notification.Name {
    static let openSummaryFromNotification = Notification.Name("openSummaryFromNotification")
}


