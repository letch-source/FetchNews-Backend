//
//  WelcomeView.swift
//  FetchNews
//
//  Created by Finlay Smith on 12/2024.
//

import SwiftUI

struct WelcomeView: View {
    @EnvironmentObject var authVM: AuthVM
    
    var body: some View {
        NavigationView {
            GeometryReader { geometry in
                let isSmallScreen = geometry.size.height < 700
                let logoSize: CGFloat = isSmallScreen ? 135 : 165
                
                VStack(spacing: 0) {
                    Spacer()
                    
                    // Logo and title
                    VStack(spacing: isSmallScreen ? 14 : 18) {
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
                    
                    Spacer()
                    
                    // Features
                    VStack(spacing: isSmallScreen ? 9 : 11) {
                        FeatureRow(icon: "newspaper", text: "Daily news summaries")
                        FeatureRow(icon: "speaker.wave.3", text: "Audio narration")
                        FeatureRow(icon: "star", text: "Premium features available")
                        FeatureRow(icon: "clock", text: "Scheduled summaries")
                        FeatureRow(icon: "person.crop.circle", text: "Personalized topics")
                    }
                    .padding(.horizontal, 20)
                    
                    Spacer()
                    
                    // Google Sign-In button
                    VStack(spacing: isSmallScreen ? 10 : 14) {
                        Button(action: {
                            Task {
                                await authVM.signInWithGoogle()
                            }
                        }) {
                            HStack {
                                if authVM.isLoading {
                                    ProgressView()
                                        .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                        .scaleEffect(0.8)
                                } else {
                                    Image(systemName: "globe")
                                        .font(.headline)
                                }
                                Text(authVM.isLoading ? "Signing in..." : "Sign in with Google")
                                    .font(isSmallScreen ? .body.weight(.semibold) : .headline.weight(.semibold))
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, isSmallScreen ? 13 : 15)
                            .background(Color.blue)
                            .foregroundColor(.white)
                            .cornerRadius(12)
                        }
                        .disabled(authVM.isLoading)
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
    }
}

struct WelcomeView_Previews: PreviewProvider {
    static var previews: some View {
        WelcomeView().environmentObject(AuthVM())
    }
}
