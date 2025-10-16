# Project: News Podcast App

This repository contains a minimal full-stack implementation: a React frontend and an Express backend.

Structure (single file doc shows each file):

--- package.json (root) ---
{
  "name": "news-podcast-app",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "start": "node server/index.js",
    "server": "node server/index.js",
    "client": "cd client && npm run dev",
    "dev": "concurrently \"npm:server\" \"npm:client\""
  },
  "dependencies": {
    "axios": "^1.4.0",
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "body-parser": "^1.20.2",
    "form-data": "^4.0.0"
  },
  "devDependencies": {
    "concurrently": "^8.2.0"
  }
}

--- server/index.js ---
// Simple Express backend. It exposes two endpoints:
// GET  /api/news?topic=...   -> returns list of recent articles (title + url + snippet)
// POST /api/generate         -> body: { topic }
//                                server will fetch recent news, ask OpenAI to summarize,
//                                then (optionally) call ElevenLabs or OpenAI TTS to return audio

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');
const FormData = require('form-data');

require('dotenv').config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 4000;

// Environment variables expected:
// NEWSAPI_KEY - (optional) key for NewsAPI.org or other news provider
// OPENAI_API_KEY - OpenAI API key for summarization
// ELEVENLABS_API_KEY - (optional) for higher-quality TTS
// ELEVENLABS_VOICE_ID - (optional) voice id

// Helper: fetch recent articles using NewsAPI.org (simple fallback)
async function fetchArticles(topic) {
  const apiKey = process.env.NEWSAPI_KEY;
  if (!apiKey) {
    // If no API key provided, return a helpful error that the frontend can surface
    throw new Error('NEWSAPI_KEY is not configured on the server.');
  }

  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(topic)}&language=en&pageSize=8&sortBy=publishedAt&apiKey=${apiKey}`;
  const res = await axios.get(url);
  return res.data.articles.map(a => ({ title: a.title, url: a.url, source: a.source.name, publishedAt: a.publishedAt, description: a.description || '' }));
}

// Helper: ask OpenAI to summarize an array of article snippets
async function summarizeWithOpenAI(topic, articles) {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) throw new Error('OPENAI_API_KEY not configured.');

  const systemPrompt = `You are a concise news summarizer. Given a list of recent articles (title, source, publishedAt, description/url), produce a plain 3-paragraph summary (3-5 sentences per paragraph) that explains the main developments in the topic and mentions the most relevant sources. Keep the tone neutral and podcast-friendly.`;

  const userPrompt = `Topic: ${topic}\nArticles:\n${articles.map((a, i) => `${i+1}) ${a.title} — ${a.source} (${a.publishedAt})\n${a.description}\n${a.url}`).join('\n\n')}`;

  const payload = {
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    max_tokens: 700,
    temperature: 0.2
  };

  const res = await axios.post('https://api.openai.com/v1/chat/completions', payload, {
    headers: { Authorization: `Bearer ${openaiKey}` }
  });

  const summary = res.data.choices?.[0]?.message?.content?.trim();
  return summary;
}

// Helper: synthesize text to audio using ElevenLabs (preferred if key present) or fallback to an external TTS
async function ttsElevenLabs(text) {
  const key = process.env.ELEVENLABS_API_KEY;
  const voice = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'; // default voice id placeholder
  if (!key) throw new Error('ELEVENLABS_API_KEY not configured.');

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voice}`;
  const res = await axios.post(url, { text }, {
    responseType: 'arraybuffer',
    headers: {
      'xi-api-key': key,
      'Content-Type': 'application/json'
    }
  });

  return res.data; // Buffer
}

app.get('/api/news', async (req, res) => {
  try {
    const topic = req.query.topic || 'world';
    const articles = await fetchArticles(topic);
    res.json({ ok: true, articles });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/generate', async (req, res) => {
  try {
    const { topic } = req.body;
    if (!topic) return res.status(400).json({ ok: false, error: 'Missing topic' });

    const articles = await fetchArticles(topic);
    const summary = await summarizeWithOpenAI(topic, articles);

    // Try TTS: prefer ElevenLabs if key present
    let audioBuffer = null;
    try {
      if (process.env.ELEVENLABS_API_KEY) {
        audioBuffer = await ttsElevenLabs(summary);
        res.setHeader('Content-Type', 'audio/mpeg');
        return res.send(Buffer.from(audioBuffer));
      }
    } catch (ttsErr) {
      console.warn('ElevenLabs TTS failed:', ttsErr.message);
    }

    // Fallback: return summary text and let the frontend play browser TTS
    res.json({ ok: true, summary, fallbackTTS: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

--- client/package.json ---
{
  "name": "client",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "react": "18.2.0",
    "react-dom": "18.2.0",
    "vite": "5.0.0"
  },
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}

--- client/index.html ---
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>News Podcast</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>

--- client/src/main.jsx ---
import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')).render(<App />)

--- client/src/index.css ---
/* minimal tailwind-like feel by using simple CSS to keep this example self-contained */
body { font-family: Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; margin:0; background:#f6f7fb }
.container { max-width:900px; margin:36px auto; padding:16px }
.card { background:white; border-radius:12px; padding:18px; box-shadow: 0 6px 18px rgba(30,30,60,0.06) }
.buttons { display:flex; flex-wrap:wrap; gap:8px; margin-top:12px }
.btn { padding:10px 14px; border-radius:10px; border: none; background:#1f2937; color:white; cursor:pointer }
.btn.secondary { background:#efefef; color:#111 }
.summary { margin-top:14px; white-space:pre-wrap }

--- client/src/App.jsx ---
import React, { useState } from 'react'

const TOPICS = ['World', 'Technology', 'Business', 'Science', 'Sports', 'Entertainment', 'Health', 'Politics']

export default function App(){
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState(null)
  const [audioUrl, setAudioUrl] = useState(null)
  const [error, setError] = useState(null)

  async function handleTopic(t){
    setLoading(true); setSummary(null); setAudioUrl(null); setError(null)
    try{
      const res = await fetch(`/api/generate`, {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ topic: t })
      })

      const contentType = res.headers.get('content-type') || ''
      if (contentType.includes('audio')){
        // got audio stream
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        setAudioUrl(url)
      } else {
        const data = await res.json()
        if (!data.ok) throw new Error(data.error || 'Unknown')
        setSummary(data.summary)
        if (data.fallbackTTS){
          // Use browser SpeechSynthesis as fallback
          speakText(data.summary)
        }
      }
    }catch(err){
      console.error(err)
      setError(err.message)
    } finally { setLoading(false) }
  }

  function speakText(text){
    if (!window.speechSynthesis) return
    const u = new SpeechSynthesisUtterance(text)
    u.rate = 1
    u.pitch = 1
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(u)
  }

  return (
    <div className="container">
      <div className="card">
        <h1>News Podcast — Click a topic</h1>
        <p>Pick a topic and the app will fetch recent articles, summarize them with AI, and produce a short podcast-style audio.</p>

        <div className="buttons">
          {TOPICS.map(t => (
            <button key={t} className="btn" onClick={()=>handleTopic(t)} disabled={loading}>{t}</button>
          ))}
        </div>

        {loading && <p style={{marginTop:12}}>Working... fetching and summarizing.</p>}
        {error && <p style={{marginTop:12, color:'crimson'}}>Error: {error}</p>}

        {summary && (
          <div className="summary card" style={{marginTop:12}}>
            <h3>Summary</h3>
            <div>{summary}</div>
            <div style={{marginTop:8}}>
              <button className="btn secondary" onClick={()=>speakText(summary)}>Play (browser TTS)</button>
            </div>
          </div>
        )}

        {audioUrl && (
          <div style={{marginTop:14}}>
            <audio src={audioUrl} controls />
          </div>
        )}

      </div>
    </div>
  )
}

--- README.md ---
# News Podcast App

## What this does
- Frontend (React): shows topic buttons. Sends topic to backend.
- Backend (Express): fetches recent news (NewsAPI.org), asks OpenAI to summarize, optionally calls ElevenLabs for TTS and returns an MP3 audio stream. If TTS not configured, returns the text summary and the frontend plays the browser TTS.

## Required keys (set as environment variables)
- OPENAI_API_KEY
- NEWSAPI_KEY (signup at https://newsapi.org — free tier available with limits)
- ELEVENLABS_API_KEY (optional; required if you want server-side, high-quality audio). You'll also want an ELEVENLABS_VOICE_ID.

## Run locally
1. Create a `.env` file in `server/` with the variables above.
2. `npm install` in the root, and `cd client && npm install`.
3. `npm run dev` from project root to run both server and client concurrently.

## Deploy
- Backend: any Node host (Render, Heroku, Fly, DigitalOcean). Set env vars there and point frontend at the deployed backend base URL.
- Frontend: static site host (Vercel, Netlify). Or deploy both together (Render supports full apps).


---

# End of file
