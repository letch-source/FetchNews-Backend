//
//  AnimatedComponents.swift
//  FetchNews
//
//  Created by Finlay Smith on 8/14/25.
//

import SwiftUI

// MARK: - Animated Fetch Image
struct AnimatedFetchImage: View {
    @State private var currentFrame = 0
    @State private var timer: Timer?
    
    private let frameCount = 4
    private let frameDuration = 0.25 // 0.25 seconds per frame for 1 second total animation
    
    var body: some View {
        Image("dog_run_\(currentFrame + 1)")
            .resizable()
            .aspectRatio(contentMode: .fit)
            .onAppear {
                startAnimation()
            }
            .onDisappear {
                stopAnimation()
            }
    }
    
    private func startAnimation() {
        timer = Timer.scheduledTimer(withTimeInterval: frameDuration, repeats: true) { _ in
            withAnimation(.linear(duration: 0.1)) {
                currentFrame = (currentFrame + 1) % frameCount
            }
        }
    }
    
    private func stopAnimation() {
        timer?.invalidate()
        timer = nil
    }
}

// MARK: - Fetch Button with Dynamic States
struct DynamicFetchButton: View {
    let state: NewsVM.FetchButtonState
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            Group {
                switch state {
                case .noSummary:
                    Image("NoSummary")
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .frame(width: 90, height: 90)
                        .clipShape(Circle())
                        .overlay(
                            Circle()
                                .stroke(Color(.systemBackground), lineWidth: 4)
                        )
                        .shadow(color: Color.primary.opacity(0.3), radius: 16, x: 0, y: 8)
                    
                case .fetching:
                    // Animated pulsing effect with the Fetch image
                    AnimatedFetchImage()
                        .frame(width: 90, height: 90)
                        .clipShape(Circle())
                        .overlay(
                            Circle()
                                .stroke(Color(.systemBackground), lineWidth: 4)
                        )
                        .shadow(color: Color.primary.opacity(0.3), radius: 16, x: 0, y: 8)
                    
                case .hasSummary:
                    Image("Launch Logo")
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .frame(width: 90, height: 90)
                        .clipShape(Circle())
                        .overlay(
                            Circle()
                                .stroke(Color(.systemBackground), lineWidth: 4)
                        )
                        .shadow(color: Color.primary.opacity(0.3), radius: 16, x: 0, y: 8)
                }
            }
        }
    }
}
