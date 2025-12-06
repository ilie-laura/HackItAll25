import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import Groq from "groq-sdk";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Serve frontend files (IMPORTANT)
app.use(express.static(__dirname + "/"));
// DEBUG — vezi dacă cheia există
console.log("Groq key loaded?", process.env.GROQ_API_KEY ? "YES" : "NO");

const client = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// -------- Crawling simplu DuckDuckGo --------
async function duckSearch(query) {
  console.log("Searching duckduckgo for:", query);

  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

  const html = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" }
  }).then(r => r.text());

  const regex = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]*)"/g;
  const results = [];

  let match;
  while ((match = regex.exec(html)) !== null && results.length < 10) {
    results.push(decodeURIComponent(match[1]));
  }

  console.log("Results found:", results);

  return results;
}

// -------- AI Endpoint --------
app.post("/api/find-product", async (req, res) => {
  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({ error: "Missing 'query'" });
    }

    const scrapedLinks = await duckSearch(query);

    console.log("Calling Groq AI...");

    const completion = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `
Tu ești un agent AI care selectează magazine pentru cumpărături din România.

Filtrează link-urile astfel:
- Preferă magazine locale românești
- Exclude branduri mari dacă query-ul conține "nu vreau" / "fara"
- Returnează JSON simplu.

Schema finală:
{
 "query": "...",
 "results": [
    { "name": "...", "url": "...", "type": "local|chain|unknown", "reason": "..." }
  ]
}
`
        },
        {
          role: "user",
          content: JSON.stringify({
            query,
            results: scrapedLinks
          })
        }
      ]
    });

    const aiResponse = completion.choices[0]?.message?.content || "{}";

    console.log("RAW AI Response:", aiResponse);

    let parsed;

    try {
      parsed = JSON.parse(aiResponse);
    } catch (err) {
      console.warn("⚠ AI responded with invalid JSON. Sending fallback.");
      parsed = { query, results: [] };
    }

    res.json(parsed);

  } catch (error) {
    console.error("SERVER ERROR:", error);
    res.status(500).json({
      error: "AI server failed",
      message: error.message,
      stack: error.stack
    });
  }
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log(`AI Agent running → http://localhost:${PORT}`));
