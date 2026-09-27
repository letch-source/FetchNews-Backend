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
    
    private struct SourceLink {
        let url: URL
        let title: String
        let source: String
    }

    /// Articles behind the current summary, one row per unique link. Comes from vm.items, which is
    /// filled both by a fresh fetch and when a summary is restored from history. Placeholder items
    /// the backend adds for failed topics have no URL, so they drop out here.
    private var sourceItems: [SourceLink] {
        var seen = Set<String>()
        var result: [SourceLink] = []
        let pool = vm.items.isEmpty
            ? (vm.combined?.topicSections ?? []).flatMap { $0.articles }
            : vm.items
        for item in pool {
            guard let url = normalizedURL(from: item.url),
                  seen.insert(url.absoluteString).inserted else { continue }
            let source = (item.source ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            let title = item.title.trimmingCharacters(in: .whitespacesAndNewlines)
            result.append(SourceLink(
                url: url,
                title: title.isEmpty ? (source.isEmpty ? "Article" : source) : title,
                source: source
            ))
        }
        return result
    }

    /// Collapses all whitespace runs (including paragraph breaks) to single spaces and lowercases,
    /// so section text can be located inside the combined text even if the two were
    /// whitespace-normalized differently (the combined summary is condensed on the client,
    /// per-topic summaries are not).
    private func normalizedForMatching(_ text: String) -> String {
        text.lowercased()
            .split(whereSeparator: { $0.isWhitespace || $0.isNewline })
            .joined(separator: " ")
    }
    
    /// Chapter start offsets are ESTIMATED from where each topic's text sits inside the combined
    /// text that was sent to TTS (the backend does not return real timings). Position is measured in
    /// characters, which tracks speech time better than word count, and the combined text includes the
    /// spoken intro/transitions, so a topic's offset is its real position in the script.
    private var chapters: [SummaryChapter] {
        guard let combined = vm.combined else { return [] }
        let sections = chapterSections
        guard !sections.isEmpty else { return [] }
        
        let fullText = normalizedForMatching(combined.summary)
        let totalChars = fullText.count
        let duration = vm.duration
        var searchStart = fullText.startIndex
        var lastOffset = 0.0
        // End of the previous topic's text when it was fully matched. The backend speaks a short
        // transition ("Next up in tech…") between topics, so a chapter should start right after the
        // previous topic ends, not at the first word of its own text (which skipped the transition).
        var previousSectionEnd: String.Index? = nil
        // Small pre-roll so a chapter never clips its first syllable due to estimation error.
        let preRollSeconds = 0.4
        
        return sections.enumerated().map { index, section in
            let sectionText = normalizedForMatching(section.summary)
            var matchRange: Range<String.Index>? = nil
            var matchKind = "none"
            
            // 1) Whole section text, searched forward from the previous chapter so repeated
            //    phrases can't jump backwards.
            if !sectionText.isEmpty,
               let r = fullText.range(of: sectionText, range: searchStart..<fullText.endIndex) {
                matchRange = r
                matchKind = "full"
            }
            // 2) Opening words only (the combined text may have edited the end of the section).
            if matchRange == nil {
                let opening = sectionText.split(separator: " ").prefix(10).joined(separator: " ")
                if !opening.isEmpty,
                   let r = fullText.range(of: opening, range: searchStart..<fullText.endIndex) {
                    matchRange = r
                    matchKind = "opening"
                }
            }
            
            let offset: Double
            if let r = matchRange, totalChars > 0, duration > 0 {
                // First topic starts at its own text (after the greeting). Later topics start where
                // the previous topic ended, so the transition line is included.
                var chapterStart = r.lowerBound
                if index > 0, let prevEnd = previousSectionEnd, prevEnd <= r.lowerBound {
                    chapterStart = prevEnd
                }
                let startChars = fullText.distance(from: fullText.startIndex, to: chapterStart)
                let estimated = Double(startChars) / Double(totalChars) * duration - preRollSeconds
                offset = min(max(estimated, lastOffset, 0), duration)
                searchStart = r.lowerBound
                previousSectionEnd = matchKind == "full" ? r.upperBound : nil
            } else {
                previousSectionEnd = nil
                // No match: don't guess a position from summed section lengths (that ignores the
                // spoken intro and drifts). Keep it at the previous chapter's start.
                offset = lastOffset
            }
            lastOffset = offset
            
            return SummaryChapter(
                id: section.id,
                title: section.topic,
                offset: offset,
                matchKind: matchKind
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
                                        print("🔖 [CHAPTER] \"\(chapter.title)\" offset=\(String(format: "%.1f", chapter.offset))s of duration=\(String(format: "%.1f", vm.duration))s match=\(chapter.matchKind)")
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

                        // Sources — every summary links back to its original articles
                        if !sourceItems.isEmpty {
                            VStack(alignment: .leading, spacing: 10) {
                                Text("Sources")
                                    .font(.title3)
                                    .fontWeight(.semibold)
                                    .foregroundColor(.primary)
                                    .frame(maxWidth: .infinity, alignment: .leading)

                                ForEach(sourceItems, id: \.url) { entry in
                                    Link(destination: entry.url) {
                                        HStack(alignment: .top, spacing: 10) {
                                            Image(systemName: "link")
                                                .font(.caption)
                                                .foregroundColor(.blue)
                                                .padding(.top, 3)
                                            VStack(alignment: .leading, spacing: 2) {
                                                if !entry.source.isEmpty {
                                                    Text(entry.source)
                                                        .font(.caption)
                                                        .foregroundColor(.secondary)
                                                }
                                                Text(entry.title)
                                                    .font(.subheadline)
                                                    .foregroundColor(.primary)
                                                    .multilineTextAlignment(.leading)
                                                    .lineLimit(2)
                                            }
                                            Spacer(minLength: 0)
                                            Image(systemName: "arrow.up.right")
                                                .font(.caption2)
                                                .foregroundColor(.secondary)
                                                .padding(.top, 3)
                                        }
                                        .padding(.vertical, 10)
                                        .padding(.horizontal, 14)
                                        .background(Color(.secondarySystemBackground))
                                        .cornerRadius(10)
                                    }
                                }
                            }
                            .padding(.top, 16)
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
            let sectionArticles = (vm.combined?.topicSections ?? []).reduce(0) { $0 + $1.articles.count }
            print("📰 [SOURCES] SummaryHomeView v2 — items=\(vm.items.count), sectionArticles=\(sectionArticles), linkable=\(sourceItems.count), summary=\(vm.combined?.id ?? "nil")")
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
    /// How the chapter was located in the combined text: "full", "opening", or "none" (unmatched).
    let matchKind: String
}

#Preview {
    SummaryHomeView()
        .environmentObject(NewsVM())
        .environmentObject(AuthVM())
}
