import React, { useState } from "react";

const topics = ["technology", "sports", "health", "business", "entertainment"];

export default function App() {
  const [summary, setSummary] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const handleClick = async (topic) => {
    setLoading(true);
    setSummary("");
    setAudioUrl("");
    try {
      const res = await fetch("http://localhost:4000/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
      });
      const data = await res.json();
      if (data.summary) {
        setSummary(data.summary);
      }
      if (data.audioUrl) {
        setAudioUrl(data.audioUrl);
      }
    } catch (err) {
      setSummary("Error fetching summary.");
    }
    setLoading(false);
  };

  return (
    <div style={{ fontFamily: "Arial, sans-serif", maxWidth: 600, margin: "auto", padding: 20 }}>
      <h1>Mini Podcast Generator</h1>
      <p>Click a topic to get a short podcast summary:</p>
      <div style={{ marginBottom: 20 }}>
        {topics.map((topic) => (
          <button
            key={topic}
            onClick={() => handleClick(topic)}
            disabled={loading}
            style={{ marginRight: 10, padding: "8px 16px", cursor: "pointer" }}
          >
            {topic}
          </button>
        ))}
      </div>
      {loading && <p>Loading summary...</p>}
      {summary && (
        <>
          <h3>Summary:</h3>
          <p>{summary}</p>
        </>
      )}
      {audioUrl && (
        <audio controls style={{ marginTop: 20, width: "100%" }}>
          <source src={audioUrl} type="audio/mpeg" />
          Your browser does not support the audio element.
        </audio>
      )}
    </div>
  );
}
