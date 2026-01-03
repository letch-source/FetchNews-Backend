//
//  AdminView.swift
//  FetchNews
//
//  Created by Finlay Smith on 8/14/25.
//

import SwiftUI

struct AdminView: View {
    @EnvironmentObject var authVM: AuthVM
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var isPremium = true
    @State private var isLoading = false
    @State private var showingAlert = false
    @State private var alertMessage = ""
    @State private var alertTitle = ""
    @State private var adminActions: [AdminAction] = []
    @State private var isLoadingActions = false
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 30) {
                // Header
                VStack(spacing: 16) {
                    Image(systemName: "person.crop.circle.badge.checkmark")
                        .font(.system(size: 60))
                        .foregroundColor(.blue)
                    
                    Text("Admin Panel")
                        .font(.largeTitle)
                        .fontWeight(.bold)
                    
                    Text("Manage user premium status")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
                .padding(.top, 40)
                
                // Form
                VStack(spacing: 20) {
                    // Email field
                    VStack(alignment: .leading, spacing: 8) {
                        Text("User Email")
                            .font(.headline)
                        TextField("Enter user's email address", text: $email)
                            .textFieldStyle(RoundedBorderTextFieldStyle())
                            .keyboardType(.emailAddress)
                            .autocapitalization(.none)
                            .disableAutocorrection(true)
                    }
                    
                    // Premium status toggle
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Premium Status")
                            .font(.headline)
                        
                        HStack {
                            Toggle("Premium User", isOn: $isPremium)
                                .toggleStyle(SwitchToggleStyle(tint: .blue))
                            
                            Spacer()
                            
                            Text(isPremium ? "Premium" : "Free")
                                .font(.subheadline)
                                .foregroundColor(isPremium ? .green : .orange)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 4)
                                .background(isPremium ? Color.green.opacity(0.1) : Color.orange.opacity(0.1))
                                .cornerRadius(8)
                        }
                    }
                    
                    // Action button
                    Button(action: {
                        Task {
                            await updateUserStatus()
                        }
                    }) {
                        HStack {
                            if isLoading {
                                ProgressView()
                                    .scaleEffect(0.8)
                                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                            }
                            Text(isLoading ? "Updating..." : "Update User Status")
                        }
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(email.isEmpty ? Color.gray : Color.blue)
                        .foregroundColor(.white)
                        .cornerRadius(10)
                    }
                    .disabled(email.isEmpty || isLoading)
                    
                    // Info text
                    Text("This will update the user's premium status immediately. Changes take effect on their next app refresh.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                }
                .padding(.horizontal, 32)
                
                Spacer()
                
                // Recent actions
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Text("Recent Actions")
                            .font(.headline)
                        Spacer()
                        if isLoadingActions {
                            ProgressView()
                                .scaleEffect(0.8)
                        } else {
                            Button(action: {
                                Task {
                                    await loadAdminActions()
                                }
                            }) {
                                Image(systemName: "arrow.clockwise")
                                    .font(.caption)
                                    .foregroundColor(.blue)
                            }
                        }
                    }
                    .padding(.horizontal)
                    
                    if adminActions.isEmpty && !isLoadingActions {
                        Text("No admin actions yet")
                            .foregroundColor(.secondary)
                            .padding(.horizontal)
                    } else {
                        ScrollView {
                            LazyVStack(spacing: 8) {
                                ForEach(adminActions) { action in
                                    ActionRow(
                                        email: action.targetEmail,
                                        action: formatAction(action.action),
                                        timestamp: formatTimestamp(action.timestamp)
                                    )
                                }
                            }
                            .padding(.horizontal)
                        }
                        .frame(maxHeight: 200)
                    }
                }
                
                // Add bottom padding to ensure content is visible above keyboard
                Color.clear.frame(height: 100)
                }
            }
            .padding(.bottom, 20)
        }
        .navigationTitle("Admin")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button("Close") {
                    dismiss()
                }
            }
        }
        .onTapGesture {
            // Dismiss keyboard when tapping outside text fields
            hideKeyboard()
        }
        .alert(alertTitle, isPresented: $showingAlert) {
            Button("OK") { }
        } message: {
            Text(alertMessage)
        }
        .onAppear {
            Task {
                await loadAdminActions()
            }
        }
    }
    
    private func updateUserStatus() async {
        guard !email.isEmpty else { return }
        
        isLoading = true
        
        do {
            let adminEmail = authVM.currentUser?.email ?? "unknown"
            try await ApiClient.setUserPremiumStatus(email: email, isPremium: isPremium, adminEmail: adminEmail)
            
            alertTitle = "Success"
            alertMessage = "User \(email) has been \(isPremium ? "upgraded to" : "downgraded from") premium."
            showingAlert = true
            
            // If this is the current user, refresh their data
            if authVM.currentUser?.email == email {
                await authVM.refreshUser()
            }
            
            // Reload admin actions to show the new action
            await loadAdminActions()
            
            // Clear form
            email = ""
            
        } catch {
            alertTitle = "Error"
            alertMessage = "Failed to update user status: \(error.localizedDescription)"
            showingAlert = true
        }
        
        isLoading = false
    }
    
    private func loadAdminActions() async {
        isLoadingActions = true
        do {
            let actions = try await ApiClient.getAdminActions()
            await MainActor.run {
                self.adminActions = actions
            }
        } catch {
            print("Failed to load admin actions: \(error)")
        }
        isLoadingActions = false
    }
    
    private func formatAction(_ action: String) -> String {
        switch action {
        case "set_premium":
            return "Set Premium"
        case "set_free":
            return "Set Free"
        case "reset_password":
            return "Reset Password"
        case "delete_user":
            return "Delete User"
        case "reset_usage":
            return "Reset Usage"
        default:
            return smartCapitalized(action)
        }
    }
    
    private func formatTimestamp(_ timestamp: String) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .full
        
        if let date = ISO8601DateFormatter().date(from: timestamp) {
            return formatter.localizedString(for: date, relativeTo: Date())
        }
        return timestamp
    }
    
    private func hideKeyboard() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }
}

struct ActionRow: View {
    let email: String
    let action: String
    let timestamp: String
    
    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(email)
                    .font(.subheadline)
                    .fontWeight(.medium)
                Text(action)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            
            Spacer()
            
            Text(timestamp)
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .padding(.vertical, 4)
    }
}

struct AdminView_Previews: PreviewProvider {
    static var previews: some View {
        AdminView()
            .environmentObject(AuthVM())
    }
}
