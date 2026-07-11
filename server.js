// KOSHA BACKEND — single file, zero npm installs needed.
// Run with:  node server.js
// Requires Node.js 18 or newer (for built-in fetch).

import http from "node:http";
import { URL } from "node:url";

// ---- Your Tavily API keys ----
// You can either edit these two lines directly, OR set them as
// environment variables (TAVILY_API_KEY_1 / TAVILY_API_KEY_2) on
// Render — env vars, if present, always win.
const TAVILY_KEYS = [
  process.env.TAVILY_API_KEY_1 || "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",
  process.env.TAVILY_API_KEY_2 || "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"
].filter(Boolean);

let keyPointer = 0;

async function callTavily(query) {
  let lastError = null;

  for (let attempt = 0; attempt < TAVILY_KEYS.length; attempt++) {
    const key = TAVILY_KEYS[keyPointer % TAVILY_KEYS.length];
    keyPointer++;

    try {
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: key,
          query,
          search_depth: "basic",
          max_results: 5,
          include_answer: true
        })
      });

      if (response.status === 429 || response.status === 401) {
        lastError = new Error(`Tavily responded ${response.status}`);
        continue; // try the next key
      }
      if (!response.ok) {
        lastError = new Error(`Tavily responded ${response.status}`);
        continue;
      }
      return await response.json();
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error("All Tavily keys failed");
}

function setCORS(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

const server = http.createServer(async (req, res) => {
  setCORS(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ status: "ok", service: "kosha-backend" }));
  }

  if (url.pathname === "/api/search" && req.method === "GET") {
    const query = (url.searchParams.get("q") || "").trim();

    if (!query) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Missing query param 'q'" }));
    }
    if (TAVILY_KEYS.length === 0) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Server has no Tavily API keys configured" }));
    }

    try {
      const data = await callTavily(query);
      const results = (data.results || []).map(r => ({
        title: r.title,
        url: r.url,
        content: r.content
      }));
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ answer: data.answer || null, results }));
    } catch (err) {
      console.error("Search failed:", err.message);
      res.writeHead(502, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Search failed, try again in a moment" }));
    }
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Kosha backend running on port ${PORT}`);
});
