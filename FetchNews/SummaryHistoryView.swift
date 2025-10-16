//
//  SummaryHistoryView.swift
//  FetchNews
//
//  Created by Finlay Smith on 8/14/25.
//

import SwiftUI

struct SummaryHistoryView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var summaryHistory: [SummaryHistoryEntry] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var selectedSummary: SummaryHistoryEntry?
    @State private var showingSummaryDetail = false
    
    var body: some View {
        NavigationView {
            VStack {
                if isLoading {
                    VStack(spacing: 16) {
                        ProgressView()
                            .scaleEffect(1.2)
                        Text("Loading history...")
                            .foregroundColor(.secondary)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if summaryHistory.isEmpty {
                    VStack(spacing: 20) {
                        Image(systemName: "clock.arrow.circlepath")
                            .font(.system(size: 60))
                            .foregroundColor(.gray)
                        
                        Text("No History Yet")
                            .font(.title2)
                            .fontWeight(.semibold)
                        
                        Text("Your summary history will appear here after you fetch your first news summary.")
                            .font(.body)
                            .foregroundColor(.secondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    List {
                        ForEach(summaryHistory) { entry in
                            SummaryHistoryRow(entry: entry) {
                                selectedSummary = entry
                                showingSummaryDetail = true
                            }
                        }
                    }
                    .listStyle(PlainListStyle())
                }
            }
            .navigationTitle("Summary History")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Close") {
                        dismiss()
                    }
                }
                
                if !summaryHistory.isEmpty {
                    ToolbarItem(placement: .navigationBarTrailing) {
                        Button("Clear All") {
                            Task {
                                await clearHistory()
                            }
                        }
                        .foregroundColor(.red)
                    }
                }
            }
        }
        .task {
            await loadSummaryHistory()
        }
        .sheet(isPresented: $showingSummaryDetail) {
            if let summary = selectedSummary {
                SummaryDetailView(entry: summary)
            }
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
    }
    
    private func loadSummaryHistory() async {
        do {
            let history = try await ApiClient.getSummaryHistory()
            await MainActor.run {
                self.summaryHistory = history
                self.isLoading = false
            }
        } catch {
            await MainActor.run {
                self.errorMessage = "Failed to load summary history: \(error.localizedDescription)"
                self.isLoading = false
            }
        }
    }
    
    private func clearHistory() async {
        do {
            try await ApiClient.clearSummaryHistory()
            await MainActor.run {
                self.summaryHistory = []
            }
        } catch {
            await MainActor.run {
                self.errorMessage = "Failed to clear history: \(error.localizedDescription)"
            }
        }
    }
}

struct SummaryHistoryRow: View {
    let entry: SummaryHistoryEntry
    let onTap: () -> Void
    
    var body: some View {
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
                    
                    // Length
                    HStack(spacing: 4) {
                        Image(systemName: "clock.fill")
                            .font(.caption)
                            .foregroundColor(.orange)
                        Text(entry.length.capitalized)
                            .font(.caption)
                            .foregroundColor(.orange)
                    }
                    
                    // Audio indicator
                    if entry.audioUrl != nil {
                        Image(systemName: "speaker.wave.2.fill")
                            .font(.caption)
                            .foregroundColor(.green)
                    }
                }
            }
            .padding(.vertical, 4)
        }
        .buttonStyle(PlainButtonStyle())
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

struct SummaryDetailView: View {
    let entry: SummaryHistoryEntry
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    // Header
                    VStack(alignment: .leading, spacing: 8) {
                        Text(entry.title)
                            .font(.title2)
                            .fontWeight(.bold)
                        
                        HStack {
                            Text(formatTimestamp(entry.timestamp))
                                .font(.caption)
                                .foregroundColor(.secondary)
                            
                            Spacer()
                            
                            Text(entry.length.capitalized)
                                .font(.caption)
                                .foregroundColor(.orange)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 2)
                                .background(Color.orange.opacity(0.1))
                                .cornerRadius(4)
                        }
                    }
                    
                    // Topics
                    if !entry.topics.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Topics")
                                .font(.headline)
                            
                            LazyVGrid(columns: [
                                GridItem(.adaptive(minimum: 80), spacing: 8)
                            ], spacing: 8) {
                                ForEach(entry.topics, id: \.self) { topic in
                                    Text(topic.capitalized)
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
                            .font(.headline)
                        
                        Text(entry.summary)
                            .font(.body)
                            .lineSpacing(4)
                    }
                }
                .padding()
            }
            .navigationTitle("Summary Details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
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
    SummaryHistoryView()
}
