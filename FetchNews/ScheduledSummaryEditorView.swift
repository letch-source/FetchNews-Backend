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
    
    @State private var name: String = ""
    @State private var selectedTime: Date = Date()
    @State private var selectedTopics: Set<String> = []
    @State private var selectedCustomTopics: Set<String> = []
    @State private var isEnabled: Bool = true
    @State private var isLoading: Bool = false
    
    private let allTopics = ["business", "entertainment", "general", "health", "science", "sports", "technology", "world"]
    
    var body: some View {
        NavigationView {
            Form {
                Section(header: Text("Summary Details")) {
                    TextField("Summary Name", text: $name)
                        .textFieldStyle(RoundedBorderTextFieldStyle())
                    
                    DatePicker("Time", selection: $selectedTime, displayedComponents: .hourAndMinute)
                        .datePickerStyle(WheelDatePickerStyle())
                    
                    Toggle("Enabled", isOn: $isEnabled)
                }
                
                Section(header: Text("Regular Topics")) {
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
                
                Section(footer: Text("Select at least one topic for your scheduled summary.")) {
                    EmptyView()
                }
            }
            .navigationTitle(summary == nil ? "New Scheduled Summary" : "Edit Scheduled Summary")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        Task {
                            await saveScheduledSummary()
                        }
                    }
                    .disabled(name.isEmpty || (selectedTopics.isEmpty && selectedCustomTopics.isEmpty) || isLoading)
                }
            }
        }
        .onAppear {
            setupInitialValues()
        }
    }
    
    private func setupInitialValues() {
        if let summary = summary {
            // Editing existing summary
            name = summary.name
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
            // Creating new summary
            name = "Daily News"
            selectedTime = Calendar.current.date(bySettingHour: 8, minute: 0, second: 0, of: Date()) ?? Date()
            selectedTopics = ["general"]
        }
    }
    
    private func saveScheduledSummary() async {
        isLoading = true
        
        let timeFormatter = DateFormatter()
        timeFormatter.dateFormat = "HH:mm"
        let timeString = timeFormatter.string(from: selectedTime)
        
        print("Saving scheduled summary - isEditing: \(summary != nil), id: \(summary?.id ?? "new")")
        
        let newSummary = ScheduledSummary(
            id: summary?.id ?? UUID().uuidString,
            name: name,
            time: timeString,
            topics: Array(selectedTopics),
            customTopics: Array(selectedCustomTopics),
            isEnabled: isEnabled,
            createdAt: summary?.createdAt ?? ISO8601DateFormatter().string(from: Date()),
            lastRun: summary?.lastRun
        )
        
        do {
            if summary == nil {
                // Create new
                print("Creating new scheduled summary")
                let createdSummary = try await ApiClient.createScheduledSummary(newSummary)
                await MainActor.run {
                    vm.scheduledSummaries.append(createdSummary)
                }
            } else {
                // Update existing
                print("Updating existing scheduled summary with id: \(summary!.id)")
                let updatedSummary = try await ApiClient.updateScheduledSummary(newSummary)
                await MainActor.run {
                    if let index = vm.scheduledSummaries.firstIndex(where: { $0.id == updatedSummary.id }) {
                        vm.scheduledSummaries[index] = updatedSummary
                    }
                }
            }
            
            await MainActor.run {
                dismiss()
            }
        } catch {
            // Handle error silently for now
            await MainActor.run {
                dismiss()
            }
        }
        
        isLoading = false
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
