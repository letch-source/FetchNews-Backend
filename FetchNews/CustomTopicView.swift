//
//  CustomTopicView.swift
//  FetchNews
//
//  Created by Finlay Smith on 8/14/25.
//

import SwiftUI

struct CustomTopicView: View {
    @EnvironmentObject var vm: NewsVM
    @Environment(\.dismiss) private var dismiss
    @State private var newTopic = ""
    @State private var showingAlert = false
    @State private var alertMessage = ""
    
    // Regular topics that users can already select (from ContentView)
    let regularTopics = [
        "business", "entertainment", "general", "health", "science", "sports", "technology", "world"
    ]
    
    // Different popular topics for custom topics (not overlapping with regular topics)
    let predefinedTopics = [
        "Politics", "Local", "Environment", "Education", "Finance", "Travel",
        "Food", "Fashion", "Art", "Music", "Gaming", "Cryptocurrency",
        "Real Estate", "Automotive", "Fitness", "Weather", "Space", "AI"
    ]
    
    // Filter out topics that are already in custom topics OR are regular topics
    var availablePredefinedTopics: [String] {
        predefinedTopics.filter { topic in
            !vm.customTopics.contains(topic) && 
            !regularTopics.contains(topic.lowercased())
        }
    }
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 20) {
                    // Header
                    VStack(spacing: 8) {
                        Image(systemName: "plus.circle.fill")
                            .font(.system(size: 50))
                            .foregroundColor(.blue)
                        
                        Text("Custom Topics")
                            .font(.title2)
                            .fontWeight(.bold)
                        
                        Text("Create your own news categories")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    .padding(.top, 20)
                
                // Add new topic section
                VStack(alignment: .leading, spacing: 12) {
                    Text("Add New Topic")
                        .font(.headline)
                    
                    HStack {
                        TextField("Enter topic name", text: $newTopic)
                            .textFieldStyle(RoundedBorderTextFieldStyle())
                            .onSubmit {
                                addTopic()
                            }
                        
                        Button("Add") {
                            addTopic()
                        }
                        .disabled(newTopic.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }
                .padding(.horizontal)
                
                // Current custom topics
                if !vm.customTopics.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Your Custom Topics")
                            .font(.headline)
                            .padding(.horizontal)
                        
                        LazyVGrid(columns: [
                            GridItem(.adaptive(minimum: 120), spacing: 8)
                        ], spacing: 8) {
                            ForEach(vm.customTopics, id: \.self) { topic in
                                HStack {
                                    Text(topic)
                                        .font(.caption)
                                        .lineLimit(1)
                                    
                                    Button(action: {
                                        Task {
                                            await vm.removeCustomTopic(topic)
                                        }
                                    }) {
                                        Image(systemName: "xmark.circle.fill")
                                            .foregroundColor(.red)
                                            .font(.caption)
                                    }
                                }
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(Color.blue.opacity(0.1))
                                .cornerRadius(8)
                            }
                        }
                        .padding(.horizontal)
                    }
                }
                
                // Predefined topics section (only show if there are available topics)
                if !availablePredefinedTopics.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Suggested Topics")
                            .font(.headline)
                            .padding(.horizontal)
                        
                        LazyVGrid(columns: [
                            GridItem(.adaptive(minimum: 100), spacing: 8)
                        ], spacing: 8) {
                            ForEach(availablePredefinedTopics, id: \.self) { topic in
                                Button(action: {
                                    Task {
                                        await vm.addCustomTopic(topic)
                                    }
                                }) {
                                    Text(topic)
                                        .font(.caption)
                                        .lineLimit(1)
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 4)
                                        .background(Color.gray.opacity(0.1))
                                        .foregroundColor(.primary)
                                        .cornerRadius(8)
                                }
                            }
                        }
                        .padding(.horizontal)
                    }
                }
                
                // Add bottom padding to ensure content is visible above keyboard
                Color.clear.frame(height: 100)
            }
            .padding(.bottom, 20)
        }
        .navigationTitle("Custom Topics")
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Done") { dismiss() }
            }
        }
        .onTapGesture {
            // Dismiss keyboard when tapping outside text fields
            hideKeyboard()
        }
            .alert("Invalid Topic", isPresented: $showingAlert) {
                Button("OK") { }
            } message: {
                Text(alertMessage)
            }
            .onAppear {
                Task {
                    await vm.loadCustomTopics()
                }
            }
        }
    }
    
    private func addTopic() {
        let trimmedTopic = newTopic.trimmingCharacters(in: .whitespacesAndNewlines)
        
        if trimmedTopic.isEmpty {
            alertMessage = "Please enter a topic name."
            showingAlert = true
            return
        }
        
        if vm.customTopics.contains(trimmedTopic) {
            alertMessage = "This topic already exists."
            showingAlert = true
            return
        }
        
        // Check if it's a regular topic that users can already select
        if regularTopics.contains(trimmedTopic.lowercased()) {
            alertMessage = "This topic is already available in the main topics list."
            showingAlert = true
            return
        }
        
        // Check character limit based on word count
        let words = trimmedTopic.components(separatedBy: .whitespaces)
        if words.count == 1 {
            // Single word: 20 character limit
            if trimmedTopic.count > 20 {
                alertMessage = "Single word topics must be 20 characters or less."
                showingAlert = true
                return
            }
        } else {
            // Multiple words: 15 characters per word
            for word in words {
                if word.count > 15 {
                    alertMessage = "Each word in multi-word topics must be 15 characters or less."
                    showingAlert = true
                    return
                }
            }
        }
        
        Task {
            await vm.addCustomTopic(trimmedTopic)
        }
        newTopic = ""
    }
    
    private func hideKeyboard() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }
}

#Preview {
    CustomTopicView()
        .environmentObject(NewsVM())
}
