//
//  TopicBasedSourceSelectionView.swift
//  FetchNews
//
//  Topic-based news source selection onboarding screen
//  Shows main news sources first, then topic-specific sources
//

import SwiftUI

struct TopicBasedSourceSelectionView: View {
    @EnvironmentObject var vm: NewsVM
    @EnvironmentObject var authVM: AuthVM
    @Environment(\.dismiss) private var dismiss
    @State private var selectedSources: Set<String> = []
    @State private var isSubmitting = false
    @State private var isLoading = true
    @State private var expandedSections: Set<String> = ["Main News Sources"] // Start with main sources expanded
    
    // Main news sources (general, high-quality sources) - NewsAPI source IDs
    private let mainNewsSources: [String] = [
        "bbc-news",
        "cnn",
        "reuters",
        "associated-press",
        "the-new-york-times",
        "the-washington-post",
        "usa-today",
        "nbc-news",
        "abc-news",
        "cbs-news",
        "the-guardian-uk",
        "bloomberg",
        "time",
        "newsweek",
        "the-hill",
        "politico",
        "axios",
        "the-atlantic",
        "business-insider",
        "cnbc"
    ]
    
    // Topic to sources mapping (NewsAPI source IDs)
    private let topicSourcesMap: [String: [String]] = [
        // Technology topics
        "Artificial Intelligence": ["techcrunch", "the-verge", "wired", "ars-technica", "engadget", "recode", "techradar", "zdnet", "cnet", "mashable"],
        "Autonomous Vehicles": ["techcrunch", "the-verge", "wired", "ars-technica", "engadget", "recode", "techradar", "zdnet", "cnet", "mashable"],
        "Big Tech Regulation": ["techcrunch", "the-verge", "wired", "ars-technica", "recode", "politico", "the-hill", "bloomberg", "reuters", "cnn"],
        "Biotech": ["scientific-american", "nature", "new-scientist", "national-geographic", "science", "wired", "techcrunch", "reuters", "bloomberg", "cnn"],
        "Electric Vehicles": ["techcrunch", "the-verge", "wired", "ars-technica", "engadget", "recode", "bloomberg", "reuters", "cnn", "bbc-news"],
        "Gaming": ["ign", "gamespot", "polygon", "kotaku", "game-informer", "pc-gamer", "engadget", "the-verge", "techcrunch", "wired"],
        "Green tech": ["techcrunch", "the-verge", "wired", "national-geographic", "scientific-american", "reuters", "bloomberg", "cnn", "bbc-news", "the-guardian"],
        "Mixed Reality": ["techcrunch", "the-verge", "wired", "ars-technica", "engadget", "recode", "techradar", "zdnet", "cnet", "mashable"],
        "PCs": ["techcrunch", "the-verge", "wired", "ars-technica", "engadget", "recode", "techradar", "zdnet", "cnet", "pc-gamer"],
        "Smartphones": ["techcrunch", "the-verge", "wired", "ars-technica", "engadget", "recode", "techradar", "zdnet", "cnet", "mashable"],
        "Social Media": ["techcrunch", "the-verge", "wired", "ars-technica", "recode", "mashable", "cnn", "bbc-news", "reuters", "bloomberg"],
        "Space Tech": ["scientific-american", "nature", "new-scientist", "national-geographic", "science", "techcrunch", "the-verge", "wired", "reuters", "cnn"],
        "Wearables": ["techcrunch", "the-verge", "wired", "ars-technica", "engadget", "recode", "techradar", "zdnet", "cnet", "mashable"],
        
        // Fashion topics
        "Fashion culture": ["vogue", "elle", "harpers-bazaar", "vanity-fair", "w-magazine", "the-cut", "refinery29", "who-what-wear", "business-of-fashion", "womens-wear-daily"],
        "Fashion Designers": ["vogue", "elle", "harpers-bazaar", "vanity-fair", "w-magazine", "the-cut", "business-of-fashion", "womens-wear-daily", "dazed", "i-d"],
        "Fashion Sustainability": ["vogue", "elle", "harpers-bazaar", "business-of-fashion", "womens-wear-daily", "the-guardian", "reuters", "bloomberg", "cnn", "bbc-news"],
        "Fashion Trends": ["vogue", "elle", "harpers-bazaar", "vanity-fair", "w-magazine", "the-cut", "refinery29", "who-what-wear", "business-of-fashion", "womens-wear-daily"],
        "Footwear": ["vogue", "elle", "harpers-bazaar", "business-of-fashion", "womens-wear-daily", "highsnobiety", "hypebeast", "complex", "gq", "esquire"],
        "Menswear": ["gq", "esquire", "mens-health", "vogue", "harpers-bazaar", "business-of-fashion", "womens-wear-daily", "dazed", "i-d", "highsnobiety"],
        "Retail Fashion": ["business-of-fashion", "womens-wear-daily", "bloomberg", "reuters", "cnn", "bbc-news", "the-guardian", "vogue", "elle", "harpers-bazaar"],
        "Runway": ["vogue", "elle", "harpers-bazaar", "vanity-fair", "w-magazine", "the-cut", "business-of-fashion", "womens-wear-daily", "dazed", "i-d"],
        "Streetwear": ["highsnobiety", "hypebeast", "complex", "gq", "esquire", "vogue", "harpers-bazaar", "business-of-fashion", "dazed", "i-d"],
        "Vintage Fashion": ["vogue", "elle", "harpers-bazaar", "vanity-fair", "the-cut", "refinery29", "who-what-wear", "business-of-fashion", "dazed", "i-d"],
        "Womenswear": ["vogue", "elle", "harpers-bazaar", "vanity-fair", "w-magazine", "the-cut", "refinery29", "who-what-wear", "business-of-fashion", "womens-wear-daily"],
        
        // Science topics
        "Astronomy": ["scientific-american", "nature", "new-scientist", "national-geographic", "science", "space-news", "reuters", "cnn", "bbc-news", "the-guardian"],
        "Biology": ["scientific-american", "nature", "new-scientist", "national-geographic", "science", "reuters", "cnn", "bbc-news", "the-guardian", "time"],
        "Chemistry": ["scientific-american", "nature", "new-scientist", "national-geographic", "science", "reuters", "cnn", "bbc-news", "the-guardian", "time"],
        "Cognitive Science": ["scientific-american", "nature", "new-scientist", "national-geographic", "science", "psychology-today", "reuters", "cnn", "bbc-news", "the-guardian"],
        "Computer Science": ["techcrunch", "the-verge", "wired", "ars-technica", "scientific-american", "nature", "new-scientist", "reuters", "cnn", "bbc-news"],
        "Engineering": ["scientific-american", "nature", "new-scientist", "national-geographic", "science", "techcrunch", "the-verge", "wired", "reuters", "cnn"],
        "Enviornmental Science": ["scientific-american", "nature", "new-scientist", "national-geographic", "science", "the-guardian", "reuters", "cnn", "bbc-news", "bloomberg"],
        "Math": ["scientific-american", "nature", "new-scientist", "national-geographic", "science", "reuters", "cnn", "bbc-news", "the-guardian", "time"],
        "Medicine": ["scientific-american", "nature", "new-scientist", "national-geographic", "science", "reuters", "cnn", "bbc-news", "the-guardian", "time"],
        "Physics": ["scientific-american", "nature", "new-scientist", "national-geographic", "science", "reuters", "cnn", "bbc-news", "the-guardian", "time"],
        
        // Politics topics
        "Civil Rights": ["politico", "the-hill", "cnn", "bbc-news", "the-guardian", "reuters", "associated-press", "the-new-york-times", "the-washington-post", "nbc-news"],
        "Elections": ["politico", "the-hill", "cnn", "bbc-news", "the-guardian", "reuters", "associated-press", "the-new-york-times", "the-washington-post", "nbc-news"],
        "Foreign Policy": ["politico", "the-hill", "cnn", "bbc-news", "the-guardian", "reuters", "associated-press", "the-new-york-times", "the-washington-post", "nbc-news"],
        "Healthcare": ["politico", "the-hill", "cnn", "bbc-news", "the-guardian", "reuters", "associated-press", "the-new-york-times", "the-washington-post", "nbc-news"],
        "Immigration": ["politico", "the-hill", "cnn", "bbc-news", "the-guardian", "reuters", "associated-press", "the-new-york-times", "the-washington-post", "nbc-news"],
        "Legislation": ["politico", "the-hill", "cnn", "bbc-news", "the-guardian", "reuters", "associated-press", "the-new-york-times", "the-washington-post", "nbc-news"],
        
        // Entertainment topics
        "Animation": ["entertainment-weekly", "variety", "hollywood-reporter", "deadline", "the-wrap", "indiewire", "collider", "screenrant", "ign", "gamespot"],
        "Awards": ["entertainment-weekly", "variety", "hollywood-reporter", "deadline", "the-wrap", "indiewire", "people", "us-magazine", "e-online", "tmz"],
        "Celebrity": ["people", "us-magazine", "e-online", "tmz", "entertainment-weekly", "variety", "hollywood-reporter", "deadline", "the-wrap", "indiewire"],
        "Festivals": ["entertainment-weekly", "variety", "hollywood-reporter", "deadline", "the-wrap", "indiewire", "rolling-stone", "billboard", "pitchfork", "nme"],
        "Movies": ["entertainment-weekly", "variety", "hollywood-reporter", "deadline", "the-wrap", "indiewire", "collider", "screenrant", "ign", "gamespot"],
        "Music": ["rolling-stone", "billboard", "pitchfork", "nme", "entertainment-weekly", "variety", "hollywood-reporter", "deadline", "the-wrap", "indiewire"],
        "Streaming": ["entertainment-weekly", "variety", "hollywood-reporter", "deadline", "the-wrap", "indiewire", "techcrunch", "the-verge", "wired", "recode"],
        "Theater": ["entertainment-weekly", "variety", "hollywood-reporter", "deadline", "the-wrap", "indiewire", "the-new-york-times", "the-guardian", "bbc-news", "cnn"],
        "TV": ["entertainment-weekly", "variety", "hollywood-reporter", "deadline", "the-wrap", "indiewire", "collider", "screenrant", "ign", "gamespot"],
        
        // Sports topics
        "Baseball": ["espn", "bleacher-report", "sports-illustrated", "the-sporting-news", "cbssports", "nbc-sports", "fox-sports", "yahoo-sports", "reuters", "cnn"],
        "Basketball": ["espn", "bleacher-report", "sports-illustrated", "the-sporting-news", "cbssports", "nbc-sports", "fox-sports", "yahoo-sports", "reuters", "cnn"],
        "Football": ["espn", "bleacher-report", "sports-illustrated", "the-sporting-news", "cbssports", "nbc-sports", "fox-sports", "yahoo-sports", "reuters", "cnn"],
        "Golf": ["espn", "bleacher-report", "sports-illustrated", "the-sporting-news", "cbssports", "nbc-sports", "fox-sports", "yahoo-sports", "reuters", "cnn"],
        "Gymnastics": ["espn", "bleacher-report", "sports-illustrated", "the-sporting-news", "cbssports", "nbc-sports", "fox-sports", "yahoo-sports", "reuters", "cnn"],
        "Hockey": ["espn", "bleacher-report", "sports-illustrated", "the-sporting-news", "cbssports", "nbc-sports", "fox-sports", "yahoo-sports", "reuters", "cnn"],
        "Olympics": ["espn", "bleacher-report", "sports-illustrated", "the-sporting-news", "cbssports", "nbc-sports", "fox-sports", "yahoo-sports", "reuters", "cnn"],
        "Rugby": ["espn", "bleacher-report", "sports-illustrated", "the-sporting-news", "cbssports", "nbc-sports", "fox-sports", "yahoo-sports", "reuters", "cnn"],
        "Soccer": ["espn", "bleacher-report", "sports-illustrated", "the-sporting-news", "cbssports", "nbc-sports", "fox-sports", "yahoo-sports", "reuters", "cnn"],
        "Super Bowl": ["espn", "bleacher-report", "sports-illustrated", "the-sporting-news", "cbssports", "nbc-sports", "fox-sports", "yahoo-sports", "reuters", "cnn"],
        "Tennis": ["espn", "bleacher-report", "sports-illustrated", "the-sporting-news", "cbssports", "nbc-sports", "fox-sports", "yahoo-sports", "reuters", "cnn"],
        "World Cup": ["espn", "bleacher-report", "sports-illustrated", "the-sporting-news", "cbssports", "nbc-sports", "fox-sports", "yahoo-sports", "reuters", "cnn"],
        
        // Health topics
        "Aging": ["health", "medical-news-today", "webmd", "healthline", "prevention", "mens-health", "womens-health", "reuters", "cnn", "bbc-news"],
        "Fitness": ["health", "medical-news-today", "webmd", "healthline", "prevention", "mens-health", "womens-health", "espn", "bleacher-report", "sports-illustrated"],
        "Gut Health": ["health", "medical-news-today", "webmd", "healthline", "prevention", "mens-health", "womens-health", "scientific-american", "nature", "new-scientist"],
        "Mental Health": ["health", "medical-news-today", "webmd", "healthline", "prevention", "mens-health", "womens-health", "psychology-today", "reuters", "cnn"],
        "Mens Health": ["mens-health", "health", "medical-news-today", "webmd", "healthline", "prevention", "reuters", "cnn", "bbc-news", "the-guardian"],
        "Nutrition": ["health", "medical-news-today", "webmd", "healthline", "prevention", "mens-health", "womens-health", "scientific-american", "nature", "new-scientist"],
        "Skin Health": ["health", "medical-news-today", "webmd", "healthline", "prevention", "mens-health", "womens-health", "vogue", "elle", "harpers-bazaar"],
        "Sleep": ["health", "medical-news-today", "webmd", "healthline", "prevention", "mens-health", "womens-health", "scientific-american", "nature", "new-scientist"],
        "Women's Health": ["womens-health", "health", "medical-news-today", "webmd", "healthline", "prevention", "mens-health", "reuters", "cnn", "bbc-news"]
    ]
    
    // Get user's selected topics from AuthVM
    private var userSelectedTopics: [String] {
        authVM.currentUser?.selectedTopics ?? []
    }
    
    // Get all category-based sources from NewsVM's newsSourcesByCategory
    private var categoryBasedSources: [(category: String, sources: [String])] {
        // Use the sources already grouped by category from NewsVM
        // NewsAPI categories: business, entertainment, general, health, science, sports, technology
        let orderedCategories = ["technology", "general", "science", "entertainment", "sports", "health", "business"]
        
        return orderedCategories.compactMap { categoryKey in
            if let sources = vm.newsSourcesByCategory[categoryKey], !sources.isEmpty {
                // Map category names to display names
                let displayName: String
                switch categoryKey {
                case "general": displayName = "General News"
                case "technology": displayName = "Technology"
                case "science": displayName = "Science"
                case "entertainment": displayName = "Entertainment"
                case "sports": displayName = "Sports"
                case "health": displayName = "Health"
                case "business": displayName = "Business"
                default: displayName = smartCapitalized(categoryKey)
                }
                return (category: displayName, sources: sources.map { $0.id })
            }
            return nil
        }
    }
    
    // Manual grouping of sources by category (fallback)
    private var manuallyGroupedSources: [String: [String]] {
        var groups: [String: [String]] = [:]
        for source in vm.availableNewsSources {
            let cat = source.category.lowercased()
            if groups[cat] == nil {
                groups[cat] = []
            }
            groups[cat]?.append(source.id)
        }
        return groups
    }
    
    // Get all available source IDs from NewsVM
    private var availableSourceIds: Set<String> {
        Set(vm.availableNewsSources.map { $0.id })
    }
    
    // Filter sources to only include those available from NewsAPI
    private func filterAvailableSources(_ sourceIds: [String]) -> [String] {
        sourceIds.filter { availableSourceIds.contains($0) }
    }
    
    // Get display name for source ID
    private func sourceDisplayName(_ sourceId: String) -> String {
        vm.availableNewsSources.first(where: { $0.id == sourceId })?.name ?? smartCapitalized(sourceId.replacingOccurrences(of: "-", with: " "))
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
    
    // Toggle section expansion
    private func toggleSection(_ section: String) {
        if expandedSections.contains(section) {
            expandedSections.remove(section)
        } else {
            expandedSections.insert(section)
        }
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
                    ScrollView(.vertical, showsIndicators: true) {
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
                                
                                // Selected Sources Bubbles
                                if !selectedSources.isEmpty {
                                    VStack(spacing: 8) {
                                        Text("Selected Sources")
                                            .font(.caption)
                                            .foregroundColor(.secondary)
                                            .frame(maxWidth: .infinity, alignment: .leading)
                                        
                                        ScrollView(.horizontal, showsIndicators: false) {
                                            HStack(spacing: 8) {
                                                ForEach(Array(selectedSources).sorted(), id: \.self) { sourceId in
                                                    SourceBubble(
                                                        title: sourceDisplayName(sourceId),
                                                        onRemove: {
                                                            let _ = withAnimation(.easeInOut(duration: 0.2)) {
                                                                selectedSources.remove(sourceId)
                                                            }
                                                        }
                                                    )
                                                }
                                            }
                                            .padding(.horizontal, 4)
                                        }
                                    }
                                    .padding(.top, 12)
                                }
                            }
                            .padding(.top, 20)
                            .padding(.horizontal)
                            
                            // Show sections only if we have sources loaded
                            if !vm.availableNewsSources.isEmpty {
                                // Main News Sources Section (only show if we have sources)
                                let mainSources = filterAvailableSources(mainNewsSources)
                                if !mainSources.isEmpty {
                                    SourceSection(
                                        title: "Main News Sources",
                                        sourceIds: mainSources,
                                        selectedSources: $selectedSources,
                                        isExpanded: expandedSections.contains("Main News Sources"),
                                        onToggle: { toggleSection("Main News Sources") },
                                        sourceDisplayName: sourceDisplayName
                                    )
                                    .padding(.horizontal)
                                }
                                
                                // Category-based sections
                                let categories = categoryBasedSources
                                if !categories.isEmpty {
                                    ForEach(categories, id: \.category) { categorySection in
                                        SourceSection(
                                            title: categorySection.category,
                                            sourceIds: categorySection.sources,
                                            selectedSources: $selectedSources,
                                            isExpanded: expandedSections.contains(categorySection.category),
                                            onToggle: { toggleSection(categorySection.category) },
                                            sourceDisplayName: sourceDisplayName
                                        )
                                        .padding(.horizontal)
                                    }
                                } else if !vm.newsSourcesByCategory.isEmpty {
                                    // Fallback: Show all sources grouped by their category from NewsVM
                                    ForEach(Array(vm.newsSourcesByCategory.keys).sorted(), id: \.self) { category in
                                        if let sources = vm.newsSourcesByCategory[category], !sources.isEmpty {
                                            let displayName = category == "general" ? "General News" : smartCapitalized(category)
                                            SourceSection(
                                                title: displayName,
                                                sourceIds: sources.map { $0.id },
                                                selectedSources: $selectedSources,
                                                isExpanded: expandedSections.contains(displayName),
                                                onToggle: { toggleSection(displayName) },
                                                sourceDisplayName: sourceDisplayName
                                            )
                                            .padding(.horizontal)
                                        }
                                    }
                                } else if !vm.availableNewsSources.isEmpty {
                                    // Last resort: Group sources manually by category
                                    let manualGroups = manuallyGroupedSources
                                    
                                    ForEach(Array(manualGroups.keys).sorted(), id: \.self) { category in
                                        if let sources = manualGroups[category], !sources.isEmpty {
                                            let displayName = category == "general" ? "General News" : smartCapitalized(category)
                                            SourceSection(
                                                title: displayName,
                                                sourceIds: sources,
                                                selectedSources: $selectedSources,
                                                isExpanded: expandedSections.contains(displayName),
                                                onToggle: { toggleSection(displayName) },
                                                sourceDisplayName: sourceDisplayName
                                            )
                                            .padding(.horizontal)
                                        }
                                    }
                                } else {
                                    // No sources available
                                    VStack(spacing: 16) {
                                        Image(systemName: "exclamationmark.triangle")
                                            .font(.system(size: 48))
                                            .foregroundColor(.orange)
                                        Text("No sources available")
                                            .font(.headline)
                                        Text("Please check your internet connection and try again")
                                            .font(.caption)
                                            .foregroundColor(.secondary)
                                            .multilineTextAlignment(.center)
                                    }
                                    .padding(.top, 40)
                                }
                            } else {
                                // Loading or error state
                                VStack(spacing: 16) {
                                    ProgressView()
                                    Text("Loading news sources...")
                                        .foregroundColor(.secondary)
                                }
                                .padding(.top, 40)
                            }
                            
                            Spacer(minLength: 100)
                        }
                    }
                }
            }
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarBackButtonHidden(true)
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
                
                // Debug: Print what we got
                print("📰 Loaded \(vm.availableNewsSources.count) sources")
                print("📰 Categories available: \(vm.newsSourcesByCategory.keys.joined(separator: ", "))")
                print("📰 Category-based sources count: \(categoryBasedSources.count)")
                
                // Print all available US sources with details
                print("\n=== ALL AVAILABLE US SOURCES (\(vm.availableNewsSources.count)) ===")
                for source in vm.availableNewsSources.sorted(by: { $0.name < $1.name }) {
                    print("ID: \(source.id)")
                    print("  Name: \(source.name)")
                    print("  Category: \(source.category)")
                    print("  Description: \(source.description)")
                    print("  ---")
                }
                print("=== END OF SOURCES LIST ===\n")
                
                // Also print just the IDs in a convenient format for copying
                let sourceIds = vm.availableNewsSources.map { $0.id }.sorted()
                print("\n📋 All source IDs (copy-paste ready):")
                print(sourceIds.joined(separator: "\", \""))
                print("\n")
                
                // Auto-select main sources by default (filter to only available ones)
                let availableMainSources = filterAvailableSources(mainNewsSources)
                if availableMainSources.count >= 10 {
                    selectedSources = Set(availableMainSources.prefix(10))
                } else if !vm.availableNewsSources.isEmpty {
                    // If main sources aren't available, select first 10 from any category
                    selectedSources = Set(vm.availableNewsSources.prefix(10).map { $0.id })
                }
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

// MARK: - Source Section

struct SourceSection: View {
    let title: String
    let sourceIds: [String]
    @Binding var selectedSources: Set<String>
    let isExpanded: Bool
    let onToggle: () -> Void
    let sourceDisplayName: (String) -> String
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Section header
            Button(action: {
                let _ = withAnimation(.easeInOut(duration: 0.2)) {
                    onToggle()
                }
            }) {
                HStack {
                    Text(title)
                        .font(.title2)
                        .fontWeight(.bold)
                        .foregroundColor(.primary)
                    
                    Spacer()
                    
                    // Count badge
                    let selectedCount = sourceIds.filter { selectedSources.contains($0) }.count
                    if selectedCount > 0 {
                        Text("\(selectedCount)")
                            .font(.caption)
                            .fontWeight(.semibold)
                            .foregroundColor(.white)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(Color.blue)
                            .cornerRadius(12)
                    }
                    
                    Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.secondary)
                }
                .padding(.vertical, 8)
            }
            .buttonStyle(PlainButtonStyle())
            
            // Sources grid (shown when expanded)
            if isExpanded {
                if !sourceIds.isEmpty {
                    LazyVGrid(columns: [
                        GridItem(.flexible(), spacing: 10),
                        GridItem(.flexible(), spacing: 10)
                    ], alignment: .leading, spacing: 10) {
                        ForEach(sourceIds, id: \.self) { sourceId in
                            SourceSelectionBubble(
                                title: sourceDisplayName(sourceId),
                                isSelected: selectedSources.contains(sourceId)
                            ) {
                                let _ = withAnimation(.easeInOut(duration: 0.2)) {
                                    if selectedSources.contains(sourceId) {
                                        selectedSources.remove(sourceId)
                                    } else {
                                        selectedSources.insert(sourceId)
                                    }
                                }
                            }
                        }
                    }
                    .transition(.opacity.combined(with: .move(edge: .top)))
                } else {
                    VStack(spacing: 8) {
                        Text("No sources available for this category")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        Text("Sources are loading or may not be available in your region")
                            .font(.caption2)
                            .foregroundColor(.secondary.opacity(0.7))
                    }
                    .padding(.vertical, 8)
                }
            }
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }
}

// MARK: - Source Selection Bubble

struct SourceSelectionBubble: View {
    let title: String
    let isSelected: Bool
    var action: () -> Void
    
    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.subheadline)
                .multilineTextAlignment(.center)
                .lineLimit(nil)
                .fixedSize(horizontal: false, vertical: true)
                .minimumScaleFactor(0.8)
                .padding(.vertical, 12)
                .padding(.horizontal, 16)
                .frame(maxWidth: .infinity)
                .frame(minHeight: 50)
                .background(isSelected ? Color.blue : Color.buttonGrey)
                .foregroundColor(.white)
                .cornerRadius(999)
                .scaleEffect(isSelected ? 1.05 : 1.0)
        }
        .buttonStyle(PlainButtonStyle())
    }
}

// MARK: - Source Bubble (for selected sources display)

struct SourceBubble: View {
    let title: String
    let onRemove: () -> Void
    
    var body: some View {
        HStack(spacing: 6) {
            Text(title)
                .font(.caption)
                .fontWeight(.medium)
                .lineLimit(1)
            
            Button(action: onRemove) {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 14))
                    .foregroundColor(.blue.opacity(0.7))
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(Color.blue.opacity(0.15))
        .foregroundColor(.blue)
        .cornerRadius(16)
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color.blue.opacity(0.3), lineWidth: 1)
        )
    }
}

#Preview {
    TopicBasedSourceSelectionView()
        .environmentObject(NewsVM())
        .environmentObject(AuthVM())
}
