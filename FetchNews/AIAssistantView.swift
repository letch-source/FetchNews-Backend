//
//  AIAssistantView.swift
//  FetchNews
//
//  Created by Finlay Smith on 1/2/26.
//

import SwiftUI
import AVFoundation

struct AIAssistantView: View {
    @EnvironmentObject var vm: NewsVM
    @Environment(\.dismiss) private var dismiss
    
    let fetchId: String
    let fetchSummary: String
    let fetchTopics: [String]
    
    @State private var userMessage = ""
    @State private var conversation: [ChatMessage] = []
    @State private var isProcessing = false
    @State private var errorMessage: String?
    @State private var showError = false
    @StateObject private var speechRecognizer = SpeechRecognizer()
    @State private var speechAuthorizationGranted = false
    
    // For voice response playback
    @State private var responsePlayer: AVPlayer?
    @State private var isPlayingResponse = false
    
    // Track audio position for context
    private var audioProgress: Double {
        guard vm.duration > 0 else { return 0 }
        return vm.currentTime / vm.duration
    }
    
    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                // Conversation area
                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(spacing: 16) {
                            // Initial context message
                            if conversation.isEmpty {
                                VStack(spacing: 12) {
                                    Image(systemName: "sparkles")
                                        .font(.system(size: 48))
                                        .foregroundColor(.blue)
                                    
                                    Text("Ask me anything about this fetch!")
                                        .font(.headline)
                                        .foregroundColor(.primary)
                                    
                                    Text("Topics: \(fetchTopics.joined(separator: ", "))")
                                        .font(.subheadline)
                                        .foregroundColor(.secondary)
                                        .multilineTextAlignment(.center)
                                        .padding(.horizontal)
                                }
                                .frame(maxWidth: .infinity)
                                .padding(.top, 40)
                            }
                            
                            // Messages
                            ForEach(conversation) { message in
                                MessageBubble(message: message)
                                    .id(message.id)
                            }
                            
                            // Processing indicator
                            if isProcessing {
                                HStack {
                                    ProgressView()
                                        .progressViewStyle(CircularProgressViewStyle())
                                    Text("Thinking...")
                                        .font(.subheadline)
                                        .foregroundColor(.secondary)
                                }
                                .padding()
                            }
                        }
                        .padding()
                    }
                    .onChange(of: conversation.count) { _, _ in
                        // Auto-scroll to bottom when new message arrives
                        if let lastMessage = conversation.last {
                            withAnimation {
                                proxy.scrollTo(lastMessage.id, anchor: .bottom)
                            }
                        }
                    }
                }
                
                Divider()
                
                // Input area
                VStack(spacing: 12) {
                    // Voice recording indicator
                    if speechRecognizer.isRecording {
                        HStack {
                            Circle()
                                .fill(Color.red)
                                .frame(width: 12, height: 12)
                                .opacity(speechRecognizer.isRecording ? 1.0 : 0.0)
                                .animation(.easeInOut(duration: 0.5).repeatForever(autoreverses: true), value: speechRecognizer.isRecording)
                            
                            Text(speechRecognizer.transcript.isEmpty ? "Listening..." : speechRecognizer.transcript)
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                                .lineLimit(2)
                            
                            Spacer()
                            
                            Button("Done") {
                                speechRecognizer.stopRecording()
                                userMessage = speechRecognizer.transcript
                            }
                            .font(.subheadline)
                            .foregroundColor(.blue)
                        }
                        .padding(.horizontal)
                        .padding(.vertical, 8)
                        .background(Color(.systemGray6))
                        .cornerRadius(8)
                        .padding(.horizontal)
                    }
                    
                    // Input field
                    HStack(spacing: 12) {
                        // Voice input button
                        Button(action: { toggleVoiceInput() }) {
                            Image(systemName: speechRecognizer.isRecording ? "mic.fill" : "mic")
                                .font(.system(size: 20))
                                .foregroundColor(speechRecognizer.isRecording ? .red : .blue)
                                .frame(width: 40, height: 40)
                        }
                        .disabled(isProcessing)
                        
                        // Text field
                        TextField("Ask about this fetch...", text: $userMessage, axis: .vertical)
                            .textFieldStyle(.plain)
                            .padding(10)
                            .background(Color(.systemGray6))
                            .cornerRadius(20)
                            .lineLimit(1...4)
                            .disabled(speechRecognizer.isRecording)
                        
                        // Send button
                        Button(action: { sendMessage() }) {
                            Image(systemName: "arrow.up.circle.fill")
                                .font(.system(size: 32))
                                .foregroundColor(userMessage.isEmpty ? .gray : .blue)
                        }
                        .disabled(userMessage.isEmpty || isProcessing || speechRecognizer.isRecording)
                    }
                    .padding(.horizontal)
                    .padding(.vertical, 8)
                }
                .background(Color(.systemBackground))
            }
            .navigationTitle("AI Assistant")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: {
                        // Stop any recording
                        if speechRecognizer.isRecording {
                            speechRecognizer.stopRecording()
                        }
                        
                        // Stop any playing response
                        responsePlayer?.pause()
                        responsePlayer = nil
                        isPlayingResponse = false
                        
                        // Save conversation before dismissing
                        saveConversation()
                        
                        // Ensure audio session is restored for playback
                        restoreAudioSession()
                        
                        dismiss()
                    }) {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(.secondary)
                    }
                }
            }
        }
        .alert("Error", isPresented: $showError) {
            Button("OK") {
                showError = false
            }
        } message: {
            if let error = errorMessage {
                Text(error)
            }
        }
        .task {
            // Request speech recognition authorization
            speechAuthorizationGranted = await speechRecognizer.requestAuthorization()
        }
        .onAppear {
            // Load saved conversation for this fetch
            loadConversation()
        }
        .onDisappear {
            // Stop any recording
            if speechRecognizer.isRecording {
                speechRecognizer.stopRecording()
            }
            
            // Stop any playing response
            responsePlayer?.pause()
            responsePlayer = nil
            
            // Save conversation when view disappears
            saveConversation()
            
            // Restore audio session for main player
            restoreAudioSession()
        }
    }
    
    private func restoreAudioSession() {
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [])
            try AVAudioSession.sharedInstance().setActive(true)
            print("✅ Audio session restored for playback")
        } catch {
            print("❌ Failed to restore audio session: \(error)")
        }
    }
    
    private func toggleVoiceInput() {
        if speechRecognizer.isRecording {
            speechRecognizer.stopRecording()
            userMessage = speechRecognizer.transcript
        } else {
            if !speechAuthorizationGranted {
                errorMessage = "Microphone access is required for voice input. Please enable it in Settings."
                showError = true
                return
            }
            
            Task {
                do {
                    try await speechRecognizer.startRecording()
                } catch {
                    errorMessage = "Failed to start voice recording: \(error.localizedDescription)"
                    showError = true
                }
            }
        }
    }
    
    private func sendMessage() {
        let message = userMessage.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !message.isEmpty else { return }
        
        // Add user message to conversation
        let userChatMessage = ChatMessage(role: "user", content: message)
        conversation.append(userChatMessage)
        
        // Clear input
        userMessage = ""
        
        // Send to API
        isProcessing = true
        
        Task {
            do {
                // Convert conversation to format expected by API
                let conversationHistory = conversation.dropLast().map { msg in
                    ["role": msg.role, "content": msg.content]
                }
                
                // Calculate audio position context
                let progressPercent = Int(audioProgress * 100)
                let currentTimeFormatted = formatTime(vm.currentTime)
                let durationFormatted = formatTime(vm.duration)
                
                let response = try await ApiClient.askFetchAssistant(
                    fetchId: fetchId,
                    message: message,
                    conversationHistory: Array(conversationHistory),
                    audioProgress: progressPercent,
                    currentTime: currentTimeFormatted,
                    totalDuration: durationFormatted
                )
                
                // Add assistant response to conversation
                await MainActor.run {
                    let assistantMessage = ChatMessage(role: "assistant", content: response.response)
                    conversation.append(assistantMessage)
                    isProcessing = false
                    
                    // Save conversation after each exchange
                    saveConversation()
                }
                
                // Optional: Speak the response
                // await speakResponse(response.response)
                
            } catch {
                await MainActor.run {
                    isProcessing = false
                    errorMessage = "Failed to get response: \(error.localizedDescription)"
                    showError = true
                }
            }
        }
    }
    
    private func formatTime(_ seconds: Double) -> String {
        guard seconds.isFinite, seconds >= 0 else { return "0:00" }
        let s = Int(seconds.rounded())
        let m = s / 60
        let r = s % 60
        return String(format: "%d:%02d", m, r)
    }
    
    // MARK: - Conversation Persistence
    
    private func saveConversation() {
        let key = "AIConversation_\(fetchId)"
        do {
            let encoder = JSONEncoder()
            let data = try encoder.encode(conversation)
            UserDefaults.standard.set(data, forKey: key)
            print("✅ Saved conversation for fetch \(fetchId) (\(conversation.count) messages)")
        } catch {
            print("❌ Failed to save conversation: \(error)")
        }
    }
    
    private func loadConversation() {
        let key = "AIConversation_\(fetchId)"
        guard let data = UserDefaults.standard.data(forKey: key) else {
            print("ℹ️ No saved conversation found for fetch \(fetchId)")
            return
        }
        
        do {
            let decoder = JSONDecoder()
            conversation = try decoder.decode([ChatMessage].self, from: data)
            print("✅ Loaded conversation for fetch \(fetchId) (\(conversation.count) messages)")
        } catch {
            print("❌ Failed to load conversation: \(error)")
        }
    }
    
    private func speakResponse(_ text: String) async {
        // Optional: Use TTS to speak the assistant's response
        do {
            let audioURL = try await ApiClient.textToSpeech(
                text: text,
                voice: vm.selectedVoice,
                speed: vm.playbackRate
            )
            
            await MainActor.run {
                let player = AVPlayer(url: audioURL)
                responsePlayer = player
                player.play()
                isPlayingResponse = true
                
                // Observe when playback ends
                NotificationCenter.default.addObserver(
                    forName: .AVPlayerItemDidPlayToEndTime,
                    object: player.currentItem,
                    queue: .main
                ) { _ in
                    isPlayingResponse = false
                }
            }
        } catch {
            print("Failed to speak response: \(error)")
        }
    }
}

struct MessageBubble: View {
    let message: ChatMessage
    
    var body: some View {
        HStack {
            if message.role == "user" {
                Spacer()
            }
            
            VStack(alignment: message.role == "user" ? .trailing : .leading, spacing: 4) {
                Text(message.content)
                    .font(.body)
                    .foregroundColor(message.role == "user" ? .white : .primary)
                    .padding(12)
                    .background(message.role == "user" ? Color.blue : Color(.systemGray5))
                    .cornerRadius(16)
                
                Text(formatTime(message.timestamp))
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
            .frame(maxWidth: 260, alignment: message.role == "user" ? .trailing : .leading)
            
            if message.role == "assistant" {
                Spacer()
            }
        }
    }
    
    private func formatTime(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }
}

#Preview {
    AIAssistantView(
        fetchId: "test-id",
        fetchSummary: "Test summary about technology and politics",
        fetchTopics: ["Technology", "Politics", "Business"]
    )
    .environmentObject(NewsVM())
}
