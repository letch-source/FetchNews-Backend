// index.js
import express from "express";
import cors from "cors";
import path from "path";
import fetch from "node-fetch"; // npm i node-fetch
import bodyParser from "body-parser";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors({ origin: true }));
app.use(bodyParser.json({ limit: "1mb" }));

// ---- Your real TTS implementation goes here ----
// For now we proxy a known-good MP3 so we can verify playback end-to-end.
async function handleTTS(text, res) {
  try {
    // TODO: replace this with your true TTS call to e.g. OpenAI/ElevenLabs/etc.
    // Must ultimately give you an MP3 stream or buffer.
    const demo = await fetch(
      "https://file-examples.com/storage/fef4e8f6f2f3c6b6c3a6f0e/2017/11/file_example_MP3_700KB.mp3"
    );
    if (!demo.ok) throw new Error(`Upstream MP3 failed: ${demo.status}`);

    // Good headers for browsers
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Accept-Ranges", "bytes");
    res.status(200);

    // Stream to client
    demo.body.pipe(res);
  } catch (err) {
    console.error("TTS error:", err);
    res.status(500).json({ error: "TTS generation failed" });
  }
}

// ---- BOTH ROUTES: GET and POST point to the same handler ----
app.get("/api/tts", async (req, res) => {
  const text = (req.query.text || "Hello from GET").toString();
  await handleTTS(text, res);
});

app.post("/api/tts", async (req, res) => {
  const text =
    (req.body && typeof req.body.text === "string" && req.body.text) ||
    "Hello from POST";
  await handleTTS(text, res);
});

// ---- (Optional) other API routes here ----

// ---- Static + SPA fallback (place AFTER API routes) ----
const buildDir = path.join(__dirname, "build");
app.use(express.static(buildDir));
app.get("*", (_, res) => {
  res.sendFile(path.join(buildDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
