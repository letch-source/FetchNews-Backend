/**
 * Debug Categorization
 * Tests the categorization with a single article to see what's going wrong
 */

require('dotenv').config();
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function testCategorization() {
  console.log('🔍 Testing Article Categorization\n');
  
  const testArticles = [
    {
      id: 0,
      title: "Apple announces new iPhone with AI features",
      description: "Apple unveiled its latest iPhone model featuring advanced AI capabilities and improved battery life."
    },
    {
      id: 1,
      title: "Stock market reaches all-time high",
      description: "Major indices hit record levels as investors remain optimistic about economic growth."
    }
  ];

  const prompt = `You are a news article categorizer. Categorize each article into one or more of these categories:

CORE CATEGORIES:
- general
- business
- technology
- sports
- entertainment
- health
- science

Rules:
- An article can have multiple categories
- Use "general" for articles that don't fit other categories
- ALWAYS include at least one core category

Articles to categorize:
${testArticles.map(a => `${a.id}. "${a.title}" - ${a.description}`).join('\n\n')}

Return a JSON object with an "articles" array in this exact format:
{
  "articles": [
    { "id": 0, "categories": ["technology", "business"] },
    { "id": 1, "categories": ["health", "science"] }
  ]
}`;

  try {
    console.log('📤 Sending request to OpenAI...\n');
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a news article categorization assistant. Respond only with valid JSON.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 2000,
      response_format: { type: "json_object" }
    });

    const content = response.choices[0].message.content;
    console.log('📥 Raw Response from OpenAI:');
    console.log(content);
    console.log('\n');

    // Try to parse it
    const parsed = JSON.parse(content);
    console.log('📊 Parsed JSON:');
    console.log(JSON.stringify(parsed, null, 2));
    console.log('\n');

    // Try the existing parsing logic
    const result = Array.isArray(parsed) ? parsed : (parsed.articles || parsed.categories || parsed.results || []);
    console.log(`✅ Extracted array length: ${result.length}`);
    console.log('Extracted array:', JSON.stringify(result, null, 2));
    
    if (result.length > 0) {
      console.log('\n🎉 SUCCESS! Categorization is working correctly.');
    } else {
      console.log('\n❌ FAILED! No articles were categorized.');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

testCategorization();

