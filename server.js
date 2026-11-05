import express from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const RAWG_API_KEY = process.env.RAWG_API_KEY;
const RAWG_BASE_URL = "https://api.rawg.io/api";

// Serve index.html, styles/, images/, and the browser-side scripts/ folder.
app.use(express.static("."));

// Browser calls THIS endpoint instead of RAWG directly, so the API key
// never has to be visible in main.js.
app.get("/api/games", async (req, res) => {
  const params = new URLSearchParams({ key: RAWG_API_KEY, ...req.query });

  try {
    const rawgResponse = await fetch(`${RAWG_BASE_URL}/games?${params}`);
    const data = await rawgResponse.json();
    res.json(data);
  } catch (error) {
    res.status(502).json({ error: "Could not reach RAWG API." });
  }
});

app.listen(PORT, () => {
  console.log(`GameGo server running at http://localhost:${PORT}`);
});
