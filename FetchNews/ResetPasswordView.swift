//
//  ResetPasswordView.swift
//  FetchNews
//
//  Created by Finlay Smith on 8/14/25.
//

import SwiftUI

struct ResetPasswordView: View {
    @EnvironmentObject var authVM: AuthVM
    @Binding var resetToken: String
    @Binding var showingResetPassword: Bool
    @State private var newPassword = ""
    @State private var confirmPassword = ""
    @State private var showingAlert = false
    @State private var alertMessage = ""
    @State private var isLoading = false
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 30) {
                    // Header
                    VStack(spacing: 16) {
                        Image(systemName: "lock.rotation")
                            .font(.system(size: 50))
                            .foregroundColor(.blue)
                        
                        Text("Set New Password")
                            .font(.largeTitle)
                            .fontWeight(.bold)
                        
                        Text("Enter your new password")
                            .font(.body)
                            .foregroundColor(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .padding(.top, 40)
                    
                    // Password fields
                    VStack(spacing: 20) {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("New Password")
                                .font(.headline)
                            SecureField("Enter new password", text: $newPassword)
                                .textFieldStyle(RoundedBorderTextFieldStyle())
                        }
                        
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Confirm Password")
                                .font(.headline)
                            SecureField("Confirm new password", text: $confirmPassword)
                                .textFieldStyle(RoundedBorderTextFieldStyle())
                        }
                    }
                    
                    // Reset password button
                    Button(action: {
                        Task {
                            await resetPassword()
                        }
                    }) {
                        HStack {
                            if isLoading {
                                ProgressView()
                                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                    .scaleEffect(0.8)
                            }
                            Text(isLoading ? "Resetting..." : "Reset Password")
                        }
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(isFormValid ? Color.blue : Color.gray)
                        .foregroundColor(.white)
                        .cornerRadius(10)
                    }
                    .disabled(!isFormValid || isLoading)
                    
                    Spacer()
                    
                    Color.clear.frame(height: 100) // Add bottom padding
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 20)
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button("Cancel") {
                    showingResetPassword = false
                }
            }
        }
        .onTapGesture {
            hideKeyboard()
        }
        .alert("Reset Password", isPresented: $showingAlert) {
            Button("OK") { }
        } message: {
            Text(alertMessage)
        }
        }
    }
    
    private var isFormValid: Bool {
        return !newPassword.isEmpty && 
               !confirmPassword.isEmpty && 
               newPassword == confirmPassword && 
               newPassword.count >= 6
    }
    
    private func resetPassword() async {
        isLoading = true
        await authVM.resetPassword(token: resetToken, newPassword: newPassword)
        isLoading = false
        
        if let error = authVM.errorMessage {
            alertMessage = error
            showingAlert = true
        } else {
            alertMessage = "Password reset successfully"
            showingAlert = true
            showingResetPassword = false
        }
    }
    
    private func hideKeyboard() {
        let keyWindow = UIApplication.shared.connectedScenes
            .filter { $0.activationState == .foregroundActive }
            .map { $0 as? UIWindowScene }
            .compactMap { $0 }
            .first?.windows
            .filter { $0.isKeyWindow }
            .first
        
        keyWindow?.endEditing(true)
    }
}

struct ResetPasswordView_Previews: PreviewProvider {
    static var previews: some View {
        ResetPasswordView(resetToken: .constant("test-token"), showingResetPassword: .constant(true))
            .environmentObject(AuthVM())
    }
}
