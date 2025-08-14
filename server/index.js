// server.js
const express = require("express");
const cors = require("cors");
const path = require("path");

// Optional: if you serve the React build from the same server in production
const serveClient = process.env.SERVE_CLIENT === "true";
const PORT = process.env.PORT || 5000;

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// ---- Replace this with your real summarization + TTS pipeline ----
async function summarizeText({ topic, text }) {
  // TODO: call your news fetch + summarizer. For now, a tiny fake.
  const t = (text && text.trim()) || "";
  const base = t
    ? "Custom text summary (demo)"
    : `Top headlines in ${topic || "general"} (demo)`;
  return `${base}: a short, human-friendly recap suitable for TTS.`;
}

async function synthesizeAndStore(summary) {
  // TODO: replace with your TTS service & storage.
  // For now, return a known-good public MP3 so the frontend can verify the flow.
  const fallbackMp3 =
    "https://file-examples.com/storage/fef4e8f6f2f3c6b6c3a6f0e/2017/11/file_example_MP3_700KB.mp3";
  return fallbackMp3;
}

// ---- /api/summarize: ALWAYS returns JSON with combined.audioUrl ----
app.post("/api/summarize", async (req, res) => {
  try {
    const { topic, text } = req.body || {};
    if (!topic && !text) {
      return res.status(400).json({ error: "Provide topic or text" });
    }

    const summary = await summarizeText({ topic, text });
    const audioUrl = await synthesizeAndStore(summary);

    return res.status(200).json({
      combined: {
        title: topic ? `Summary: ${topic}` : "Summary",
        summary,
        audioUrl, // <— critical for the frontend
      },
    });
  } catch (err) {
    console.error("summarize error:", err);
    return res
      .status(500)
      .json({ error: "Summarize failed", detail: String(err) });
  }
});

// (Optional) compatibility endpoint if your client ever hits /api/tts directly
app.post("/api/tts", async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text) return res.status(400).json({ error: "Missing text" });

    const audioUrl = await synthesizeAndStore(text);
    return res.status(200).json({ audioUrl });
  } catch (err) {
    console.error("tts error:", err);
    return res.status(500).json({ error: "TTS failed", detail: String(err) });
  }
});

// Make sure API 404s are JSON (prevents HTML pages causing JSON parse errors)
app.use("/api", (req, res) => {
  res.status(404).json({ error: "Not found" });
});

// (Optional) serve React build in production
if (serveClient) {
  const clientBuild = path.join(__dirname, "build");
  app.use(express.static(clientBuild));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientBuild, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
