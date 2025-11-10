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
                let logoSize: CGFloat = isSmallScreen ? 70 : 100
                
                VStack(spacing: 0) {
                    Spacer()
                    
                    // Logo and title
                    VStack(spacing: isSmallScreen ? 12 : 16) {
                        Image("Launch Logo")
                            .resizable()
                            .aspectRatio(contentMode: .fit)
                            .frame(width: logoSize, height: logoSize)
                        
                        Text("Fetch News")
                            .font(isSmallScreen ? .title2 : .largeTitle)
                            .fontWeight(.bold)
                            .foregroundColor(.primary)
                        
                        Text("News for busy people")
                            .font(isSmallScreen ? .subheadline : .title3)
                            .foregroundColor(.secondary)
                    }
                    
                    Spacer()
                    
                    // Features
                    VStack(spacing: isSmallScreen ? 8 : 10) {
                        FeatureRow(icon: "newspaper", text: "Daily news summaries")
                        FeatureRow(icon: "speaker.wave.3", text: "Audio narration")
                        FeatureRow(icon: "star", text: "Premium features available")
                        FeatureRow(icon: "clock", text: "Scheduled summaries")
                        FeatureRow(icon: "person.crop.circle", text: "Personalized topics")
                    }
                    .padding(.horizontal, 20)
                    
                    Spacer()
                    
                    // Action buttons
                    VStack(spacing: isSmallScreen ? 10 : 14) {
                        Button(action: {
                            showingLogin = true
                        }) {
                            Text("Login")
                                .font(isSmallScreen ? .body.weight(.semibold) : .headline.weight(.semibold))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, isSmallScreen ? 13 : 15)
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
                                .padding(.vertical, isSmallScreen ? 13 : 15)
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
                    .padding(.bottom, max(30, geometry.safeAreaInsets.bottom + 30))
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
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
