# Content-Based Personalization

## Overview
Advanced personalization that filters **specific subtopics** within broader topics based on user comments. For example: "I like Technology, but no AI news" or "More space coverage in Technology".

## How It Works - Universal For ALL Topics

### 1. Keyword Extraction (Works for ANY Topic)
When you comment on feedback, the system automatically extracts meaningful keywords using **two methods**:

#### Method A: Concept Recognition (100+ predefined patterns)
Maps common phrases to concepts across Technology, Politics, Sports, Entertainment, Business, Health, and more.

**Example:** *"Don't want AI or ChatGPT news"*
**Recognized Concepts:** `ai` (matches: ai, chatgpt, artificial intelligence, machine learning)

#### Method B: Raw Word Extraction (Universal Fallback)
Extracts **ANY word 3+ characters** that isn't a common word (the, and, etc.)

**Example:** *"No more kardashian drama please"*
**Extracted Words:** `kardashian`, `drama`, `please` ← Not in predefined list, still tracked!

**This means it works for:**
- ✅ Standard topics (Technology, Politics, etc.)
- ✅ Custom topics you create
- ✅ Specific people, companies, or events
- ✅ Niche subtopics we didn't anticipate

### 2. Content Analysis (Every Article, Every Topic)
On your next fetch, **every article in ANY topic** is scanned for these keywords in:
- Article title
- Article description

The system doesn't care what topic you're fetching - it always applies your content preferences!

### 3. Smart Scoring
Articles are scored based on content matches:

| Match Type | Score | Impact |
|------------|-------|--------|
| Contains **disliked** keyword | -60 per keyword | Strong filter |
| Contains **liked** keyword | +40 per keyword | Strong boost |
| Disliked source (topic-specific) | -30 | Moderate filter |
| Liked source (topic-specific) | +30 | Moderate boost |
| Disliked source (general) | -15 | Weak filter |
| Liked source (general) | +15 | Weak boost |

Articles with **score < -40** are filtered out (except 10% for diversity).

## Example Scenarios

### Scenario 1: Technology Without AI
**User Action:**
- Fetches Technology topic
- Thumbs down on Technology
- Comment: *"Too much AI, prefer hardware and smartphones"*

**System Response:**
```
💬 Analyzing comments for content preferences
   ❌ Keywords: ai, hardware, smartphone
🚫 Content AVOIDED: ai
🎯 Content WANTED: hardware, smartphone
```

**Next Technology Fetch:**
```
🚫 Filtering: "New ChatGPT Features..." (matches 1 disliked keywords)
🚫 Filtering: "AI Breakthrough in..." (matches 1 disliked keywords)
✨ Boosting: "iPhone 16 Hardware Review..." (matches 1 liked keywords)
✨ Boosting: "Samsung Smartphone Launch..." (matches 1 liked keywords)
🎯 Content-filtered 15 articles matching unwanted keywords
```

**Result:** Technology articles about hardware/smartphones, minimal AI content.

### Scenario 2: Entertainment Focus
**User Action:**
- Fetches Entertainment topic
- Thumbs up on Entertainment
- Comment: *"Love movie and film news, not interested in reality TV"*

**System Response:**
```
✅ Keywords: movie, film, reality tv
🎯 Content WANTED: movie, film
🚫 Content AVOIDED: reality tv
```

**Next Entertainment Fetch:**
```
✨ Boosting: "New Marvel Film Announced..." (matches 1 liked keywords)
✨ Boosting: "Cannes Film Festival..." (matches 1 liked keywords)
🚫 Filtering: "Reality TV Show Ratings..." (matches 1 disliked keywords)
```

**Result:** More movie/film content, less reality TV.

### Scenario 3: Specific Business Interests
**User Action:**
- Fetches Business topic
- Thumbs up
- Comment: *"Interested in startups and venture capital, not stock market"*

**System Response:**
```
🎯 Content WANTED: startup, venture capital
🚫 Content AVOIDED: stock market
```

**Result:** Business articles focused on startups/VC, filtered stock market news.

## Recognized Concepts - ALL TOPICS

The system recognizes common subtopics across **every topic category**:

### Technology
- **AI**: ai, artificial intelligence, machine learning, chatgpt, gpt, llm
- **Crypto**: crypto, cryptocurrency, bitcoin, ethereum, blockchain, nft
- **Gaming**: gaming, games, xbox, playstation, nintendo, esports
- **Smartphones**: smartphone, iphone, android, mobile phone, samsung
- **Social Media**: social media, facebook, twitter, instagram, tiktok
- **Space**: space, spacex, nasa, rocket, mars, satellite
- **EVs**: electric vehicle, ev, tesla, electric car
- **VR/AR**: vr, virtual reality, ar, augmented reality, metaverse
- **Security**: security, hack, breach, cyber, privacy

### Politics
- **Elections**: election, voting, ballot, polls, campaign
- **Congress**: congress, senate, house, legislation, bill
- **President**: president, white house, executive order
- **Courts**: court, supreme court, judge, ruling, justice
- **Immigration**: immigration, border, visa, refugee
- **Healthcare**: healthcare, obamacare, insurance, medicaid
- **Foreign Policy**: foreign policy, diplomacy, international

### Sports
- **Football**: football, nfl, super bowl, quarterback
- **Basketball**: basketball, nba, playoffs, championship
- **Baseball**: baseball, mlb, world series
- **Soccer**: soccer, fifa, world cup, premier league
- **Hockey**: hockey, nhl, stanley cup
- **Olympics**: olympics, olympic games
- **Tennis**: tennis, wimbledon, us open
- **Golf**: golf, pga, masters

### Entertainment
- **Movies**: movie, film, cinema, box office, hollywood
- **TV Shows**: tv show, television, series, streaming, netflix
- **Music**: music, album, concert, spotify, grammy
- **Celebrity**: celebrity, actor, actress, star
- **Awards**: awards, oscar, emmy, golden globe
- **Reality TV**: reality tv, reality show

### Business
- **Stocks**: stock, stock market, nasdaq, dow jones, earnings
- **Startups**: startup, venture capital, vc, funding, seed round
- **Mergers**: merger, acquisition, buyout, takeover
- **Economy**: economy, economic, gdp, inflation, recession
- **Real Estate**: real estate, housing, mortgage, property

### Health/Science
- **COVID**: covid, coronavirus, pandemic, vaccine
- **Medical**: medical, health, disease, treatment, clinical
- **Climate**: climate, global warming, carbon, emissions
- **Research**: research, study, scientific, laboratory

### General
- **Crime**: crime, criminal, police, arrest, investigation
- **Weather**: weather, storm, hurricane, flood
- **Local**: local, community, neighborhood, city

### ⚡ Custom Keywords & Unknown Topics

**Any word 3+ characters is automatically tracked**, even if not in the list above!

**Examples:**
- *"No Elon Musk drama"* → Tracks: `elon`, `musk`, `drama`
- *"More robotics coverage"* → Tracks: `robotics`
- *"Skip kardashian news"* → Tracks: `kardashian`
- *"Want macroeconomics analysis"* → Tracks: `macroeconomics`, `analysis`

**This means:**
✅ Works for custom topics you create
✅ Catches company names (Apple, Microsoft, Tesla)
✅ Catches people's names (Biden, Messi, Taylor Swift)
✅ Catches any specific terminology you use
✅ No configuration needed - just comment naturally!

## Backend Logs

Watch your backend terminal for personalization in action:

```bash
🎯 [PERSONALIZATION] Prioritizing 50 articles for user you@email.com
   💬 Analyzing 2 comments for content preferences
      ❌ Keywords: ai, chatgpt, machine learning
      ✅ Keywords: space, rocket, spacex
   🚫 Content AVOIDED: ai, chatgpt, machine learning
   🎯 Content WANTED: space, rocket, spacex
   
   🚫 Filtering: "ChatGPT-5 Announcement..." (matches 1 disliked)
   🚫 Filtering: "AI Regulation Update..." (matches 1 disliked)
   ✨ Boosting: "SpaceX Starship Launch..." (matches 2 liked)
   ✨ Boosting: "NASA Mars Mission..." (matches 1 liked)
   
   🔄 Result: 43 articles (40 kept, 3 diversity, 7 filtered)
   🎯 Content-filtered 7 articles matching unwanted keywords
```

## Key Features

### ✅ Precision Filtering
- Filters **specific subtopics** within broader categories
- Example: Technology (yes) → AI within Technology (no)

### ✅ Multi-Keyword Support
- Multiple likes: Boost all matching content
- Multiple dislikes: Filter all matching content

### ✅ Accumulative Learning
- Each comment adds more keywords
- Last 20 comments per topic tracked
- Builds comprehensive preference profile

### ✅ Smart Scoring
- Content keywords weighted **higher** than sources
- Strong penalties for unwanted content (-60)
- Good rewards for wanted content (+40)

### ✅ Diversity Protection
- 10% of filtered articles kept
- Prevents complete filter bubbles
- Ensures content variety

## Tips for Best Results

### Be Specific
❌ *"Don't like this"*
✅ *"Too much AI coverage, prefer robotics"*

### Use Clear Keywords
❌ *"Less of that thing"*
✅ *"No cryptocurrency or blockchain news"*

### Mention What You Want
❌ *"Don't want politics in tech"*
✅ *"Want more space exploration, less politics"*

### Multiple Preferences
✅ *"Love electric vehicles and renewable energy, skip social media drama"*

## Privacy & Data

- Comments analyzed **locally** on server
- Keywords stored **per user** in database
- No third-party AI services used
- Delete account = delete all preferences
- Keywords extracted using simple pattern matching

## Future Enhancements

### Short Term
- [ ] Show users their extracted keywords in settings
- [ ] Allow manual keyword management
- [ ] Sentiment analysis for better context understanding

### Medium Term
- [ ] Entity recognition (companies, people, places)
- [ ] Topic clustering (group related keywords)
- [ ] Feedback on filtered content ("Show AI this time?")

### Long Term
- [ ] ML-based content classification
- [ ] Automatic subtopic discovery
- [ ] Cross-topic pattern recognition
- [ ] Explainable recommendations ("Showing this because...")

## Technical Implementation

### Keyword Extraction
```javascript
// From comment: "Love space news, no crypto"
extractKeywords("Love space news, no crypto")
// Returns: ['space', 'crypto']
```

### Article Scoring
```javascript
// Article: "SpaceX Launches New Satellite"
// Liked keywords: ['space']
// Score: +40 (keyword match) + source scores
```

### Content Filtering
```javascript
// Filter threshold: -40
// Articles below -40 removed (except 10% diversity)
```

## Examples

### Example 1: Filtering AI from Technology
```
Comment: "No more AI or machine learning"
Keywords: ai, machine learning

Next fetch filters:
- "ChatGPT Update" ❌
- "Machine Learning Breakthrough" ❌  
- "New iPhone Release" ✅
- "Gaming Console Launch" ✅
```

### Example 2: Focusing on Space
```
Comment: "More space exploration, SpaceX, and NASA"
Keywords: space, spacex, nasa

Next fetch boosts:
- "SpaceX Starship Test" ✨✨
- "NASA Mars Rover Update" ✨
- "SpaceX Satellite Launch" ✨✨
- "Tech Stock Update" → (neutral)
```

### Example 3: Politics Without Elections
```
Comment: "Want foreign policy and congress news, skip election coverage"
Keywords (liked): foreign policy, congress
Keywords (disliked): election

Next Politics fetch:
- "Senate Passes Bill..." ✨
- "US Diplomacy in Asia..." ✨
- "Election Poll Results..." ❌
- "Campaign Rally Today..." ❌
```

### Example 4: Sports - Just Basketball
```
Comment: "Love basketball, not interested in football or baseball"
Keywords (liked): basketball
Keywords (disliked): football, baseball

Next Sports fetch:
- "NBA Finals Game 7..." ✨
- "NFL Draft Picks..." ❌
- "MLB World Series..." ❌
- "Lakers Trade News..." ✨
```

### Example 5: Entertainment - Movies Only
```
Comment: "More movie and film coverage, skip reality TV and celebrity gossip"
Keywords (liked): movie, film
Keywords (disliked): reality tv, celebrity

Next Entertainment fetch:
- "New Marvel Movie..." ✨✨
- "Cannes Film Festival..." ✨✨
- "Kardashian Reality Show..." ❌
- "Celebrity Breakup News..." ❌
```

### Example 6: Custom Topic - No Specific Person
```
Comment: "Like Tesla news but tired of Elon Musk drama"
Keywords (liked): tesla
Keywords (disliked): elon, musk

Next fetch:
- "Tesla Model Y Review..." ✨
- "Tesla Factory Opens..." ✨
- "Elon Musk Tweet Controversy..." ❌❌
- "Musk Company SpaceX..." ❌
```

## How It Handles Unknown/Custom Topics

### Question: What if I create a custom topic like "Renewable Energy"?

**Answer:** It works perfectly! Here's how:

1. **You create custom topic:** "Renewable Energy"
2. **You comment:** *"More solar and wind power, less nuclear and coal"*
3. **System extracts:** `solar`, `wind`, `power`, `nuclear`, `coal`
4. **Next fetch:** Articles about solar/wind are boosted, nuclear/coal filtered

**The system doesn't need to "know" about Renewable Energy as a topic** - it just filters based on the words you use!

### Question: What about very specific niches?

**Example: Custom topic "Formula 1"**

**Comment:** *"Want ferrari and redbull news, skip mercedes drama"*
**Extracted:** `ferrari`, `redbull`, `mercedes`, `drama`

**Next fetch:**
- "Ferrari Wins Race" ✨
- "RedBull Strategy..." ✨
- "Mercedes Team Drama..." ❌❌

### Question: What if it's a person or company name?

**Works perfectly!**

**Comment:** *"Like Warren Buffett insights, tired of Musk tweets"*
**Extracted:** `warren`, `buffett`, `insights`, `musk`, `tweets`

**Result:** More Buffett articles, fewer Musk articles.

### Universal = No Configuration Needed

The system **doesn't need to be taught** about:
- Your custom topics
- Specific companies
- Individual people
- Niche interests
- New trends

**It just extracts the words you use and filters based on those words.** Simple but powerful! 🎯

## Testing Your Preferences

1. **Leave specific comments** with clear keywords (works for ANY topic!)
2. **Check backend logs** during next fetch
3. **Verify filtering**: Look for `🚫 Filtering` and `✨ Boosting` logs
4. **Try custom topics**: Create your own topics and comment on them
5. **Refine over time**: Add more comments to improve accuracy

The more you use it, the better it gets at understanding your preferences! 🎯

