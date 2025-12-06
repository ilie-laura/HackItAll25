// server.js
// Backend AI shopping agent: primeste un query (ex: "tricou rosu local")
// -> cauta pe web (DuckDuckGo) -> trimite linkurile la Llama (Groq)
// -> Llama alege magazinele relevante si le clasifica local / lant mare
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import Groq from "groq-sdk";

const app = express();
app.use(cors());
app.use(express.json());
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Servește automat index.html + restul fișierelor
app.use(express.static(__dirname));

// pune cheia ta Groq in env:  export GROQ_API_KEY=....
const client = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// ----- helper: cautare web simpla pe DuckDuckGo (HTML scrape) -----
async function duckSearch(query) {
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const html = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0"
    }
  }).then(r => r.text());

  // ia primele 10 rezultate
  const regex = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]*)"/g;
  const results = [];
  let m;
  while ((m = regex.exec(html)) !== null && results.length < 10) {
    const href = decodeURIComponent(m[1]);
    results.push(href);
  }
  return results;
}

// ----- endpoint principal: /api/find-product -----
app.post("/api/find-product", async (req, res) => {
  try {
    const { query } = req.body;
    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "Lipseste 'query' in body" });
    }

    // 1) cauta pe web
    const rawLinks = await duckSearch(query);

    // 2) lasa AI-ul sa curateze linkurile
    const completion = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `
Esti un agent AI de shopping pentru utilizatori din Romania.

Primesti:
- "query": intentia utilizatorului (ex: "tricou rosu 100% bumbac local")
- "results": lista de URL-uri gasite pe web.

Sarcini:
1. Pastreaza DOAR link-urile unde pare ca utilizatorul poate cumpara produsul (magazine online, pagini de produs, marketplace-uri).
2. Pentru fiecare rezultat:
   - "name": nume scurt al magazinului / brandului (ex: "EtnoWear", "eMAG fashion")
   - "url": linkul original
   - "type":
       - "local"  → brand mic / atelier / magazin romanesc, site independent
       - "chain"  → lant mare (Amazon, Shein, Zara, H&M, eMAG mare etc.)
       - "unknown" → nu poti spune
   - "reason": de ce l-ai clasificat asa

3. Daca vezi in query expresii de genul "nu vreau X" sau "fara X",
   nu include linkuri care par sa fie acel brand X.

Raspunde STRICT JSON, fara text in plus, in format:

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
            results: rawLinks
          })
        }
      ]
    });

    const text = completion.choices[0].message.content;
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      // fallback minimal daca modelul nu respecta 100% formatul
      parsed = { query, results: [] };
    }

    res.json(parsed);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Eroare la AI agent", details: String(err) });
  }
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log("AI shopping agent running on http://localhost:" + PORT );
});
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});
