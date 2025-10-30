//
//  ScheduledSummaryEditorView.swift
//  FetchNews
//
//  Created by Finlay Smith on 12/2024.
//

import SwiftUI

struct ScheduledSummaryEditorView: View {
    let summary: ScheduledSummary?
    @ObservedObject var vm: NewsVM
    @ObservedObject var authVM: AuthVM
    @Environment(\.dismiss) var dismiss
    
    @State private var selectedTime: Date = Date()
    @State private var selectedTopics: Set<String> = []
    @State private var selectedCustomTopics: Set<String> = []
    @State private var isEnabled: Bool = true
    @State private var isLoading: Bool = false
    
    private let allTopics = ["business", "entertainment", "general", "health", "science", "sports", "technology", "world"]
    private let allDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] // Default: all days
    
    var body: some View {
        NavigationView {
            Form {
                Section(header: Text("Settings")) {
                    HStack {
                        Text("Time")
                        Spacer()
                        DatePicker("", selection: $selectedTime, displayedComponents: [.hourAndMinute])
                            .datePickerStyle(WheelDatePickerStyle())
                            .labelsHidden()
                            .environment(\.locale, Locale(identifier: "en_US"))
                    }
                    
                    HStack {
                        Text("Enabled")
                        Spacer()
                        Toggle("", isOn: $isEnabled)
                            .labelsHidden()
                    }
                }
                
                Section(header: Text("Topics")) {
                    ForEach(allTopics, id: \.self) { topic in
                        HStack {
                            Text(topic.capitalized)
                            Spacer()
                            if selectedTopics.contains(topic) {
                                Image(systemName: "checkmark")
                                    .foregroundColor(.blue)
                            }
                        }
                        .contentShape(Rectangle())
                        .onTapGesture {
                            if selectedTopics.contains(topic) {
                                selectedTopics.remove(topic)
                            } else {
                                selectedTopics.insert(topic)
                            }
                        }
                    }
                }
                
                if !vm.customTopics.isEmpty {
                    Section(header: Text("Custom Topics")) {
                        ForEach(vm.customTopics, id: \.self) { topic in
                            HStack {
                                Text(topic)
                                Spacer()
                                if selectedCustomTopics.contains(topic) {
                                    Image(systemName: "checkmark")
                                        .foregroundColor(.blue)
                                }
                            }
                            .contentShape(Rectangle())
                            .onTapGesture {
                                if selectedCustomTopics.contains(topic) {
                                    selectedCustomTopics.remove(topic)
                                } else {
                                    selectedCustomTopics.insert(topic)
                                }
                            }
                        }
                    }
                }
                
                Section(footer: Text("Select at least one topic for your scheduled fetch.")) {
                    EmptyView()
                }
            }
            .navigationTitle("Scheduled Fetch")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Save") {
                        Task {
                            await saveScheduledSummary()
                        }
                    }
                    .disabled((selectedTopics.isEmpty && selectedCustomTopics.isEmpty) || isLoading)
                }
            }
        }
        .onAppear {
            setupInitialValues()
        }
    }
    
    private func setupInitialValues() {
        if let summary = summary, !summary.id.isEmpty {
            // Editing existing summary
            isEnabled = summary.isEnabled
            selectedTopics = Set(summary.topics)
            selectedCustomTopics = Set(summary.customTopics)
            
            // Parse time
            let formatter = DateFormatter()
            formatter.dateFormat = "HH:mm"
            if let time = formatter.date(from: summary.time) {
                selectedTime = time
            }
        } else {
            // Creating new summary - defaults
            selectedTime = Calendar.current.date(bySettingHour: 8, minute: 0, second: 0, of: Date()) ?? Date()
            selectedTopics = ["general"]
        }
    }
    
    private func saveScheduledSummary() async {
        isLoading = true
        
        let timeFormatter = DateFormatter()
        timeFormatter.dateFormat = "HH:mm"
        let timeString = timeFormatter.string(from: selectedTime)
        
        // Default name and days (all days)
        let defaultName = "Daily Fetch"
        let defaultDays = allDays // All days of the week
        
        print("Saving scheduled fetch - isEditing: \(summary != nil), id: \(summary?.id ?? "new")")
        
        let newSummary = ScheduledSummary(
            id: summary?.id ?? UUID().uuidString,
            name: defaultName,
            time: timeString,
            topics: Array(selectedTopics),
            customTopics: Array(selectedCustomTopics),
            days: defaultDays, // Always all days
            isEnabled: isEnabled,
            createdAt: summary?.createdAt ?? ISO8601DateFormatter().string(from: Date()),
            lastRun: summary?.lastRun
        )
        
        do {
            // Check if there's already an existing summary (limit to one)
            if summary == nil || summary!.id.isEmpty {
                // Creating new - delete any existing summaries first (only one allowed)
                if !vm.scheduledSummaries.isEmpty {
                    for existingSummary in vm.scheduledSummaries {
                        try? await ApiClient.deleteScheduledSummary(id: existingSummary.id)
                    }
                }
                
                print("Creating new scheduled fetch")
                let createdSummary = try await ApiClient.createScheduledSummary(newSummary)
                await MainActor.run {
                    vm.scheduledSummaries = [createdSummary] // Replace with single summary
                }
            } else {
                // Update existing
                print("Updating existing scheduled fetch with id: \(summary!.id)")
                let updatedSummary = try await ApiClient.updateScheduledSummary(newSummary)
                await MainActor.run {
                    vm.scheduledSummaries = [updatedSummary] // Ensure only one summary
                }
            }
            
            await MainActor.run {
                dismiss()
            }
        } catch {
            // Log the error for debugging
            print("Error saving scheduled fetch: \(error)")
            print("Error details: \(error.localizedDescription)")
            
            // Show error to user instead of silently failing
            await MainActor.run {
                // For now, still dismiss but log the error
                // TODO: Show proper error alert to user
                dismiss()
            }
        }
        
        isLoading = false
    }
    
    private func hideKeyboard() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }
}

struct ScheduledSummaryEditorView_Previews: PreviewProvider {
    static var previews: some View {
        ScheduledSummaryEditorView(
            summary: nil,
            vm: NewsVM(),
            authVM: AuthVM()
        )
    }
}
