//
//  AuthView.swift
//  FetchNews
//
//  Created by Finlay Smith on 8/14/25.
//

import SwiftUI

struct AuthView: View {
    @EnvironmentObject var authVM: AuthVM
    @State private var isLoginMode = true
    @State private var email = ""
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var showingAlert = false
    @State private var alertMessage = ""
    @State private var showingForgotPassword = false
    @State private var showingResetPassword = false
    @State private var resetToken = ""
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 30) {
                    // Header
                    VStack(spacing: 16) {
                        Image(systemName: "newspaper.fill")
                            .font(.system(size: 60))
                            .foregroundColor(.blue)
                        
                        Text("Fetch News")
                            .font(.largeTitle)
                            .fontWeight(.bold)
                        
                        Text(isLoginMode ? "Welcome back!" : "Create your account")
                            .font(.title3)
                            .foregroundColor(.secondary)
                    }
                    .padding(.top, 40)
                
                // Form
                VStack(spacing: 20) {
                    // Email field
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Email")
                            .font(.headline)
                        TextField("Enter your email", text: $email)
                            .textFieldStyle(RoundedBorderTextFieldStyle())
                            .keyboardType(.emailAddress)
                            .autocapitalization(.none)
                            .disableAutocorrection(true)
                    }
                    
                    // Password field
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Password")
                            .font(.headline)
                        SecureField("Enter your password", text: $password)
                            .textFieldStyle(RoundedBorderTextFieldStyle())
                    }
                    
                    // Confirm password field (only for registration)
                    if !isLoginMode {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Confirm Password")
                                .font(.headline)
                            SecureField("Confirm your password", text: $confirmPassword)
                                .textFieldStyle(RoundedBorderTextFieldStyle())
                        }
                    }
                }
                .padding(.horizontal, 20)
                
                // Action button
                Button(action: {
                    Task {
                        await performAuth()
                    }
                }) {
                    HStack {
                        if authVM.isLoading {
                            ProgressView()
                                .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                .scaleEffect(0.8)
                        }
                        Text(isLoginMode ? "Sign In" : "Create Account")
                            .font(.headline)
                            .fontWeight(.semibold)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(isFormValid ? Color.blue : Color.gray)
                    .foregroundColor(.white)
                    .cornerRadius(12)
                }
                .disabled(!isFormValid || authVM.isLoading)
                .padding(.horizontal, 20)
                
                // Toggle mode
                Button(action: {
                    isLoginMode.toggle()
                    clearForm()
                }) {
                    Text(isLoginMode ? "Don't have an account? Sign up" : "Already have an account? Sign in")
                        .font(.subheadline)
                        .foregroundColor(.blue)
                }
                
                // Forgot password (only show in login mode)
                if isLoginMode {
                    Button(action: {
                        showingForgotPassword = true
                    }) {
                        Text("Forgot your password?")
                            .font(.subheadline)
                            .foregroundColor(.blue)
                    }
                }
                
                Spacer()
                
                // Features preview
                VStack(spacing: 12) {
                    Text("What you get:")
                        .font(.headline)
                        .foregroundColor(.secondary)
                    
                    VStack(spacing: 8) {
                        FeatureRow(icon: "newspaper", text: "Daily news summaries")
                        FeatureRow(icon: "speaker.wave.3", text: "Audio narration")
                        FeatureRow(icon: "star", text: "Premium features available")
                    }
                }
                .padding(.bottom, 20)
                
                // Add bottom padding for keyboard
                Color.clear.frame(height: 100)
            }
            .onTapGesture {
                hideKeyboard()
            }
            .navigationTitle("")
            .navigationBarHidden(true)
        }
        .alert("Authentication Error", isPresented: $showingAlert) {
            Button("OK") { }
        } message: {
            Text(alertMessage)
        }
        .sheet(isPresented: $showingForgotPassword) {
            ForgotPasswordView(email: $email, showingForgotPassword: $showingForgotPassword)
                .environmentObject(authVM)
        }
        .sheet(isPresented: $showingResetPassword) {
            ResetPasswordView(resetToken: $resetToken, showingResetPassword: $showingResetPassword)
                .environmentObject(authVM)
        }
    }
    
    private var isFormValid: Bool {
        if isLoginMode {
            return !email.isEmpty && !password.isEmpty && email.contains("@")
        } else {
            return !email.isEmpty && !password.isEmpty && password == confirmPassword && password.count >= 6 && email.contains("@")
        }
    }
    
    private func clearForm() {
        email = ""
        password = ""
        confirmPassword = ""
    }
    
    private func performAuth() async {
        if isLoginMode {
            await authVM.loginUser(email: email, password: password)
        } else {
            await authVM.registerUser(email: email, password: password)
        }
        
        if let error = authVM.errorMessage {
            alertMessage = error
            showingAlert = true
        }
    }
    
    private func hideKeyboard() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }
}


struct ForgotPasswordView: View {
    @EnvironmentObject var authVM: AuthVM
    @Binding var email: String
    @Binding var showingForgotPassword: Bool
    @State private var showingAlert = false
    @State private var alertMessage = ""
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 30) {
                    VStack(spacing: 16) {
                        Image(systemName: "key.fill")
                            .font(.system(size: 50))
                            .foregroundColor(.blue)
                        
                        Text("Reset Password")
                            .font(.title)
                            .fontWeight(.bold)
                        
                        Text("Enter your email address and we'll send you a link to reset your password.")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .padding(.top, 40)
                
                VStack(spacing: 20) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Email")
                            .font(.headline)
                        TextField("Enter your email", text: $email)
                            .textFieldStyle(RoundedBorderTextFieldStyle())
                            .keyboardType(.emailAddress)
                            .autocapitalization(.none)
                            .disableAutocorrection(true)
                    }
                    
                    Button(action: {
                        Task {
                            if let message = await authVM.requestPasswordReset(email: email) {
                                alertMessage = message
                                showingAlert = true
                            }
                        }
                    }) {
                        HStack {
                            if authVM.isLoading {
                                ProgressView()
                                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                    .scaleEffect(0.8)
                            }
                            Text("Send Reset Link")
                                .font(.headline)
                                .fontWeight(.semibold)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(email.contains("@") ? Color.blue : Color.gray)
                        .foregroundColor(.white)
                        .cornerRadius(12)
                    }
                    .disabled(!email.contains("@") || authVM.isLoading)
                }
                .padding(.horizontal, 20)
                
                Spacer()
                
                // Add bottom padding for keyboard
                Color.clear.frame(height: 100)
            }
            .onTapGesture {
                hideKeyboard()
            }
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        showingForgotPassword = false
                    }
                }
            }
        }
        .alert("Password Reset", isPresented: $showingAlert) {
            Button("OK") {
                if alertMessage.contains("sent") {
                    showingForgotPassword = false
                }
            }
        } message: {
            Text(alertMessage)
        }
    }
    
    private func hideKeyboard() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }
}

struct ResetPasswordView: View {
    @EnvironmentObject var authVM: AuthVM
    @Binding var resetToken: String
    @Binding var showingResetPassword: Bool
    @State private var newPassword = ""
    @State private var confirmPassword = ""
    @State private var showingAlert = false
    @State private var alertMessage = ""
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 30) {
                    VStack(spacing: 16) {
                        Image(systemName: "lock.rotation")
                            .font(.system(size: 50))
                            .foregroundColor(.blue)
                        
                        Text("Set New Password")
                            .font(.title)
                            .fontWeight(.bold)
                        
                        Text("Enter your new password below.")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .padding(.top, 40)
                
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
                    
                    Button(action: {
                        Task {
                            if let message = await authVM.resetPassword(token: resetToken, newPassword: newPassword) {
                                alertMessage = message
                                showingAlert = true
                            }
                        }
                    }) {
                        HStack {
                            if authVM.isLoading {
                                ProgressView()
                                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                    .scaleEffect(0.8)
                            }
                            Text("Reset Password")
                                .font(.headline)
                                .fontWeight(.semibold)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(isFormValid ? Color.blue : Color.gray)
                        .foregroundColor(.white)
                        .cornerRadius(12)
                    }
                    .disabled(!isFormValid || authVM.isLoading)
                }
                .padding(.horizontal, 20)
                
                Spacer()
                
                // Add bottom padding for keyboard
                Color.clear.frame(height: 100)
            }
            .onTapGesture {
                hideKeyboard()
            }
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        showingResetPassword = false
                    }
                }
            }
        }
        .alert("Password Reset", isPresented: $showingAlert) {
            Button("OK") {
                if alertMessage.contains("successful") {
                    showingResetPassword = false
                }
            }
        } message: {
            Text(alertMessage)
        }
    }
    
    private var isFormValid: Bool {
        return !newPassword.isEmpty && 
               !confirmPassword.isEmpty && 
               newPassword == confirmPassword && 
               newPassword.count >= 6
    }
    
    private func hideKeyboard() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }
}

struct AuthView_Previews: PreviewProvider {
    static var previews: some View {
        AuthView().environmentObject(AuthVM())
    }
}
