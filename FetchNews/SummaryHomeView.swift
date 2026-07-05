//
//  SummaryHomeView.swift
//  FetchNews
//
//  Static home screen with a single combined summary and chapter jumps
//

import SwiftUI

struct SummaryHomeView: View {
    @EnvironmentObject var vm: NewsVM
    @EnvironmentObject var authVM: AuthVM
    
    private var activeTopicsSet: Set<String> {
        if vm.isShowingRecommendedAfterFetch, !vm.recommendedTopics.isEmpty {
            return Set(vm.recommendedTopics.map { $0.lowercased() })
        }
        let fallback = vm.selectedTopics
        let topics = vm.lastFetchedTopics.isEmpty ? fallback : vm.lastFetchedTopics
        return Set(topics.map { $0.lowercased() })
    }
    
    private var chapterSections: [TopicSection] {
        guard let sections = vm.combined?.topicSections, !sections.isEmpty else { return [] }
        let filtered = sections.filter { activeTopicsSet.contains($0.topic.lowercased()) }
        return filtered.isEmpty ? sections : filtered
    }
    
    private var chapters: [SummaryChapter] {
        guard let combined = vm.combined else { return [] }
        let sections = chapterSections
        guard !sections.isEmpty else { return [] }
        
        let fullText = combined.summary
        let totalWords = wordCount(fullText)
        let lowerFullText = fullText.lowercased()
        var fallbackWordIndex = 0
        
        return sections.map { section in
            let sectionText = section.summary.trimmingCharacters(in: .whitespacesAndNewlines)
            let lowerSectionText = sectionText.lowercased()
            var startWordIndex = fallbackWordIndex
            
            if let range = lowerFullText.range(of: lowerSectionText) {
                let prefix = String(lowerFullText[..<range.lowerBound])
                startWordIndex = wordCount(prefix)
            }
            
            fallbackWordIndex += wordCount(sectionText)
            
            let rawOffset = totalWords > 0 ? (Double(startWordIndex) / Double(totalWords)) * vm.duration : 0
            let offset = min(max(rawOffset, 0), vm.duration)
            
            return SummaryChapter(
                id: section.id,
                title: section.topic,
                offset: offset
            )
        }
    }
    
    var body: some View {
        ZStack {
            Color.darkGreyBackground
                .ignoresSafeArea()
            
            ScrollView {
                VStack(spacing: 12) {
                    if vm.isBusy || vm.phase != .idle {
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle(tint: .blue))
                            .padding(.top, 24)
                    } else if let combined = vm.combined {
                        // Title
                        if !combined.title.isEmpty {
                            Text(combined.title)
                                .font(.title2)
                                .fontWeight(.bold)
                                .foregroundColor(.primary)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.top, 4)
                        }

                        // Chapter jump buttons (only when audio is loaded and sections exist)
                        if !chapters.isEmpty {
                            VStack(spacing: 8) {
                                ForEach(chapters) { chapter in
                                    Button(action: {
                                        if vm.currentTopicAudioUrl != nil {
                                            vm.switchToCombinedAudio(autoPlay: false)
                                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                                                if vm.canPlay {
                                                    vm.seek(to: chapter.offset)
                                                }
                                            }
                                        } else if vm.canPlay {
                                            vm.seek(to: chapter.offset)
                                        }
                                    }) {
                                        HStack {
                                            Text(chapter.title.capitalized)
                                                .font(.subheadline)
                                                .fontWeight(.medium)
                                                .foregroundColor(.primary)
                                            Spacer()
                                            if vm.canPlay {
                                                Text(formatDuration(chapter.offset))
                                                    .font(.caption)
                                                    .foregroundColor(.secondary)
                                                Image(systemName: "chevron.right")
                                                    .font(.caption)
                                                    .foregroundColor(.secondary)
                                            } else {
                                                Image(systemName: "speaker.wave.2")
                                                    .font(.caption)
                                                    .foregroundColor(.secondary)
                                            }
                                        }
                                        .padding(.vertical, 10)
                                        .padding(.horizontal, 14)
                                        .background(Color(.secondarySystemBackground))
                                        .cornerRadius(10)
                                    }
                                    .disabled(!vm.canPlay)
                                }
                            }
                        }

                        // Summary text — always visible so screen is never blank
                        if !combined.summary.isEmpty {
                            Text(combined.summary)
                                .font(.body)
                                .foregroundColor(.primary)
                                .lineSpacing(4)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.top, chapters.isEmpty ? 0 : 8)
                        }

                    } else if let error = vm.lastError {
                        // Show error if fetch failed
                        VStack(spacing: 12) {
                            Image(systemName: "exclamationmark.triangle")
                                .font(.system(size: 36))
                                .foregroundColor(.orange)
                            Text(error)
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                                .multilineTextAlignment(.center)
                        }
                        .padding(.top, 60)
                    } else {
                        // Empty state — no fetch yet
                        VStack(spacing: 12) {
                            Image(systemName: "newspaper")
                                .font(.system(size: 48))
                                .foregroundColor(.secondary)
                            Text("Your news summary will appear here")
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                                .multilineTextAlignment(.center)
                            Text("Go to the Topics tab to choose topics and tap Fetch")
                                .font(.caption)
                                .foregroundColor(.secondary.opacity(0.7))
                                .multilineTextAlignment(.center)
                        }
                        .padding(.top, 80)
                    }

                    Spacer(minLength: 120)
                }
                .padding(.horizontal, 20)
                .padding(.top, 24)
            }
        }
        .onAppear {
            if vm.currentTopicAudioUrl != nil {
                vm.switchToCombinedAudio(autoPlay: false)
            }
        }
    }
    
    private func wordCount(_ text: String) -> Int {
        text.split { $0.isWhitespace || $0.isNewline }.count
    }
    
    private func formatDuration(_ seconds: Double) -> String {
        guard vm.canPlay, vm.duration > 0 else { return "—" }
        let totalSeconds = max(0, Int(seconds.rounded(.down)))
        let hours = totalSeconds / 3600
        let minutes = (totalSeconds % 3600) / 60
        let remaining = totalSeconds % 60
        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, remaining)
        }
        return String(format: "%d:%02d", minutes, remaining)
    }
}

struct SummaryChapter: Identifiable {
    let id: String
    let title: String
    let offset: Double
}

#Preview {
    SummaryHomeView()
        .environmentObject(NewsVM())
        .environmentObject(AuthVM())
}
