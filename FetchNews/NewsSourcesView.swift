import SwiftUI

struct NewsSourcesView: View {
    @ObservedObject var vm: NewsVM
    @ObservedObject var authVM: AuthVM
    @State private var searchText = ""
    @State private var selectedCategory = "All"
    @State private var isLoading = false
    @State private var showingError = false
    @State private var errorMessage = ""
    
    private var filteredSources: [NewsSource] {
        let sources = selectedCategory == "All" ? vm.availableNewsSources : (vm.newsSourcesByCategory[selectedCategory] ?? [])
        
        if searchText.isEmpty {
            return sources
        } else {
            return sources.filter { source in
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
                        
                        Text("News source selection is only available for premium users. Upgrade to customize which news sources FetchNews uses for your summaries.")
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
                                        Button(category.capitalized) {
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
                        .background(Color(.systemBackground))
                        
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
                                    Text("Selected \(vm.selectedNewsSources.count) of \(vm.availableNewsSources.count) sources")
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                }
                                
                                ForEach(filteredSources) { source in
                                    NewsSourceRow(
                                        source: source,
                                        isSelected: vm.selectedNewsSources.contains(source.id),
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
            .navigationTitle("News Sources")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button(action: {
                        Task {
                            await vm.updateSelectedNewsSources(Array(vm.selectedNewsSources))
                        }
                        dismiss()
                    }) {
                        Image(systemName: "chevron.left")
                    }
                }
            }
            .onAppear {
                if (authVM.currentUser?.isPremium == true) && vm.availableNewsSources.isEmpty {
                    Task {
                        isLoading = true
                        await vm.loadAvailableNewsSources()
                        isLoading = false
                    }
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
                    Text(source.category.capitalized)
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
