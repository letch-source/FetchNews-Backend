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
    @FocusState private var focusedField: Field?
    
    enum Field {
        case newPassword, confirmPassword
    }
    
    var body: some View {
        NavigationView {
            GeometryReader { geometry in
                let isSmallScreen = geometry.size.height < 700 // iPhone SE and similar
                let sectionSpacing: CGFloat = isSmallScreen ? 16 : 30
                let headerSpacing: CGFloat = isSmallScreen ? 8 : 16
                let formSpacing: CGFloat = isSmallScreen ? 12 : 20
                let topPadding: CGFloat = isSmallScreen ? 20 : 40
                let iconSize: CGFloat = isSmallScreen ? 40 : 50
                let horizontalPadding: CGFloat = isSmallScreen ? 16 : 20
                let bottomPadding: CGFloat = isSmallScreen ? 60 : 100
                
                ScrollView {
                    VStack(spacing: sectionSpacing) {
                        // Header
                        VStack(spacing: headerSpacing) {
                            Image(systemName: "lock.rotation")
                                .font(.system(size: iconSize))
                                .foregroundColor(.blue)
                            
                            Text("Set New Password")
                                .font(isSmallScreen ? .title2 : .largeTitle)
                                .fontWeight(.bold)
                            
                            Text("Enter your new password")
                                .font(isSmallScreen ? .subheadline : .body)
                                .foregroundColor(.secondary)
                                .multilineTextAlignment(.center)
                        }
                        .padding(.top, topPadding)
                        
                        // Password fields
                        VStack(spacing: formSpacing) {
                            VStack(alignment: .leading, spacing: 6) {
                                Text("New Password")
                                    .font(isSmallScreen ? .subheadline : .headline)
                                SecureField("Enter new password", text: $newPassword)
                                    .textFieldStyle(RoundedBorderTextFieldStyle())
                                    .focused($focusedField, equals: .newPassword)
                                    .submitLabel(.next)
                                    .onSubmit {
                                        focusedField = .confirmPassword
                                    }
                            }
                            
                            VStack(alignment: .leading, spacing: 6) {
                                Text("Confirm Password")
                                    .font(isSmallScreen ? .subheadline : .headline)
                                SecureField("Confirm new password", text: $confirmPassword)
                                    .textFieldStyle(RoundedBorderTextFieldStyle())
                                    .focused($focusedField, equals: .confirmPassword)
                                    .submitLabel(.go)
                                    .onSubmit {
                                        Task {
                                            await resetPassword()
                                        }
                                    }
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
                                    .font(isSmallScreen ? .body : .headline)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, isSmallScreen ? 12 : 16)
                            .background(isFormValid ? Color.blue : Color.gray)
                            .foregroundColor(.white)
                            .cornerRadius(10)
                        }
                        .disabled(!isFormValid || isLoading)
                        
                        Spacer()
                        
                        Color.clear.frame(height: bottomPadding)
                    }
                    .padding(.horizontal, horizontalPadding)
                    .padding(.bottom, isSmallScreen ? 10 : 20)
                }
            }
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
            focusedField = nil
        }
        .alert("Reset Password", isPresented: $showingAlert) {
            Button("OK") { }
        } message: {
            Text(alertMessage)
        }
        .onAppear {
            // Auto-focus new password field for immediate keyboard appearance
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                focusedField = .newPassword
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
        let _ = await authVM.resetPassword(token: resetToken, newPassword: newPassword)
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
