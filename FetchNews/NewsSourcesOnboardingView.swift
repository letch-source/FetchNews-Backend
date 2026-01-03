//
//  NewsSourcesOnboardingView.swift
//  FetchNews
//
//  News sources selection onboarding screen shown for first-time users
//

import SwiftUI

struct NewsSourcesOnboardingView: View {
    @EnvironmentObject var vm: NewsVM
    @EnvironmentObject var authVM: AuthVM
    @Environment(\.dismiss) private var dismiss
    @State private var selectedSources: Set<String> = []
    @State private var isSubmitting = false
    @State private var isLoading = true
    @State private var searchText = ""
    @State private var selectedCategory = "All"
    
    private var filteredSources: [NewsSource] {
        let categorySources: [NewsSource]
        if selectedCategory == "All" {
            categorySources = vm.availableNewsSources
        } else {
            categorySources = vm.newsSourcesByCategory[selectedCategory] ?? []
        }
        
        if searchText.isEmpty {
            return categorySources
        } else {
            return categorySources.filter { source in
                source.name.localizedCaseInsensitiveContains(searchText) ||
                source.description.localizedCaseInsensitiveContains(searchText)
            }
        }
    }
    
    private var categories: [String] {
        let allCategories = Array(vm.newsSourcesByCategory.keys).sorted()
        return ["All"] + allCategories
    }
    
    private var canSubmit: Bool {
        // Dynamic minimum based on available sources
        // Require at least 3 sources, or 50% of available sources (whichever is smaller)
        let totalAvailable = vm.availableNewsSources.count
        let minimumRequired = min(max(3, totalAvailable / 2), totalAvailable)
        return selectedSources.count >= minimumRequired
    }
    
    // Get the dynamic minimum required sources for display
    private var minimumRequiredSources: Int {
        let totalAvailable = vm.availableNewsSources.count
        return min(max(3, totalAvailable / 2), totalAvailable)
    }
    
    var body: some View {
        NavigationView {
            ZStack {
                Color.darkGreyBackground
                    .ignoresSafeArea()
                
                if isLoading {
                    VStack {
                        ProgressView("Loading news sources...")
                            .foregroundColor(.secondary)
                    }
                } else {
                    ScrollView {
                        VStack(spacing: 24) {
                            // Header
                            VStack(spacing: 12) {
                                Image(systemName: "newspaper.fill")
                                    .font(.system(size: 50))
                                    .foregroundColor(.blue)
                                
                                Text("Select Your News Sources")
                                    .font(.title)
                                    .fontWeight(.bold)
                                
                                Text("Choose at least \(minimumRequiredSources) news sources you want to hear from")
                                    .font(.subheadline)
                                    .foregroundColor(.secondary)
                                    .multilineTextAlignment(.center)
                                
                                // Selection counter
                                HStack(spacing: 4) {
                                    Text("\(selectedSources.count)")
                                        .font(.headline)
                                        .foregroundColor(canSubmit ? .green : .secondary)
                                    Text("/ \(minimumRequiredSources) sources selected")
                                        .font(.subheadline)
                                        .foregroundColor(.secondary)
                                }
                                .padding(.top, 8)
                            }
                            .padding(.top, 20)
                            .padding(.horizontal)
                            
                            // Search and filter bar
                            VStack(spacing: 12) {
                                HStack {
                                    Image(systemName: "magnifyingglass")
                                        .foregroundColor(.secondary)
                                    
                                    TextField("Search news sources...", text: $searchText)
                                        .textFieldStyle(.plain)
                                }
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .background(Color(.systemGray6))
                                .cornerRadius(10)
                                
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 8) {
                                    ForEach(categories, id: \.self) { category in
                                        Button(smartCapitalized(category)) {
                                            selectedCategory = category
                                        }
                                        .buttonStyle(.bordered)
                                        .controlSize(.small)
                                        .foregroundColor(selectedCategory == category ? .white : .primary)
                                        .background(selectedCategory == category ? Color.accentColor : Color(.systemGray6))
                                        .cornerRadius(8)
                                    }
                                }
                                .padding(.horizontal)
                            }
                            }
                            .padding(.horizontal)
                            
                            // Sources list
                            if filteredSources.isEmpty {
                                VStack {
                                    Image(systemName: "newspaper")
                                        .font(.system(size: 48))
                                        .foregroundColor(.secondary)
                                    
                                    Text("No sources found")
                                        .font(.title3)
                                        .fontWeight(.medium)
                                    
                                    Text(searchText.isEmpty ? "No sources available in this category" : "No sources match your search")
                                        .foregroundColor(.secondary)
                                        .multilineTextAlignment(.center)
                                }
                                .padding()
                            } else {
                                LazyVStack(spacing: 12) {
                                    ForEach(filteredSources) { source in
                                        NewsSourceOnboardingRow(
                                            source: source,
                                            isSelected: selectedSources.contains(source.id),
                                            onToggle: {
                                                withAnimation(.easeInOut(duration: 0.2)) {
                                                    if selectedSources.contains(source.id) {
                                                        selectedSources.remove(source.id)
                                                    } else {
                                                        selectedSources.insert(source.id)
                                                    }
                                                }
                                            }
                                        )
                                    }
                                }
                                .padding(.horizontal)
                            }
                            
                            Spacer(minLength: 100)
                        }
                    }
                }
            }
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: {
                        submitSources()
                    }) {
                        if isSubmitting {
                            ProgressView()
                                .progressViewStyle(CircularProgressViewStyle(tint: .white))
                        } else {
                            Text("Continue")
                                .fontWeight(.semibold)
                        }
                    }
                    .disabled(!canSubmit || isSubmitting)
                    .foregroundColor(canSubmit && !isSubmitting ? .blue : .gray)
                }
            }
        }
        .interactiveDismissDisabled() // Prevent swiping away
        .onAppear {
            loadSources()
        }
    }
    
    private func loadSources() {
        Task {
            isLoading = true
            await vm.loadAvailableNewsSources()
            await MainActor.run {
                isLoading = false
            }
        }
    }
    
    private func submitSources() {
        guard canSubmit else { return }
        
        isSubmitting = true
        
        Task {
            // Calculate which sources to exclude: exclude all sources EXCEPT the selected ones
            let allSourceIds = Set(vm.availableNewsSources.map { $0.id })
            let sourcesToExclude = allSourceIds.subtracting(selectedSources)
            
            // Save excluded sources (everything except what user selected)
            await vm.updateExcludedNewsSources(Array(sourcesToExclude))
            
            // Save to backend immediately
            do {
                let preferences = UserPreferences(
                    selectedVoice: vm.selectedVoice,
                    playbackRate: vm.playbackRate,
                    upliftingNewsOnly: vm.upliftingNewsOnly,
                    length: String(vm.length.rawValue),
                    lastFetchedTopics: Array(vm.lastFetchedTopics),
                    selectedTopics: Array(vm.selectedTopics),
                    excludedNewsSources: Array(sourcesToExclude),
                    scheduledSummaries: []
                )
                _ = try await ApiClient.updateUserPreferences(preferences)
                print("✅ Saved excluded news sources to backend: \(sourcesToExclude.count) excluded, \(selectedSources.count) selected")
            } catch {
                print("❌ Failed to save excluded news sources: \(error)")
            }
            
            // Mark onboarding as complete
            await MainActor.run {
                isSubmitting = false
                dismiss()
            }
        }
    }
}

// MARK: - News Source Onboarding Row

struct NewsSourceOnboardingRow: View {
    let source: NewsSource
    let isSelected: Bool
    let onToggle: () -> Void
    
    var body: some View {
        Button(action: onToggle) {
            HStack(spacing: 12) {
                // Selection indicator
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .font(.title2)
                    .foregroundColor(isSelected ? .blue : .secondary)
                
                VStack(alignment: .leading, spacing: 4) {
                    // Source name
                    Text(source.name)
                        .font(.headline)
                        .foregroundColor(.primary)
                    
                    // Description
                    if !source.description.isEmpty {
                        Text(source.description)
                            .font(.caption)
                            .foregroundColor(.secondary)
                            .lineLimit(2)
                    }
                    
                    // Category and country
                    HStack {
                        Text(smartCapitalized(source.category))
                            .font(.caption2)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color(.systemGray5))
                            .cornerRadius(4)
                        
                        if !source.country.isEmpty {
                            Text(source.country.uppercased())
                                .font(.caption2)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Color(.systemGray5))
                                .cornerRadius(4)
                        }
                        
                        Spacer()
                    }
                }
                
                Spacer()
            }
            .padding()
            .background(isSelected ? Color.blue.opacity(0.1) : Color(.systemGray6))
            .cornerRadius(12)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isSelected ? Color.blue : Color.clear, lineWidth: 2)
            )
        }
        .buttonStyle(PlainButtonStyle())
    }
}

#Preview {
    NewsSourcesOnboardingView()
        .environmentObject(NewsVM())
        .environmentObject(AuthVM())
}


