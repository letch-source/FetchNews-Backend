import SwiftUI

struct NewsSourcesView: View {
    @ObservedObject var vm: NewsVM
    @ObservedObject var authVM: AuthVM
    @Environment(\.dismiss) var dismiss
    @State private var searchText = ""
    @State private var selectedCategory = "All"
    @State private var isLoading = false
    @State private var showingError = false
    @State private var errorMessage = ""
    
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
    
    var body: some View {
        VStack(spacing: 0) {
                if !(authVM.currentUser?.isPremium == true) {
                    // Premium gate
                    VStack(spacing: 16) {
                        Image(systemName: "crown.fill")
                            .font(.system(size: 48))
                            .foregroundColor(.yellow)
                        
                        Text("Premium Feature")
                            .font(.title2)
                            .fontWeight(.bold)
                        
                        Text("News source exclusion is only available for premium users. Upgrade to customize which news sources FetchNews excludes from your summaries.")
                            .multilineTextAlignment(.center)
                            .foregroundColor(.secondary)
                        
                        Button("Upgrade to Premium") {
                            vm.showSubscriptionView()
                        }
                        .buttonStyle(.borderedProminent)
                    }
                    .padding()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color(.systemGroupedBackground))
                } else {
                    // News sources selection
                    VStack(spacing: 0) {
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
                        .padding()
                        .background(Color.darkGreyBackground)
                        
                        // Sources list
                        if isLoading {
                            VStack {
                                Spacer()
                                ProgressView("Loading news sources...")
                                Spacer()
                            }
                        } else if filteredSources.isEmpty {
                            VStack {
                                Spacer()
                                Image(systemName: "newspaper")
                                    .font(.system(size: 48))
                                    .foregroundColor(.secondary)
                                
                                Text("No sources found")
                                    .font(.title3)
                                    .fontWeight(.medium)
                                
                                Text(searchText.isEmpty ? "No sources available in this category" : "No sources match your search")
                                    .foregroundColor(.secondary)
                                    .multilineTextAlignment(.center)
                                
                                Spacer()
                            }
                        } else {
                            List {
                                Section {
                                    Text("Excluded \(vm.excludedNewsSources.count) of \(vm.availableNewsSources.count) sources")
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                }
                                
                                ForEach(filteredSources) { source in
                                    NewsSourceRow(
                                        source: source,
                                        isSelected: vm.excludedNewsSources.contains(source.id),
                                        onToggle: {
                                            vm.toggleNewsSource(source.id)
                                        }
                                    )
                                }
                            }
                            .listStyle(.insetGrouped)
                        }
                    }
                }
            }
            .navigationTitle("Exclude News Sources")
            .navigationBarTitleDisplayMode(.large)
            .onAppear {
                if (authVM.currentUser?.isPremium == true) && vm.availableNewsSources.isEmpty {
                    Task {
                        isLoading = true
                        await vm.loadAvailableNewsSources()
                        isLoading = false
                    }
                }
            }
            .onDisappear {
                // Save excluded news source preferences when leaving the view
                Task {
                    await vm.updateExcludedNewsSources(Array(vm.excludedNewsSources))
                }
            }
            .alert("Error", isPresented: $showingError) {
                Button("OK") { }
            } message: {
                Text(errorMessage)
            }
        }
    }

struct NewsSourceRow: View {
    let source: NewsSource
    let isSelected: Bool
    let onToggle: () -> Void
    
    var body: some View {
        HStack(spacing: 12) {
            // Selection toggle
            Button(action: onToggle) {
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .font(.title2)
                    .foregroundColor(isSelected ? .accentColor : .secondary)
            }
            .buttonStyle(.plain)
            
            VStack(alignment: .leading, spacing: 4) {
                // Source name
                Text(source.name)
                    .font(.headline)
                    .foregroundColor(.primary)
                
                // Description
                Text(source.description)
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .lineLimit(2)
                
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
        .padding(.vertical, 4)
        .contentShape(Rectangle())
        .onTapGesture {
            onToggle()
        }
    }
}

#Preview {
    NewsSourcesView(vm: NewsVM(), authVM: AuthVM())
}
