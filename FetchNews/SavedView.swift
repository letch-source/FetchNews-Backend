//
//  SavedView.swift
//  FetchNews
//
//  Saved summaries view
//

import SwiftUI
import AVFoundation

struct SavedView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var vm: NewsVM
    @EnvironmentObject var authVM: AuthVM
    @State private var savedSummaries: [SummaryHistoryEntry] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var selectedSummary: SummaryHistoryEntry?
    @State private var showingSummaryDetail = false
    
    var body: some View {
        ZStack {
            Color.darkGreyBackground
                .ignoresSafeArea()
            
            VStack(spacing: 0) {
                // Header
                header
            
            // Content
            if isLoading {
                VStack(spacing: 16) {
                    ProgressView()
                        .scaleEffect(1.2)
                    Text("Loading saved...")
                        .foregroundColor(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if savedSummaries.isEmpty {
                VStack(spacing: 20) {
                    Image(systemName: "bookmark")
                        .font(.system(size: 60))
                        .foregroundColor(.gray)
                    
                    Text("No Saved Summaries")
                        .font(.title2)
                        .fontWeight(.semibold)
                    
                    Text("Tap the bookmark button on the homepage to save summaries for later.")
                        .font(.body)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 24) {
                        // Title
                        Text("Saved")
                            .font(.title3)
                            .fontWeight(.semibold)
                            .foregroundColor(.primary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.top, 8)
                            .padding(.horizontal, 20)
                        
                        VStack(spacing: 0) {
                            ForEach(Array(savedSummaries.enumerated()), id: \.element.id) { index, entry in
                                SavedSummaryRow(entry: entry, onTap: {
                                    selectedSummary = entry
                                }, onUnsave: {
                                    unsaveSummary(entry)
                                })
                                
                                // Add divider between items (not after the last one)
                                if index < savedSummaries.count - 1 {
                                    Rectangle()
                                        .fill(Color(red: 0.5, green: 0.5, blue: 0.5))
                                        .frame(height: 1)
                                        .padding(.horizontal, 12)
                                        .padding(.vertical, 8)
                                }
                            }
                        }
                        .padding(.horizontal, 20)
                        
                        // Small bottom spacer
                        Spacer(minLength: 8)
                    }
                    .padding(.vertical, 16)
                }
                // Adjust scroll content insets when audio player is visible
                // This prevents scrolling too far and ensures content stops just above the audio bar
                .safeAreaInset(edge: .bottom, spacing: 0) {
                    // Small bottom padding (no audio player on this screen)
                    Color.clear.frame(height: 20)
                }
            }
            }
        }
        .task {
            await loadSavedSummaries()
        }
        .sheet(item: $selectedSummary) { summary in
            SavedSummaryDetailView(entry: summary, onUnsave: {
                unsaveSummary(summary)
            })
                .environmentObject(vm)
        }
        .alert("Error", isPresented: .constant(errorMessage != nil)) {
            Button("OK") {
                errorMessage = nil
            }
        } message: {
            if let error = errorMessage {
                Text(error)
            }
        }
        .sheet(isPresented: $vm.showingSubscriptionView) {
            SubscriptionView()
                .environmentObject(vm)
                .environmentObject(authVM)
        }
    }
    
    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Fetch News")
                        .font(.title2)
                        .fontWeight(.bold)
                        .foregroundColor(.primary)
                    
                    Text("News for Busy People")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
                Spacer()
                
                // Premium button - only show if user is not premium
                if let user = authVM.currentUser, !user.isPremium {
                    Button("PREMIUM") {
                        vm.showSubscriptionView()
                    }
                    .font(.subheadline.weight(.semibold))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Color.yellow)
                    .foregroundColor(.black)
                    .cornerRadius(8)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
        .background(Color.darkGreyBackground)
    }
    
    private func loadSavedSummaries() async {
        do {
            let saved = try await ApiClient.getSavedSummaries()
            await MainActor.run {
                self.savedSummaries = saved
                self.isLoading = false
            }
        } catch {
            await MainActor.run {
                self.errorMessage = "Failed to load saved summaries: \(error.localizedDescription)"
                self.isLoading = false
            }
        }
    }
    
    private func unsaveSummary(_ summary: SummaryHistoryEntry) {
        Task {
            do {
                try await ApiClient.unsaveSummary(summaryId: summary.id)
                await MainActor.run {
                    self.savedSummaries.removeAll { $0.id == summary.id }
                    self.selectedSummary = nil
                }
            } catch {
                await MainActor.run {
                    self.errorMessage = "Failed to unsave summary: \(error.localizedDescription)"
                }
            }
        }
    }
}

struct SavedSummaryRow: View {
    let entry: SummaryHistoryEntry
    let onTap: () -> Void
    let onUnsave: () -> Void
    
    var body: some View {
        HStack(spacing: 12) {
            Button(action: onTap) {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text(entry.title)
                            .font(.headline)
                            .foregroundColor(.primary)
                            .lineLimit(2)
                        
                        Spacer()
                        
                        Text(formatTimestamp(entry.timestamp))
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    
                    Text(entry.summary)
                        .font(.body)
                        .foregroundColor(.secondary)
                        .lineLimit(3)
                    
                    HStack {
                        // Topics
                        if !entry.topics.isEmpty {
                            HStack(spacing: 4) {
                                Image(systemName: "tag.fill")
                                    .font(.caption)
                                    .foregroundColor(.blue)
                                Text(entry.topics.joined(separator: ", "))
                                    .font(.caption)
                                    .foregroundColor(.blue)
                            }
                        }
                        
                        Spacer()
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.darkGreyBackground)
                .cornerRadius(8)
            }
            .buttonStyle(PlainButtonStyle())
            
            // Unsave button
            Button(action: onUnsave) {
                Image(systemName: "bookmark.fill")
                    .font(.system(size: 20))
                    .foregroundColor(.yellow)
                    .frame(width: 44, height: 44)
            }
        }
    }
    
    private func formatTimestamp(_ timestamp: String) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSSZ"
        
        if let date = formatter.date(from: timestamp) {
            let relativeFormatter = RelativeDateTimeFormatter()
            relativeFormatter.unitsStyle = .abbreviated
            return relativeFormatter.localizedString(for: date, relativeTo: Date())
        }
        
        return timestamp
    }
}

struct SavedSummaryDetailView: View {
    let entry: SummaryHistoryEntry
    let onUnsave: () -> Void
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var vm: NewsVM
    
    var body: some View {
        NavigationView {
            ZStack {
                Color.darkGreyBackground
                    .ignoresSafeArea()
                
                ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    // Header
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(alignment: .top, spacing: 12) {
                            Text(entry.title)
                                .font(.title2)
                                .fontWeight(.bold)
                            
                            Spacer()
                        }
                        
                        HStack {
                            Text(formatTimestamp(entry.timestamp))
                                .font(.caption)
                                .foregroundColor(.secondary)
                            
                            Spacer()
                        }
                    }
                    
                    // Topics
                    if !entry.topics.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Topics")
                                .font(.title3)
                                .fontWeight(.semibold)
                                .foregroundColor(.primary)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.top, 8)
                            
                            LazyVGrid(columns: [
                                GridItem(.adaptive(minimum: 80), spacing: 8)
                            ], spacing: 8) {
                                ForEach(entry.topics, id: \.self) { topic in
                                    Text(smartCapitalized(topic))
                                        .font(.caption)
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 4)
                                        .background(Color.blue.opacity(0.1))
                                        .foregroundColor(.blue)
                                        .cornerRadius(8)
                                }
                            }
                        }
                    }
                    
                    // Summary
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Summary")
                            .font(.title3)
                            .fontWeight(.semibold)
                            .foregroundColor(.primary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.top, 8)
                        
                        Text(entry.summary)
                            .font(.body)
                            .lineSpacing(4)
                    }
                    
                    // Sources
                    if let sources = entry.sources, !sources.isEmpty {
                        // Filter to show sources that have at least title, source name, or URL
                        let validSources = sources.filter { sourceItem in
                            let hasTitle = sourceItem.title != nil && !sourceItem.title!.isEmpty
                            let hasSource = !sourceItem.source.isEmpty
                            let hasUrl = sourceItem.url != nil && !sourceItem.url!.isEmpty
                            return hasTitle || hasSource || hasUrl
                        }
                        
                        if !validSources.isEmpty {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Sources")
                                    .font(.title3)
                                    .fontWeight(.semibold)
                                    .foregroundColor(.primary)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(.top, 8)
                                
                                ForEach(Array(validSources.enumerated()), id: \.offset) { index, sourceItem in
                                    HStack {
                                        Image(systemName: "link")
                                            .font(.caption)
                                            .foregroundColor(.blue)
                                        
                                        Text(
                                            (sourceItem.title != nil && !sourceItem.title!.isEmpty) 
                                                ? sourceItem.title! 
                                                : (!sourceItem.source.isEmpty ? sourceItem.source : "Article")
                                        )
                                            .font(.body)
                                            .foregroundColor(.blue)
                                        
                                        Spacer()
                                        
                                        if let url = sourceItem.url, !url.isEmpty {
                                            Link(destination: URL(string: url) ?? URL(string: "https://example.com")!) {
                                                Image(systemName: "arrow.up.right.square")
                                                    .font(.caption)
                                                    .foregroundColor(.blue)
                                            }
                                        }
                                    }
                                    .padding(.vertical, 2)
                                }
                            }
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 16)
                }
            }
            .navigationTitle("Saved Summary")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Menu {
                        Button(role: .destructive) {
                            onUnsave()
                            dismiss()
                        } label: {
                            Label("Unsave", systemImage: "bookmark.slash")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
                
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }
    
    private func formatTimestamp(_ timestamp: String) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSSZ"
        
        if let date = formatter.date(from: timestamp) {
            let displayFormatter = DateFormatter()
            displayFormatter.dateStyle = .medium
            displayFormatter.timeStyle = .short
            return displayFormatter.string(from: date)
        }
        
        return timestamp
    }
}

#Preview {
    SavedView()
        .environmentObject(NewsVM())
        .environmentObject(AuthVM())
}
