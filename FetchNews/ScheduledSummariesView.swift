//
//  ScheduledSummariesView.swift
//  FetchNews
//
//  Created by Finlay Smith on 12/2024.
//

import SwiftUI

struct ScheduledSummariesView: View {
    @ObservedObject var vm: NewsVM
    @EnvironmentObject var authVM: AuthVM
    @State private var showingEditor = false
    @State private var editingSummary: ScheduledSummary?
    
    var body: some View {
        VStack(spacing: 0) {
                if !(authVM.currentUser?.isPremium == true) {
                    // Premium gate
                    VStack(spacing: 16) {
                        Image(systemName: "crown.fill")
                            .font(.system(size: 48))
                            .foregroundColor(.yellow)
                        Text("Unlock Scheduled Summaries")
                            .font(.title2)
                            .fontWeight(.bold)
                        Text("Upgrade to premium to schedule automatic news summaries at your preferred times.")
                            .font(.body)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)
                        Button("Upgrade to Premium") {
                            vm.showSubscriptionView()
                            dismiss()
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.yellow)
                    }
                    .padding()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color(.systemBackground))
                } else {
                    // Scheduled summaries list
                    List {
                        // Existing scheduled summaries
                        ForEach(vm.scheduledSummaries, id: \.id) { summary in
                            HStack {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(summary.name)
                                        .font(.headline)
                                        .foregroundColor(.primary)
                                    
                                    Text("\(formatTimeWithAMPM(summary.time)) • \(summary.topics.joined(separator: ", "))")
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                    
                                    if !summary.customTopics.isEmpty {
                                        Text("Custom: \(summary.customTopics.joined(separator: ", "))")
                                            .font(.caption)
                                            .foregroundColor(.secondary)
                                    }
                                    
                                    if !summary.days.isEmpty {
                                        Text("Days: \(summary.days.joined(separator: ", "))")
                                            .font(.caption)
                                            .foregroundColor(.secondary)
                                    }
                                }
                                
                                Spacer()
                                
                                VStack(alignment: .trailing, spacing: 4) {
                                    Image(systemName: summary.isEnabled ? "checkmark.circle.fill" : "circle")
                                        .foregroundColor(summary.isEnabled ? .green : .gray)
                                    
                                    if let lastRun = summary.lastRun {
                                        Text("Last: \(formatDate(lastRun))")
                                            .font(.caption2)
                                            .foregroundColor(.secondary)
                                    }
                                }
                            }
                            .padding(.vertical, 4)
                            .contentShape(Rectangle())
                            .onTapGesture {
                                editingSummary = summary
                                showingEditor = true
                            }
                        }
                        .onDelete(perform: deleteScheduledSummary)
                        
                        // Add new scheduled summary button
                        Button(action: {
                            editingSummary = nil
                            showingEditor = true
                        }) {
                            HStack {
                                Image(systemName: "plus.circle.fill")
                                    .foregroundColor(.blue)
                                Text("Add new scheduled summary")
                                    .foregroundColor(.blue)
                                Spacer()
                            }
                            .padding(.vertical, 8)
                        }
                        .buttonStyle(PlainButtonStyle())
                        
                        // Manual trigger button for testing
                        Button(action: {
                            Task {
                                await triggerScheduledSummaries()
                            }
                        }) {
                            HStack {
                                Image(systemName: "play.circle.fill")
                                    .foregroundColor(.green)
                                Text("Test Execute Now")
                                    .foregroundColor(.green)
                                Spacer()
                            }
                            .padding(.vertical, 8)
                        }
                        .buttonStyle(PlainButtonStyle())
                    }
                }
            }
            .navigationTitle("Scheduled Summaries")
            .navigationBarTitleDisplayMode(.large)
        .sheet(isPresented: $showingEditor) {
            ScheduledSummaryEditorView(
                summary: editingSummary,
                vm: vm,
                authVM: authVM
            )
        }
        .onAppear {
            // Load scheduled summaries if not already loaded
            if vm.scheduledSummaries.isEmpty {
                Task {
                    await loadScheduledSummaries()
                }
            }
        }
    }
    
    private func deleteScheduledSummary(at offsets: IndexSet) {
        for index in offsets {
            let summary = vm.scheduledSummaries[index]
            Task {
                await deleteScheduledSummary(summary)
            }
        }
    }
    
    private func deleteScheduledSummary(_ summary: ScheduledSummary) async {
        do {
            try await ApiClient.deleteScheduledSummary(id: summary.id)
            await loadScheduledSummaries()
        } catch {
            // Handle error silently for now
        }
    }
    
    private func loadScheduledSummaries() async {
        do {
            let summaries = try await ApiClient.getScheduledSummaries()
            await MainActor.run {
                vm.scheduledSummaries = summaries
            }
        } catch {
            // Handle error silently for now
        }
    }
    
    private func formatDate(_ dateString: String) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSSZ"
        if let date = formatter.date(from: dateString) {
            formatter.dateStyle = .short
            formatter.timeStyle = .short
            return formatter.string(from: date)
        }
        return dateString
    }
    
    private func formatTimeWithAMPM(_ timeString: String) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        if let time = formatter.date(from: timeString) {
            formatter.dateFormat = "h:mm a"
            return formatter.string(from: time)
        }
        return timeString
    }
    
    private func triggerScheduledSummaries() async {
        do {
            let response = try await ApiClient.triggerScheduledSummaries()
            print("Scheduled summaries triggered: \(response.message)")
        } catch {
            print("Failed to trigger scheduled summaries: \(error)")
        }
    }
}

struct ScheduledSummariesView_Previews: PreviewProvider {
    static var previews: some View {
        ScheduledSummariesView(vm: NewsVM())
            .environmentObject(AuthVM())
    }
}
