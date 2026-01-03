//
//  TopicsView.swift
//  FetchNews
//
//  Manage subscribed topics for news feed
//

import SwiftUI

struct TopicsView: View {
    @EnvironmentObject var vm: NewsVM
    @EnvironmentObject var authVM: AuthVM
    @State private var showingTopicBrowser = false
    @State private var showAllSelected = false
    @State private var showAllTrending = false
    @State private var showAllCustom = false
    
    var body: some View {
        VStack(spacing: 0) {
            // Header
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
            
            // Topics Content
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    // Title and description
                    VStack(alignment: .leading, spacing: 8) {
                        Text("My Topics")
                            .font(.title3)
                            .fontWeight(.semibold)
                            .foregroundColor(.primary)
                        
                        Text("Select topics you want in your feed. Your feed updates automatically at 6am and 6pm daily with news from your selected topics.")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    .padding(.top, 24)
                    .padding(.horizontal, 20)
                    
                    // Selected Topics Section (if any)
                    if !vm.selectedTopics.isEmpty {
                        SelectedTopicsGrid(
                            selectedTopics: vm.selectedTopics,
                            onTopicToggle: { topic in vm.toggle(topic) },
                            showAll: $showAllSelected
                        )
                    }
                    
                    // Trending Topics Section
                    TrendingTopicsGrid(
                        trendingTopics: vm.trendingTopics,
                        selectedTopics: vm.selectedTopics,
                        onTopicToggle: { topic in vm.toggle(topic) },
                        showAll: $showAllTrending
                    )
                    
                    // Custom Topics Section
                    CustomTopicsGrid(
                        customTopics: vm.customTopics,
                        selectedTopics: vm.selectedTopics,
                        onTopicToggle: { topic in vm.toggle(topic) },
                        showAll: $showAllCustom,
                        vm: vm,
                        showingTopicBrowser: $showingTopicBrowser
                    )
                    
                    
                    // Info box
                    VStack(alignment: .leading, spacing: 12) {
                        HStack(spacing: 8) {
                            Image(systemName: "clock.fill")
                                .foregroundColor(.blue)
                            Text("Automatic Updates")
                                .font(.headline)
                                .foregroundColor(.primary)
                        }
                        
                        VStack(alignment: .leading, spacing: 8) {
                            HStack(spacing: 8) {
                                Image(systemName: "sunrise.fill")
                                    .foregroundColor(.orange)
                                    .font(.system(size: 16))
                                Text("6:00 AM - Morning news")
                                    .font(.subheadline)
                                    .foregroundColor(.primary)
                            }
                            
                            HStack(spacing: 8) {
                                Image(systemName: "sunset.fill")
                                    .foregroundColor(.purple)
                                    .font(.system(size: 16))
                                Text("6:00 PM - Evening news")
                                    .font(.subheadline)
                                    .foregroundColor(.primary)
                            }
                        }
                        
                        Text("Your feed automatically updates twice daily with personalized news from your selected topics.")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    .padding()
                    .background(
                        LinearGradient(
                            gradient: Gradient(colors: [
                                Color.blue.opacity(0.1),
                                Color.purple.opacity(0.1)
                            ]),
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .cornerRadius(12)
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(Color.blue.opacity(0.3), lineWidth: 1)
                    )
                    .padding(.horizontal, 20)
                    
                    // Bottom padding
                    Spacer(minLength: vm.canPlay ? 120 : 60)
                }
            }
        }
        .background(Color.darkGreyBackground)
        .sheet(isPresented: $showingTopicBrowser) {
            TopicBrowserView()
                .environmentObject(vm)
        }
    }
}

// MARK: - Topic Grid Components

struct SelectedTopicsGrid: View {
    let selectedTopics: Set<String>
    let onTopicToggle: (String) -> Void
    @Binding var showAll: Bool
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Selected (\(selectedTopics.count))")
                    .font(.headline)
                    .fontWeight(.semibold)
                    .foregroundColor(.primary)
                Spacer()
                if selectedTopics.count > 6 {
                    Button(showAll ? "Show less" : "See all") {
                        showAll.toggle()
                    }
                    .font(.subheadline)
                    .foregroundColor(.blue)
                }
            }
            .padding(.horizontal, 20)
            
            LazyVGrid(columns: [
                GridItem(.adaptive(minimum: 140), spacing: 10, alignment: .center)
            ], alignment: .leading, spacing: 10) {
                ForEach(Array(selectedTopics).sorted(), id: \.self) { topic in
                    TopicChip(
                        title: smartCapitalized(topic),
                        isActive: true,
                        minWidth: 140
                    ) { onTopicToggle(topic) }
                }
            }
            .padding(.horizontal, 20)
        }
    }
}

struct TrendingTopicsGrid: View {
    let trendingTopics: [String]
    let selectedTopics: Set<String>
    let onTopicToggle: (String) -> Void
    @Binding var showAll: Bool
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Trending")
                    .font(.headline)
                    .fontWeight(.semibold)
                    .foregroundColor(.primary)
                Spacer()
                if !trendingTopics.isEmpty && trendingTopics.count > 6 {
                    Button(showAll ? "Show less" : "See all") {
                        showAll.toggle()
                    }
                    .font(.subheadline)
                    .foregroundColor(.blue)
                }
            }
            .padding(.horizontal, 20)
            
            if trendingTopics.isEmpty {
                Text("Trending topics unavailable")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .padding(.horizontal, 20)
            } else {
                LazyVGrid(columns: [
                    GridItem(.adaptive(minimum: 140), spacing: 10, alignment: .center)
                ], alignment: .leading, spacing: 10) {
                    let displayTopics = showAll ? trendingTopics : Array(trendingTopics.prefix(6))
                    ForEach(displayTopics, id: \.self) { topic in
                        TopicChip(
                            title: smartCapitalized(topic),
                            isActive: selectedTopics.contains(topic.lowercased()),
                            minWidth: 140
                        ) { onTopicToggle(topic.lowercased()) }
                    }
                }
                .padding(.horizontal, 20)
            }
        }
    }
}

struct CustomTopicsGrid: View {
    let customTopics: [String]
    let selectedTopics: Set<String>
    let onTopicToggle: (String) -> Void
    @Binding var showAll: Bool
    let vm: NewsVM
    @Binding var showingTopicBrowser: Bool
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("My Custom Topics")
                        .font(.headline)
                        .fontWeight(.semibold)
                        .foregroundColor(.primary)
                    
                    Button(action: {
                        showingTopicBrowser = true
                    }) {
                        Text("Browse topics")
                            .font(.subheadline)
                            .foregroundColor(.blue)
                    }
                }
                Spacer()
                HStack(spacing: 12) {
                    // Delete button for selected custom topics
                    let selectedCustomTopics = selectedTopics.intersection(Set(customTopics))
                    if !selectedCustomTopics.isEmpty {
                        Button("Delete") {
                            Task {
                                await vm.deleteSelectedCustomTopics()
                            }
                        }
                        .font(.subheadline)
                        .foregroundColor(.red)
                    }
                    
                    if !customTopics.isEmpty && customTopics.count > 6 {
                        Button(showAll ? "Show less" : "See all") {
                            showAll.toggle()
                        }
                        .font(.subheadline)
                        .foregroundColor(.blue)
                    }
                }
            }
            .padding(.horizontal, 20)
            
            if !customTopics.isEmpty {
                LazyVGrid(columns: [
                    GridItem(.adaptive(minimum: 140), spacing: 10, alignment: .center)
                ], alignment: .leading, spacing: 10) {
                    let displayTopics = showAll ? customTopics : Array(customTopics.prefix(6))
                    ForEach(displayTopics, id: \.self) { topic in
                        TopicChip(
                            title: topic,
                            isActive: selectedTopics.contains(topic),
                            minWidth: 140
                        ) { onTopicToggle(topic) }
                    }
                }
                .padding(.horizontal, 20)
            } else {
                Text("No custom topics yet. Browse and add topics that interest you.")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .padding(.horizontal, 20)
            }
        }
    }
}

#Preview {
    TopicsView()
        .environmentObject(NewsVM())
        .environmentObject(AuthVM())
}
