//
//  WelcomeView.swift
//  FetchNews
//
//  Created by Finlay Smith on 12/2024.
//

import SwiftUI

struct WelcomeView: View {
    @EnvironmentObject var authVM: AuthVM
    @State private var showingLogin = false
    @State private var showingSignUp = false
    
    var body: some View {
        NavigationView {
            GeometryReader { geometry in
                VStack(spacing: 0) {
                    // Main content
                    VStack(spacing: 40) {
                        Spacer()
                        
                        // Logo and title
                        VStack(spacing: 20) {
                            Image("Launch Logo")
                                .resizable()
                                .aspectRatio(contentMode: .fit)
                                .frame(width: 120, height: 120)
                            
                            Text("Fetch News")
                                .font(.largeTitle)
                                .fontWeight(.bold)
                                .foregroundColor(.primary)
                            
                            Text("News for busy people")
                                .font(.title3)
                                .foregroundColor(.secondary)
                        }
                        
                        Spacer()
                        
                        // Features
                        VStack(spacing: 16) {
                            
                            VStack(spacing: 12) {
                                FeatureRow(icon: "newspaper", text: "Daily news summaries")
                                FeatureRow(icon: "speaker.wave.3", text: "Audio narration")
                                FeatureRow(icon: "star", text: "Premium features available")
                                FeatureRow(icon: "clock", text: "Scheduled summaries")
                                FeatureRow(icon: "person.crop.circle", text: "Personalized topics")
                            }
                        }
                        .padding(.horizontal, 20)
                        
                        Spacer()
                        
                        // Action buttons
                        VStack(spacing: 16) {
                            Button(action: {
                                showingLogin = true
                            }) {
                                Text("Login")
                                    .font(.headline)
                                    .fontWeight(.semibold)
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 16)
                                    .background(Color.blue)
                                    .foregroundColor(.white)
                                    .cornerRadius(12)
                            }
                            
                            Button(action: {
                                showingSignUp = true
                            }) {
                                Text("Sign Up")
                                    .font(.headline)
                                    .fontWeight(.semibold)
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 16)
                                    .background(Color.white)
                                    .foregroundColor(.blue)
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 12)
                                            .stroke(Color.blue, lineWidth: 2)
                                    )
                                    .cornerRadius(12)
                            }
                        }
                        .padding(.horizontal, 20)
                        .padding(.bottom, max(20, geometry.safeAreaInsets.bottom + 20))
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.darkGreyBackground)
                }
            }
            .navigationTitle("")
            .navigationBarHidden(true)
        }
        .sheet(isPresented: $showingLogin) {
            AuthView(isLoginMode: true)
                .environmentObject(authVM)
        }
        .sheet(isPresented: $showingSignUp) {
            AuthView(isLoginMode: false)
                .environmentObject(authVM)
        }
    }
}

struct WelcomeView_Previews: PreviewProvider {
    static var previews: some View {
        WelcomeView().environmentObject(AuthVM())
    }
}
