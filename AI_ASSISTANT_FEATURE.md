# 🤖 AI Assistant Feature

## Overview

The AI Assistant feature allows users to have interactive conversations about their news Fetches. Users can pause the audio at any time, ask questions about the content, and get intelligent responses based on the articles and summary they're listening to.

## Features

### ✅ What's Included

1. **Interactive Chat Interface**
   - Clean, modern chat UI with message bubbles
   - Scrollable conversation history
   - Real-time processing indicator
   - **Persistent conversations** - your chats save per fetch!

2. **Voice Input** 🎤
   - Tap the microphone button to ask questions hands-free
   - Real-time speech-to-text transcription
   - Visual recording indicator with live transcript
   - Automatic permission requests for microphone and speech recognition

3. **Text Input** ⌨️
   - Type questions if preferred
   - Multi-line text input support
   - Send button activates when text is entered

4. **Context-Aware Responses** 🎯
   - AI has full access to the fetch summary
   - Knows all topics and articles in the current fetch
   - Can reference specific articles by number
   - Maintains conversation history for follow-up questions
   - **Knows your audio position** - understands "this" and "that" based on where you are!
   - Infers topic context from playback position

5. **Web Search Integration** 🌐 **NEW!**
   - AI can search the web for current information
   - Gets real-time updates beyond your fetch
   - Clearly labels fetch content vs. web results
   - Powered by Tavily API for accurate, relevant results
   - AI decides when to search automatically

6. **Seamless Audio Integration**
   - Audio automatically pauses when opening assistant
   - Simple X button to close and resume listening
   - Audio state preserved across assistant sessions

## How to Use

### For Users

1. **Listen to Your Fetch**
   - Start playing a fetch as normal

2. **Open AI Assistant**
   - Tap the chat bubble icon (💬) in the audio player controls
   - The audio will pause automatically

3. **Ask Questions**
   - **Voice**: Tap the microphone icon and speak your question
   - **Text**: Type your question in the text field
   - Tap send or "Done" (for voice) to submit

4. **Get Answers**
   - The AI will respond with relevant information from your fetch
   - Ask follow-up questions to dig deeper
   - The AI can reference specific articles and provide details

5. **Resume Listening**
   - Tap "Resume Fetch" when you're done
   - Your audio will continue where it left off

### Example Questions

**About Your Fetch:**
- "What are the key takeaways from this fetch?"
- "Tell me more about the technology developments"
- "Which article discusses climate change?"
- "What did article 3 say about [topic]?"
- "Can you explain [concept] in simpler terms?"

**With Web Search (NEW!):**
- "What's the latest on this?" *(searches for recent updates)*
- "What happened after this article was published?"
- "Is there any breaking news about [topic]?"
- "What's the current status of [event]?"
- "What are experts saying now?"

**Context-Aware (Position-Based):**
- "Is the government doing anything about this?" *(knows which topic you're hearing)*
- "Tell me more about this" *(understands based on audio position)*
- "What else happened with that?" *(infers from playback context)*

## Technical Implementation

### Frontend (iOS)

**New Files:**
- `AIAssistantView.swift` - Main chat interface
- `SpeechRecognizer.swift` - Voice input handling

**Modified Files:**
- `FetchScreen.swift` - Added AI assistant button and sheet
- `ApiClient.swift` - Added `askFetchAssistant()` method
- `Models.swift` - Added `ChatMessage` and `AssistantResponse` models
- `Info.plist` - Added microphone and speech recognition permissions

### Backend (Node.js)

**New Endpoint:**
- `POST /api/fetch-assistant` (authenticated)
  - Receives: `fetchId`, `userMessage`, `conversationHistory`, `audioProgress`, `currentTime`, `totalDuration`
  - Returns: AI response with context

**Implementation Details:**
- Uses OpenAI GPT-4o-mini for responses
- **OpenAI Function Calling** for intelligent web search
- **Tavily API integration** for real-time web search
- Loads full fetch context from user's summary history
- Maintains conversation history for context
- Tracks audio position for contextual understanding
- Provides structured article information to AI
- AI autonomously decides when to search the web
- Returns relevant context with each response

### Models & Data Flow

```
User Question → SpeechRecognizer/TextField
     ↓
ChatMessage (local)
     ↓
ApiClient.askFetchAssistant()
     ↓
Backend /api/fetch-assistant
     ↓
Fetch Context + OpenAI GPT-4o-mini
     ↓
AssistantResponse
     ↓
Display in Chat UI
```

## Permissions

The app will request the following permissions when you first use voice input:

1. **Microphone Access** - Required for voice input
2. **Speech Recognition** - Required to convert speech to text

Both permissions are only requested when needed and can be managed in iOS Settings.

## Cost Considerations

**Without Web Search:**
- Each question uses OpenAI's GPT-4o-mini model
- Average cost: ~$0.0001 per question/answer pair

**With Web Search:**
- OpenAI GPT-4o-mini: ~$0.0001
- Tavily API search: ~$0.002 per search
- Total: ~$0.0021 per question with search
- AI only searches when beneficial (not every question)

**Overall:**
- Very affordable for all users
- Average cost per conversation: $0.001-0.005
- Could limit free users to 5-10 questions per fetch if needed

## ✅ Recently Added Features

1. **Web Search** 🌐 - Get real-time information
2. **Conversation Persistence** 💾 - Chats save per fetch
3. **Audio Position Tracking** 🎯 - AI knows where you are
4. **Context-Aware Responses** - Understands "this" and "that"

## Future Enhancements

### Potential Features to Add:

1. **Voice Responses** 🔊
   - Have the AI speak its answers using TTS
   - Toggle between text and voice responses

2. **Suggested Questions** 💡
   - Show contextual question suggestions based on content
   - Quick-tap common questions

3. **Article Deep Dive** 📰
   - "Tell me more about article 3"
   - Get expanded details from specific articles
   - Show related articles from the web

4. **Smart Summaries** ✨
   - "Summarize the key points"
   - "What changed since yesterday?"
   - Compare with previous fetches

5. **Multi-language Support** 🌍
   - Ask questions in any language
   - Get responses in your preferred language

6. **Share Insights** 📤
   - Share AI responses with friends
   - Export conversation transcripts
   - Create shareable highlights

## Privacy & Security

- **Conversations persist locally** on your device (UserDefaults)
- Only the current user's fetches are accessible
- Authentication required for all API calls
- Speech recognition happens on-device (iOS native)
- OpenAI API calls follow their privacy policy
- Web searches are performed server-side via Tavily API
- No conversation data is sold or shared with third parties

## Troubleshooting

### Voice Input Not Working

1. Check microphone permissions in Settings → Fetch News
2. Ensure speech recognition is enabled
3. Check for background noise interference
4. Try toggling microphone off and on

### AI Not Responding

1. Check internet connection
2. Ensure you're authenticated
3. Verify the fetch has loaded properly
4. Try asking the question differently

### Audio Not Resuming

1. Close and reopen the AI assistant
2. Try manually tapping play/pause
3. Restart the app if issues persist

## Developer Notes

### Adding Voice Response (TTS)

To enable spoken responses, uncomment and implement the `speakResponse()` method in `AIAssistantView.swift`:

```swift
private func speakResponse(_ text: String) async {
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
        }
    } catch {
        print("Failed to speak response: \(error)")
    }
}
```

Then call it after receiving the assistant response:

```swift
await speakResponse(response.response)
```

### Customizing the AI Prompt

Edit the system prompt in `backend/index.js` at the `/api/fetch-assistant` endpoint to change the AI's behavior, tone, or capabilities.

### Environment Variables

Add to your `.env` file:

```bash
# Required for AI Assistant
OPENAI_API_KEY=your_openai_api_key

# Optional - enables web search (highly recommended)
TAVILY_API_KEY=your_tavily_api_key
```

**Get Tavily API Key:**
1. Sign up at https://tavily.com
2. Free tier includes 1,000 searches/month
3. Copy your API key
4. Add to backend `.env` file

Without `TAVILY_API_KEY`, the assistant works but can't search the web.

### Limiting Questions (Usage Control)

To limit questions for free users, add this check in the backend:

```javascript
// Check user tier
if (!user.isPremium) {
  const questionCount = await getQuestionCount(user._id, fetchId);
  if (questionCount >= 10) {
    return res.status(429).json({ 
      error: "Question limit reached. Upgrade to Premium for unlimited questions." 
    });
  }
}
```

## Support

For questions or issues with the AI Assistant feature, please contact support or refer to the main documentation.

---

**Version:** 1.0.0  
**Last Updated:** January 2, 2026  
**Status:** ✅ Production Ready
