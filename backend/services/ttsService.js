/**
 * TTS Service
 * Shared text-to-speech helper using OpenAI.
 * Extracted from index.js so it can be reused by autoFetchSummaries.js
 * and any other job or route that needs audio generation.
 */

const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const { uploadAudioToB2, isB2Configured } = require('../utils/b2Storage');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MEDIA_DIR = path.join(__dirname, '../media');
if (!fs.existsSync(MEDIA_DIR)) {
  try { fs.mkdirSync(MEDIA_DIR, { recursive: true }); } catch {}
}

/**
 * Generate TTS audio for text and return the audio URL.
 * Handles long text by splitting into sentence-level chunks.
 * Uploads to Backblaze B2 if configured, otherwise saves locally.
 *
 * @param {string} text      - The text to convert to speech
 * @param {string} voice     - OpenAI voice (alloy, echo, fable, onyx, nova, shimmer)
 * @param {number} speed     - Playback speed (0.25 – 4.0)
 * @param {string} baseUrl   - Base URL used to construct local audio URLs
 * @returns {Promise<{audioUrl: string}>}
 */
async function generateTTS(text, voice = 'alloy', speed = 1.0, baseUrl = '') {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

  const normalizedVoice = String(voice || 'alloy').toLowerCase();
  const availableVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
  const selectedVoice = availableVoices.includes(normalizedVoice) ? normalizedVoice : 'alloy';

  // Split into chunks to stay within OpenAI's 4096-character limit
  const MAX_CHUNK_SIZE = 4000;
  const textChunks = [];

  if (text.length <= MAX_CHUNK_SIZE) {
    textChunks.push(text);
  } else {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    let currentChunk = '';

    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > MAX_CHUNK_SIZE && currentChunk) {
        textChunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        currentChunk += sentence;
      }
    }

    if (currentChunk) textChunks.push(currentChunk.trim());
  }

  console.log(`🎤 [TTS] Generating audio for ${textChunks.length} chunk(s), voice: ${selectedVoice}, speed: ${speed}`);

  const modelPriority = ['tts-1', 'tts-1-hd'];
  let finalBuffer = null;

  for (let chunkIndex = 0; chunkIndex < textChunks.length; chunkIndex++) {
    const chunk = textChunks[chunkIndex];
    let chunkSpeech = null;
    let lastErr = null;

    for (const model of modelPriority) {
      try {
        chunkSpeech = await openai.audio.speech.create({
          model,
          voice: selectedVoice,
          input: chunk,
          format: 'mp3',
          speed,
        });
        if (chunkSpeech) {
          console.log(`   ✅ Chunk ${chunkIndex + 1}/${textChunks.length} generated with ${model}`);
          break;
        }
      } catch (e) {
        lastErr = e;
        console.warn(`   ⚠️  Chunk ${chunkIndex + 1} failed with ${model}:`, e.message);
      }
    }

    // Fallback to alloy if the chosen voice failed
    if (!chunkSpeech && selectedVoice !== 'alloy') {
      console.log('   🔄 Trying fallback voice: alloy');
      for (const model of modelPriority) {
        try {
          chunkSpeech = await openai.audio.speech.create({
            model,
            voice: 'alloy',
            input: chunk,
            format: 'mp3',
            speed,
          });
          if (chunkSpeech) {
            console.log(`   ✅ Chunk ${chunkIndex + 1} generated with ${model} (fallback voice)`);
            break;
          }
        } catch (e) {
          lastErr = e;
        }
      }
    }

    if (!chunkSpeech) {
      throw lastErr || new Error(`Failed to generate audio for chunk ${chunkIndex + 1}`);
    }

    const chunkBuffer = Buffer.from(await chunkSpeech.arrayBuffer());
    finalBuffer = finalBuffer === null ? chunkBuffer : Buffer.concat([finalBuffer, chunkBuffer]);
  }

  if (!finalBuffer) {
    throw new Error('Failed to generate audio');
  }

  const fileBase = `tts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`;
  let audioUrl;

  if (isB2Configured()) {
    try {
      console.log('   📤 Uploading to Backblaze B2...');
      audioUrl = await uploadAudioToB2(finalBuffer, fileBase);
      console.log('   ✅ Uploaded to B2');
    } catch (b2Error) {
      console.error('   ❌ B2 upload failed, falling back to local storage:', b2Error.message);
      const outPath = path.join(MEDIA_DIR, fileBase);
      fs.writeFileSync(outPath, finalBuffer);
      audioUrl = `${baseUrl}/media/${fileBase}`;
    }
  } else {
    const outPath = path.join(MEDIA_DIR, fileBase);
    fs.writeFileSync(outPath, finalBuffer);
    audioUrl = `${baseUrl}/media/${fileBase}`;
  }

  console.log(`   🎵 Audio URL: ${audioUrl}`);
  return { audioUrl };
}

module.exports = { generateTTS };
