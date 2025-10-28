//
//  PersonalizeView.swift
//  FetchNews
//
//  Created by Finlay Smith on 8/14/25.
//

import SwiftUI

struct PersonalizeView: View {
    @EnvironmentObject var vm: NewsVM
    @EnvironmentObject var authVM: AuthVM
    @State private var showingNewsSources = false
    @State private var showingScheduledSummaries = false
    
    var body: some View {
        NavigationView {
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
                        
                        // Premium indicator
                        if let user = authVM.currentUser, user.isPremium {
                            Button("PREMIUM") {
                                // Already premium, could show premium features
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
                .background(Color(.systemBackground))
                
                // Personalization Content
                ScrollView {
                    VStack(spacing: 24) {
                        
                        // Morning Summary Section - Hidden for now
                        // MorningSummarySection()
                        
                        // Summary Length Section
                        SummaryLengthSection()
                        
                        // Playback Speed Section
                        PlaybackSpeedSection()
                        
                        // Voice Section
                        VoiceSection()
                        
                        // Content Filter Section
                        ContentFilterSection()
                        
                        // Premium Features Section
                        if let user = authVM.currentUser, user.isPremium {
                            PremiumFeaturesSection(
                                showingNewsSources: $showingNewsSources,
                                showingScheduledSummaries: $showingScheduledSummaries
                            )
                        }
                        
                        // Bottom spacing to ensure full scroll
                        Spacer(minLength: 100)
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 16)
                }
            }
        }
        .sheet(isPresented: $showingNewsSources) {
            NewsSourcesView(vm: vm, authVM: authVM)
        }
        .sheet(isPresented: $showingScheduledSummaries) {
            ScheduledSummariesView(vm: vm)
        }
    }
}

// MARK: - Morning Summary Section

struct MorningSummarySection: View {
    @EnvironmentObject var vm: NewsVM
    @State private var fetchTime = Date()
    @State private var isEnabled = false
    
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Scheduled Summary")
                .font(.headline)
                .fontWeight(.semibold)
                .foregroundColor(.primary)
            
            VStack(spacing: 12) {
                HStack {
                    DatePicker("", selection: $fetchTime, displayedComponents: .hourAndMinute)
                        .labelsHidden()
                    
                    Spacer()
                    
                    Toggle("", isOn: $isEnabled)
                        .toggleStyle(SwitchToggleStyle(tint: .green))
                }
            }
            .padding()
            .background(Color(.systemGray6))
            .cornerRadius(12)
        }
    }
}

// MARK: - Playback Speed Section

struct PlaybackSpeedSection: View {
    @EnvironmentObject var vm: NewsVM
    private let speeds: [Double] = [0.8, 1.0, 1.25, 1.5, 1.75, 2.0]
    
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Playback Speed")
                .font(.headline)
                .fontWeight(.semibold)
                .foregroundColor(.primary)
            
            VStack(spacing: 12) {
                Text("Adjust the playback speed for audio summaries.")
                    .font(.caption)
                    .foregroundColor(.secondary)
                
                Picker("Speed", selection: $vm.playbackRate) {
                    ForEach(speeds, id: \.self) { speed in
                        Text(speed == 1.0 ? "1× (Normal)" : String(format: "%.2gx", speed)).tag(speed)
                    }
                }
                .pickerStyle(WheelPickerStyle())
                .frame(height: 100)
            }
            .padding()
            .background(Color(.systemGray6))
            .cornerRadius(12)
        }
    }
}

// MARK: - Voice Section

struct VoiceSection: View {
    @EnvironmentObject var vm: NewsVM
    
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Voice")
                .font(.headline)
                .fontWeight(.semibold)
                .foregroundColor(.primary)
            
            VStack(spacing: 12) {
                Text("Choose the voice for audio summaries.")
                    .font(.caption)
                    .foregroundColor(.secondary)
                
                Picker("Voice", selection: $vm.selectedVoice) {
                    ForEach(vm.availableVoices, id: \.self) { voice in
                        Text(voice).tag(voice)
                    }
                }
                .pickerStyle(WheelPickerStyle())
                .frame(height: 100)
                .onChange(of: vm.selectedVoice) { oldValue, newValue in
                    vm.setVoice(newValue)
                }
                
                // Test Voice Button
                Button(action: {
                    Task {
                        await vm.testVoice()
                    }
                }) {
                    HStack {
                        if vm.isPlayingVoicePreview {
                            Image(systemName: "speaker.wave.2.fill")
                                .foregroundColor(.blue)
                        } else {
                            Image(systemName: "play.circle.fill")
                                .foregroundColor(.blue)
                        }
                        Text("Test Voice")
                            .font(.subheadline.weight(.medium))
                            .foregroundColor(.blue)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(Color.blue.opacity(0.1))
                    .cornerRadius(10)
                }
                .disabled(vm.isPlayingVoicePreview)
            }
            .padding()
            .background(Color(.systemGray6))
            .cornerRadius(12)
        }
    }
}

// MARK: - Summary Length Section

struct SummaryLengthSection: View {
    @EnvironmentObject var vm: NewsVM
    
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Summary Length")
                .font(.headline)
                .fontWeight(.semibold)
                .foregroundColor(.primary)
            
            VStack(spacing: 12) {
                ForEach(ApiClient.Length.allCases, id: \.self) { length in
                    Button(action: {
                        vm.length = length
                    }) {
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(length.displayName)
                                    .font(.subheadline)
                                    .fontWeight(.medium)
                                    .foregroundColor(.primary)
                                
                                Text(length.description)
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                            
                            Spacer()
                            
                            if vm.length == length {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundColor(.blue)
                            } else {
                                Image(systemName: "circle")
                                    .foregroundColor(.secondary)
                            }
                        }
                        .padding()
                        .background(vm.length == length ? Color.blue.opacity(0.1) : Color(.systemGray6))
                        .cornerRadius(10)
                    }
                    .buttonStyle(PlainButtonStyle())
                }
            }
        }
    }
}

// MARK: - Content Filter Section

struct ContentFilterSection: View {
    @EnvironmentObject var vm: NewsVM
    
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Content Filter")
                .font(.headline)
                .fontWeight(.semibold)
                .foregroundColor(.primary)
            
            VStack(spacing: 12) {
                HStack {
                    Text("Uplifting News Only")
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .foregroundColor(.primary)
                    
                    Spacer()
                    
                    Toggle("", isOn: $vm.upliftingNewsOnly)
                        .toggleStyle(SwitchToggleStyle(tint: .blue))
                        .onChange(of: vm.upliftingNewsOnly) { oldValue, newValue in
                            vm.setUpliftingNewsOnly(newValue)
                        }
                }
            }
            .padding()
            .background(Color(.systemGray6))
            .cornerRadius(12)
        }
    }
}

// MARK: - Premium Features Section

struct PremiumFeaturesSection: View {
    @EnvironmentObject var vm: NewsVM
    @Binding var showingNewsSources: Bool
    @Binding var showingScheduledSummaries: Bool
    
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Premium Features")
                .font(.headline)
                .fontWeight(.semibold)
                .foregroundColor(.primary)
            
            VStack(spacing: 12) {
                // News Sources
                Button(action: { showingNewsSources = true }) {
                    HStack {
                        Image(systemName: "newspaper")
                            .foregroundColor(.blue)
                            .frame(width: 24)
                        
                        VStack(alignment: .leading, spacing: 2) {
                            Text("News Sources")
                                .font(.subheadline)
                                .fontWeight(.medium)
                                .foregroundColor(.primary)
                            Text("Choose which news sources to use")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                        
                        Spacer()
                        
                        if !vm.selectedNewsSources.isEmpty {
                            Text("\(vm.selectedNewsSources.count) selected")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                        
                        Image(systemName: "chevron.right")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    .padding()
                    .background(Color(.systemGray6))
                    .cornerRadius(12)
                }
                .buttonStyle(PlainButtonStyle())
                
                // Scheduled Summaries - Hidden for now
                // Button(action: { showingScheduledSummaries = true }) {
                //     HStack {
                //         Image(systemName: "clock")
                //             .foregroundColor(.blue)
                //             .frame(width: 24)
                //         
                //         VStack(alignment: .leading, spacing: 2) {
                //             Text("Scheduled Summaries")
                //                 .font(.subheadline)
                //                 .fontWeight(.medium)
                //                 .foregroundColor(.primary)
                //             Text("Set up automatic news summaries")
                //                 .font(.caption)
                //                 .foregroundColor(.secondary)
                //         }
                //         
                //         Spacer()
                //         
                //         if !vm.scheduledSummaries.isEmpty {
                //             Text("\(vm.scheduledSummaries.count) scheduled")
                //                 .font(.caption)
                //                 .foregroundColor(.secondary)
                //         }
                //         
                //         Image(systemName: "chevron.right")
                //             .font(.caption)
                //             .foregroundColor(.secondary)
                //     }
                //     .padding()
                //     .background(Color(.systemGray6))
                //     .cornerRadius(12)
                // }
                // .buttonStyle(PlainButtonStyle())
            }
        }
    }
}

#Preview {
    PersonalizeView()
        .environmentObject(NewsVM())
        .environmentObject(AuthVM())
}
