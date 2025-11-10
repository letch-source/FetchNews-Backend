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
                let isSmallScreen = geometry.size.height < 700
                let logoSize: CGFloat = isSmallScreen ? 80 : 120
                let sectionSpacing: CGFloat = isSmallScreen ? 25 : 40
                let featureSpacing: CGFloat = isSmallScreen ? 10 : 12
                
                ScrollView {
                    VStack(spacing: sectionSpacing) {
                        // Top spacer
                        Color.clear.frame(height: isSmallScreen ? 30 : 50)
                        
                        // Logo and title
                        VStack(spacing: isSmallScreen ? 16 : 20) {
                            Image("Launch Logo")
                                .resizable()
                                .aspectRatio(contentMode: .fit)
                                .frame(width: logoSize, height: logoSize)
                            
                            Text("Fetch News")
                                .font(isSmallScreen ? .title : .largeTitle)
                                .fontWeight(.bold)
                                .foregroundColor(.primary)
                            
                            Text("News for busy people")
                                .font(isSmallScreen ? .body : .title3)
                                .foregroundColor(.secondary)
                        }
                        
                        // Features
                        VStack(spacing: featureSpacing) {
                            FeatureRow(icon: "newspaper", text: "Daily news summaries")
                            FeatureRow(icon: "speaker.wave.3", text: "Audio narration")
                            FeatureRow(icon: "star", text: "Premium features available")
                            FeatureRow(icon: "clock", text: "Scheduled summaries")
                            FeatureRow(icon: "person.crop.circle", text: "Personalized topics")
                        }
                        .padding(.horizontal, 20)
                        
                        // Action buttons
                        VStack(spacing: isSmallScreen ? 12 : 16) {
                            Button(action: {
                                showingLogin = true
                            }) {
                                Text("Login")
                                    .font(isSmallScreen ? .body.weight(.semibold) : .headline.weight(.semibold))
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, isSmallScreen ? 14 : 16)
                                    .background(Color.blue)
                                    .foregroundColor(.white)
                                    .cornerRadius(12)
                            }
                            
                            Button(action: {
                                showingSignUp = true
                            }) {
                                Text("Sign Up")
                                    .font(isSmallScreen ? .body.weight(.semibold) : .headline.weight(.semibold))
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, isSmallScreen ? 14 : 16)
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
                        
                        // Bottom padding
                        Color.clear.frame(height: max(20, geometry.safeAreaInsets.bottom + 20))
                    }
                    .frame(minHeight: geometry.size.height)
                }
                .background(Color.darkGreyBackground)
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
