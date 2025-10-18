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
            ScrollView {
                VStack(spacing: 30) {
                    // Header
                    VStack(spacing: 16) {
                        Image(systemName: "key.fill")
                            .font(.system(size: 50))
                            .foregroundColor(.blue)
                        
                        Text("Reset Password")
                            .font(.largeTitle)
                            .fontWeight(.bold)
                        
                        Text("Enter your email to receive a password reset link")
                            .font(.body)
                            .foregroundColor(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .padding(.top, 40)
                    
                    // Email field
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Email")
                            .font(.headline)
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
                        }
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(email.isEmpty ? Color.gray : Color.blue)
                        .foregroundColor(.white)
                        .cornerRadius(10)
                    }
                    .disabled(email.isEmpty || isLoading)
                    
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
