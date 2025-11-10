//
//  ForgotPasswordView.swift
//  FetchNews
//
//  Created by Finlay Smith on 8/14/25.
//

import SwiftUI

struct ForgotPasswordView: View {
    @EnvironmentObject var authVM: AuthVM
    @Binding var email: String
    @Binding var showingForgotPassword: Bool
    @State private var showingAlert = false
    @State private var alertMessage = ""
    @State private var isLoading = false
    @FocusState private var isEmailFocused: Bool
    
    var body: some View {
        NavigationView {
            GeometryReader { geometry in
                let isSmallScreen = geometry.size.height < 700 // iPhone SE and similar
                let sectionSpacing: CGFloat = isSmallScreen ? 16 : 30
                let headerSpacing: CGFloat = isSmallScreen ? 8 : 16
                let topPadding: CGFloat = isSmallScreen ? 20 : 40
                let iconSize: CGFloat = isSmallScreen ? 40 : 50
                let horizontalPadding: CGFloat = isSmallScreen ? 16 : 20
                let bottomPadding: CGFloat = isSmallScreen ? 60 : 100
                
                ScrollView {
                    VStack(spacing: sectionSpacing) {
                        // Header
                        VStack(spacing: headerSpacing) {
                            Image(systemName: "key.fill")
                                .font(.system(size: iconSize))
                                .foregroundColor(.blue)
                            
                            Text("Reset Password")
                                .font(isSmallScreen ? .title2 : .largeTitle)
                                .fontWeight(.bold)
                            
                            Text("Enter your email to receive a password reset link")
                                .font(isSmallScreen ? .subheadline : .body)
                                .foregroundColor(.secondary)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal, isSmallScreen ? 10 : 0)
                        }
                        .padding(.top, topPadding)
                        
                        // Email field
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Email")
                                .font(isSmallScreen ? .subheadline : .headline)
                            TextField("Enter your email", text: $email)
                                .textFieldStyle(RoundedBorderTextFieldStyle())
                                .keyboardType(.emailAddress)
                                .autocapitalization(.none)
                                .disableAutocorrection(true)
                                .focused($isEmailFocused)
                                .submitLabel(.go)
                                .onSubmit {
                                    Task {
                                        await sendResetEmail()
                                    }
                                }
                        }
                        
                        // Send reset button
                        Button(action: {
                            Task {
                                await sendResetEmail()
                            }
                        }) {
                            HStack {
                                if isLoading {
                                    ProgressView()
                                        .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                        .scaleEffect(0.8)
                                }
                                Text(isLoading ? "Sending..." : "Send Reset Link")
                                    .font(isSmallScreen ? .body : .headline)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, isSmallScreen ? 12 : 16)
                            .background(email.isEmpty ? Color.gray : Color.blue)
                            .foregroundColor(.white)
                            .cornerRadius(10)
                        }
                        .disabled(email.isEmpty || isLoading)
                        
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
                    showingForgotPassword = false
                }
            }
        }
        .onTapGesture {
            isEmailFocused = false
        }
        .alert("Reset Password", isPresented: $showingAlert) {
            Button("OK") { }
        } message: {
            Text(alertMessage)
        }
        .onAppear {
            // Auto-focus email field for immediate keyboard appearance
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                isEmailFocused = true
            }
        }
    }
    
    private func sendResetEmail() async {
        isLoading = true
        let message = await authVM.requestPasswordReset(email: email)
        isLoading = false
        
        if let error = authVM.errorMessage {
            alertMessage = error
            showingAlert = true
        } else {
            alertMessage = message ?? "Password reset link sent to your email"
            showingAlert = true
            showingForgotPassword = false
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

struct ForgotPasswordView_Previews: PreviewProvider {
    static var previews: some View {
        ForgotPasswordView(email: .constant("test@example.com"), showingForgotPassword: .constant(true))
            .environmentObject(AuthVM())
    }
}
