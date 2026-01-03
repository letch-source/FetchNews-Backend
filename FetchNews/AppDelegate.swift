//
//  AppDelegate.swift
//  FetchNews
//
//  Handles app lifecycle events for push notifications and Google Sign-In
//

import UIKit
import UserNotifications
import GoogleSignIn

class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey : Any]? = nil
    ) -> Bool {
        // Set up notification delegate
        UNUserNotificationCenter.current().delegate = NotificationDelegate.shared
        
        // Clear app icon badge when app launches (iOS 17+ API)
        if #available(iOS 17.0, *) {
            UNUserNotificationCenter.current().setBadgeCount(0)
        } else {
            UIApplication.shared.applicationIconBadgeNumber = 0
        }
        
        return true
    }
    
    // Handle URL callbacks for Google Sign-In
    func application(
        _ app: UIApplication,
        open url: URL,
        options: [UIApplication.OpenURLOptionsKey : Any] = [:]
    ) -> Bool {
        // Handle Google Sign-In callback
        return GIDSignIn.sharedInstance.handle(url)
    }
    
    // Handle device token registration
    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        Task {
            await NotificationManager.shared.registerDeviceToken(deviceToken)
        }
    }
    
    // Handle registration failure
    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        print("❌ Failed to register for remote notifications: \(error.localizedDescription)")
    }
    
    // Handle remote notification when app is in background or closed
    func application(
        _ application: UIApplication,
        didReceiveRemoteNotification userInfo: [AnyHashable: Any],
        fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
    ) {
        print("📬 Received remote notification: \(userInfo)")
        
        // The notification will be handled by UNUserNotificationCenterDelegate
        // This method is called for background/closed app state
        // The notification will be displayed by the system
        
        // Call completion handler
        completionHandler(.newData)
    }
}


