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
    @FocusState private var focusedField: Field?
    
    enum Field {
        case email, password, confirmPassword
    }
    
    var body: some View {
        NavigationView {
            GeometryReader { geometry in
                ScrollView {
                    VStack(spacing: 30) {
                        // Header
                        VStack(spacing: 16) {
                            Image("Launch Logo")
                                .resizable()
                                .aspectRatio(contentMode: .fit)
                                .frame(width: 60, height: 60)
                            
                            Text("Fetch News")
                                .font(.largeTitle)
                                .fontWeight(.bold)
                            
                            Text(isLoginMode ? "Welcome back!" : "Create your account")
                                .font(.title3)
                                .foregroundColor(.secondary)
                        }
                        .padding(.top, max(20, geometry.safeAreaInsets.top + 20))
                
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
                            .focused($focusedField, equals: .email)
                            .submitLabel(.next)
                            .onSubmit {
                                focusedField = .password
                            }
                    }
                    
                    // Password field
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Password")
                            .font(.headline)
                        SecureField("Enter your password", text: $password)
                            .textFieldStyle(RoundedBorderTextFieldStyle())
                            .focused($focusedField, equals: .password)
                            .submitLabel(isLoginMode ? .go : .next)
                            .onSubmit {
                                if isLoginMode {
                                    Task {
                                        await performAuth()
                                    }
                                } else {
                                    focusedField = .confirmPassword
                                }
                            }
                    }
                    
                    // Confirm password field (only for registration)
                    if !isLoginMode {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Confirm Password")
                                .font(.headline)
                            SecureField("Confirm your password", text: $confirmPassword)
                                .textFieldStyle(RoundedBorderTextFieldStyle())
                                .focused($focusedField, equals: .confirmPassword)
                                .submitLabel(.go)
                                .onSubmit {
                                    Task {
                                        await performAuth()
                                    }
                                }
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
                        .padding(.top, 20)
                        .padding(.bottom, max(20, geometry.safeAreaInsets.bottom + 20))
                    }
                    .frame(minHeight: geometry.size.height)
                }
            }
            .navigationTitle("")
            .navigationBarHidden(true)
            .ignoresSafeArea(.keyboard, edges: .bottom)
        }
        .onTapGesture {
            focusedField = nil
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
        .onAppear {
            // Clear any existing focus to start with keyboard hidden
            focusedField = nil
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

struct AuthView_Previews: PreviewProvider {
    static var previews: some View {
        AuthView().environmentObject(AuthVM())
    }
}