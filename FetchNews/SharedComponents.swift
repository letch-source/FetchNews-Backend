//
//  SharedComponents.swift
//  FetchNews
//
//  Created by Finlay Smith on 8/14/25.
//

import SwiftUI

// MARK: - Shared Components

// MARK: - Scrolling Text Component
struct ScrollingText: View {
    let text: String
    let font: Font
    let fontWeight: Font.Weight
    let color: Color
    
    @State private var textWidth: CGFloat = 0
    @State private var containerWidth: CGFloat = 0
    @State private var offset: CGFloat = 0
    @State private var shouldScroll = false
    
    init(_ text: String, font: Font = .headline, fontWeight: Font.Weight = .semibold, color: Color = .primary) {
        self.text = text
        self.font = font
        self.fontWeight = fontWeight
        self.color = color
    }
    
    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .leading) {
                // Measure the text width (hidden)
                Text(text)
                    .font(font)
                    .fontWeight(fontWeight)
                    .foregroundColor(.clear)
                    .fixedSize()
                    .background(
                        GeometryReader { textGeometry in
                            Color.clear.preference(
                                key: TextWidthPreferenceKey.self,
                                value: textGeometry.size.width
                            )
                        }
                    )
                
                // Scrolling text (visible)
                if shouldScroll {
                    HStack(spacing: 40) {
                        Text(text)
                            .font(font)
                            .fontWeight(fontWeight)
                            .foregroundColor(color)
                            .fixedSize()
                        
                        // Duplicate for seamless loop
                        Text(text)
                            .font(font)
                            .fontWeight(fontWeight)
                            .foregroundColor(color)
                            .fixedSize()
                    }
                    .offset(x: offset)
                    .onAppear {
                        startScrolling()
                    }
                } else {
                    Text(text)
                        .font(font)
                        .fontWeight(fontWeight)
                        .foregroundColor(color)
                        .lineLimit(1)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .frame(width: geometry.size.width, alignment: .leading)
            .clipped()
            .onAppear {
                containerWidth = geometry.size.width
            }
        }
        .onPreferenceChange(TextWidthPreferenceKey.self) { width in
            textWidth = width
            shouldScroll = width > containerWidth
        }
    }
    
    private func startScrolling() {
        let scrollDistance = textWidth + 40 // text width + spacing
        
        // Wait a bit before starting
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
            withAnimation(.linear(duration: Double(scrollDistance) / 30).repeatForever(autoreverses: false)) {
                offset = -scrollDistance
            }
        }
    }
}

// Preference key for text width
private struct TextWidthPreferenceKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}
