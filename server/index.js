require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const OpenAI = require('openai');  // note default import in CommonJS style

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 4000;

// Create OpenAI client (no args needed; key from process.env.OPENAI_API_KEY)
const openai = new OpenAI();

async function fetchArticles(topic) {
  const apiKey = process.env.NEWSAPI_KEY;
  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(topic)}&pageSize=5&apiKey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('NewsAPI fetch failed');
  const data = await res.json();
  return data.articles || [];
}

async function summarizeWithOpenAI(text) {
  const prompt = `Summarize this news content briefly for a podcast: \n\n${text}`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 200,
    temperature: 0.7,
  });

  return completion.choices[0].message.content.trim();
}

app.post('/api/generate', async (req, res) => {
  try {
    const { topic } = req.body;
    console.log('Received topic:', topic);

    if (!topic) return res.status(400).json({ error: 'Missing topic' });

    const articles = await fetchArticles(topic);
    console.log('Fetched articles:', articles.length);

    if (articles.length === 0) return res.status(404).json({ error: 'No articles found' });

    const combinedText = articles.map(a => a.title + ' — ' + a.description).join('\n\n');
    console.log('Combined text length:', combinedText.length);

    const summary = await summarizeWithOpenAI(combinedText);
    console.log('Summary:', summary);

    res.json({ summary });
  } catch (err) {
    console.error('Error in /api/generate:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

app.use('/audio', express.static(path.join(__dirname, 'audio')));
