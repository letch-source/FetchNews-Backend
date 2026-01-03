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
            Text(buttonText)
                .font(.title2.weight(.bold))
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 18)
                .background(buttonBackground)
                .cornerRadius(14)
                .shadow(color: Color.primary.opacity(0.2), radius: 8, x: 0, y: 4)
        }
    }
    
    private var buttonText: String {
        switch state {
        case .fetching:
            return "Fetching..."
        default:
            return "Fetch News"
        }
    }
    
    private var buttonBackground: Color {
        switch state {
        case .fetching:
            return Color.blue.opacity(0.7)
        default:
            return Color.blue
        }
    }
}
