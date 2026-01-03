# Topic Intelligence - Integration Example

## Quick Integration for CustomTopicView

Here's how to add topic intelligence to your existing `TopicBrowserView` (CustomTopicView):

### Step 1: Add Topic Intelligence When User Searches

Replace the "Add custom topic" button in the CustomTopicView (around line 124-138) with this intelligent version:

```swift
// In TopicBrowserView, around line 118-140
} else {
    // No results found - offer to add as custom with intelligence
    VStack(spacing: 16) {
        Text("No topics found matching '\(searchText)'")
            .foregroundColor(.secondary)
        
        if !searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            // NEW: Topic Intelligence Integration
            TopicIntelligenceAddButton(
                topic: searchText,
                onAdd: { finalTopic in
                    addCustomTopic(finalTopic)
                    searchText = ""
                }
            )
        }
    }
    .padding()
}
```

### Step 2: Create the Intelligent Add Button Component

Add this new component to your `TopicIntelligenceHelper.swift`:

```swift
/// Smart button that analyzes topic before adding
struct TopicIntelligenceAddButton: View {
    let topic: String
    let onAdd: (String) -> Void
    
    @State private var analysis: TopicAnalysisResponse?
    @State private var isAnalyzing = false
    @State private var showingSuggestions = false
    
    var body: some View {
        VStack(spacing: 12) {
            // Main add button
            Button(action: {
                Task {
                    await analyzeAndShow()
                }
            }) {
                HStack {
                    if isAnalyzing {
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle())
                            .scaleEffect(0.8)
                    } else {
                        Image(systemName: "plus.circle.fill")
                    }
                    Text("Add '\(topic)' as custom topic")
                }
                .font(.subheadline)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(Color.blue.opacity(0.1))
                .foregroundColor(.blue)
                .cornerRadius(8)
            }
            .disabled(isAnalyzing)
            
            // Show suggestions if topic needs improvement
            if let analysis = analysis, analysis.needsImprovement {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundColor(.orange)
                        Text(analysis.message.title)
                            .font(.caption)
                            .fontWeight(.semibold)
                    }
                    
                    Text(analysis.message.message)
                        .font(.caption2)
                        .foregroundColor(.secondary)
                    
                    if !analysis.suggestions.isEmpty {
                        Text("Try these instead:")
                            .font(.caption)
                            .fontWeight(.medium)
                            .padding(.top, 4)
                        
                        ForEach(analysis.suggestions.prefix(3), id: \.self) { suggestion in
                            Button(action: {
                                onAdd(suggestion)
                            }) {
                                HStack {
                                    Text(suggestion)
                                        .font(.caption)
                                    Spacer()
                                    Image(systemName: "arrow.right.circle.fill")
                                        .font(.caption)
                                }
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .background(Color.green.opacity(0.1))
                                .foregroundColor(.green)
                                .cornerRadius(6)
                            }
                        }
                        
                        Button("Add Original Anyway") {
                            onAdd(topic)
                        }
                        .font(.caption2)
                        .foregroundColor(.secondary)
                        .padding(.top, 4)
                    }
                }
                .padding()
                .background(Color.orange.opacity(0.1))
                .cornerRadius(10)
                .transition(.scale.combined(with: .opacity))
            } else if analysis != nil && !analysis!.needsImprovement {
                // Topic is good - just show success message
                HStack {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(.green)
                    Text("Good topic!")
                        .font(.caption)
                }
                .padding(.vertical, 4)
            }
        }
        .animation(.spring(), value: analysis)
    }
    
    private func analyzeAndShow() async {
        isAnalyzing = true
        
        do {
            let result = try await TopicIntelligenceService.shared.analyzeTopic(topic)
            
            await MainActor.run {
                analysis = result
                
                // If topic is good, auto-add it after a brief delay
                if !result.needsImprovement {
                    Task {
                        try? await Task.sleep(nanoseconds: 500_000_000) // 0.5s
                        onAdd(topic)
                    }
                }
            }
        } catch {
            print("Failed to analyze topic: \(error)")
            // On error, just add the topic (graceful degradation)
            await MainActor.run {
                onAdd(topic)
            }
        }
        
        isAnalyzing = false
    }
}
```

### Step 3: Update ApiClient to Support New Endpoints

Add these methods to your `ApiClient.swift`:

```swift
// In ApiClient.swift

func post(endpoint: String, body: [String: Any]) async throws -> Data {
    guard let url = URL(string: "\(baseURL)\(endpoint)") else {
        throw URLError(.badURL)
    }
    
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    
    // Add auth token if available
    if let token = getAuthToken() {
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    }
    
    request.httpBody = try JSONSerialization.data(withJSONObject: body)
    
    let (data, response) = try await URLSession.shared.data(for: request)
    
    guard let httpResponse = response as? HTTPURLResponse,
          200...299 ~= httpResponse.statusCode else {
        throw URLError(.badServerResponse)
    }
    
    return data
}

func get(endpoint: String) async throws -> Data {
    guard let url = URL(string: "\(baseURL)\(endpoint)") else {
        throw URLError(.badURL)
    }
    
    var request = URLRequest(url: url)
    request.httpMethod = "GET"
    
    // Add auth token if available
    if let token = getAuthToken() {
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    }
    
    let (data, response) = try await URLSession.shared.data(for: request)
    
    guard let httpResponse = response as? HTTPURLResponse,
          200...299 ~= httpResponse.statusCode else {
        throw URLError(.badServerResponse)
    }
    
    return data
}

private func getAuthToken() -> String? {
    // Implement your token retrieval logic
    // This might be from UserDefaults, Keychain, or your auth manager
    return UserDefaults.standard.string(forKey: "authToken")
}
```

## Optional: Add Periodic Topic Refinement

Show users suggestions to improve their topics based on feedback:

### In your ViewModel or periodic check (e.g., after fetching news):

```swift
// In NewsVM.swift or similar

/// Check if user's topics should be refined based on their feedback
func checkForTopicRefinements() async {
    guard !customTopics.isEmpty else { return }
    
    for topic in customTopics {
        // Only check topics with significant feedback (20+ articles)
        // This is approximate - you'd need to track feedback per topic
        
        do {
            let result = try await TopicIntelligenceService.shared
                .shouldRefineTopic(topic, threshold: 70)
            
            if result.shouldRefine, let newTopic = result.newTopic {
                // Show notification to user
                await MainActor.run {
                    showTopicRefinementAlert(
                        original: topic,
                        refined: newTopic,
                        suggestions: result.suggestions
                    )
                }
            }
        } catch {
            print("Failed to check refinement for '\(topic)': \(error)")
        }
    }
}

private func showTopicRefinementAlert(original: String, refined: String, suggestions: [String]) {
    // Show alert or banner to user
    // Implementation depends on your UI framework
}
```

## Testing the Integration

1. **Test Broad Topic:**
   - Search for "Politics"
   - Click "Add as custom topic"
   - Should see warning with suggestions: "U.S. Politics", "Congress", etc.

2. **Test Specific Topic:**
   - Search for "RNA polymerase research"
   - Click "Add as custom topic"
   - Should see info message about broadening search

3. **Test Good Topic:**
   - Search for "Artificial Intelligence"
   - Click "Add as custom topic"
   - Should see quick success and auto-add after brief delay

## UI/UX Tips

### 1. Don't Block User Flow
- Always allow users to add their original topic even if it's "too broad"
- Show suggestions but make them optional
- Use "Add Original Anyway" button

### 2. Provide Context
- Explain WHY a topic might be problematic
- Show specific examples of better alternatives
- Use friendly language, not technical terms

### 3. Progressive Enhancement
- If API call fails, gracefully degrade (just add the topic)
- Show loading states (spinner while analyzing)
- Use animations for smooth transitions

### 4. Minimize Friction
- Auto-debounce analysis (don't analyze on every keystroke)
- Cache analysis results for common topics
- Only analyze when user clicks "Add"

## Advanced: Pre-analyze Predefined Topics

You can pre-analyze your predefined topics and mark ones that might be too broad:

```swift
// In your predefined topics JSON or generation script
{
  "categories": [
    {
      "name": "Politics",
      "topics": [
        "U.S. Politics",      // Good ✅
        "Congress",           // Good ✅
        "Politics",           // Too broad ⚠️ (marked)
        "White House",        // Good ✅
        "Supreme Court"       // Good ✅
      ],
      "broadTopics": ["Politics"]  // New field
    }
  ]
}
```

Then in your UI, show a warning icon next to broad topics:

```swift
ForEach(category.topics, id: \.self) { topic in
    HStack {
        if category.broadTopics?.contains(topic) ?? false {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundColor(.orange)
                .font(.caption2)
        }
        Text(topic)
    }
}
```

## Performance Considerations

1. **Debouncing**: Wait 500-800ms after user stops typing
2. **Caching**: Cache analysis results for common topics
3. **Batch Analysis**: Use `/api/topics/analyze-batch` for multiple topics
4. **Fallback**: If OpenAI is unavailable, use heuristics (automatic)

## Cost Estimate

Using GPT-4o-mini:
- Per analysis: ~$0.00015
- 1000 analyses: ~$0.15
- Very affordable for real-time suggestions

Most apps will do <1000 analyses per day, costing ~$5/month.
