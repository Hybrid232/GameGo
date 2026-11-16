import express from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const RAWG_API_KEY = process.env.RAWG_API_KEY;
const RAWG_BASE_URL = "https://api.rawg.io/api";
const RAWG_TIMEOUT_MS = 5000;

const STEAM_STORE_URL = "https://store.steampowered.com/api/appdetails";
const STEAM_TIMEOUT_MS = 6000;

const PAGE_SIZE = 12;

// RAWG's query params want genre slugs and numeric platform ids, not the
// plain labels the <select> elements use. This maps one to the other.
const RAWG_GENRE_SLUGS = {
  action: "action",
  adventure: "adventure",
  rpg: "role-playing-games-rpg",
  strategy: "strategy",
  simulation: "simulation",
  sports: "sports",
  casual: "casual",
};

const RAWG_PLATFORM_IDS = {
  windows: 4,
  mac: 5,
  linux: 6,
};

// Steam's storefront API has no search/genre/filter/pagination support at all —
// it only returns full details for one app id at a time. So when RAWG is down,
// this fixed list of well-known app ids stands in for "the catalog", and we
// filter/sort/paginate it ourselves after fetching each one.
const STEAM_FALLBACK_APP_IDS = [
  730, 440, 570, 105600, 413150, 892970, 1145360, 945360, 646570, 504230,
  367520, 620, 252490, 218620,
];

// RAWG has no price data of its own (it's a review/database site, not a
// store), but its per-game "stores" endpoint lists links to where the game
// is sold — including Steam. store_id 1 is Steam (confirmed via /api/stores).
const RAWG_STEAM_STORE_ID = 1;
const PRICE_LOOKUP_TIMEOUT_MS = 4000;

// Content filter: we don't want to surface explicit/pornographic games in
// the catalog. RAWG tags every game (including in list results, no extra
// call needed), so we block on its own "adults-only" ESRB rating plus a
// tag blocklist. Deliberately NOT included: "nudity", "sexual-content",
// "sex", and bare "adult" — spot-checking RAWG's own tag data showed these
// flag plenty of mainstream, non-pornographic games too (Cyberpunk 2077 and
// The Witcher 3 both carry "nudity"/"sexual-content"; Saints Row: The Third
// carries "sex"). The slugs below were checked the same way and only turned
// up actual adult-content titles.
const EXPLICIT_CONTENT_ESRB_SLUGS = new Set(["adults-only"]);
const EXPLICIT_CONTENT_TAG_SLUGS = new Set([
  "nsfw", "hentai", "hentai-game", "adult-game", "erotic", "porn", "porn-game", "sex-game",
]);

function isRawgExplicitContent(game) {
  if (EXPLICIT_CONTENT_ESRB_SLUGS.has(game.esrb_rating?.slug)) return true;
  return (game.tags || []).some((tag) => EXPLICIT_CONTENT_TAG_SLUGS.has(tag.slug));
}

// Steamworks content descriptor 5 is literally "Adult Only Sexual Content" —
// the one flag meant to mark this exact category, so it's what we check.
const STEAM_EXPLICIT_CONTENT_DESCRIPTOR_ID = 5;

function isSteamExplicitContent(data) {
  return (data.content_descriptors?.ids || []).includes(STEAM_EXPLICIT_CONTENT_DESCRIPTOR_ID);
}

app.use(express.static("."));

async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function normalizeRawgGame(game) {
  return {
    id: `rawg-${game.id}`,
    title: game.name,
    image: game.background_image || null,
    genres: (game.genres || []).map((g) => g.name),
    platforms: (game.platforms || []).map((p) => p.platform.name),
    rating: game.rating || null,
    released: game.released || null,
    metacritic: game.metacritic ?? null,
    esrb: game.esrb_rating?.name || "Not Rated",
    price: null,
  };
}

async function fetchRawgDetail(rawgId) {
  const detailRes = await fetchWithTimeout(
    `${RAWG_BASE_URL}/games/${rawgId}?key=${RAWG_API_KEY}`,
    RAWG_TIMEOUT_MS
  );
  if (!detailRes.ok) throw new Error(`RAWG detail request failed (${detailRes.status})`);
  const game = await detailRes.json();
  if (isRawgExplicitContent(game)) throw new Error("This game is not available.");

  const shotsRes = await fetchWithTimeout(
    `${RAWG_BASE_URL}/games/${rawgId}/screenshots?key=${RAWG_API_KEY}`,
    RAWG_TIMEOUT_MS
  );
  const shotsData = shotsRes.ok ? await shotsRes.json() : { results: [] };

  const detail = {
    ...normalizeRawgGame(game),
    developers: (game.developers || []).map((d) => d.name),
    publishers: (game.publishers || []).map((p) => p.name),
    description: game.description_raw || "",
    website: game.website || "",
    screenshots: (shotsData.results || []).map((s) => s.image),
  };

  return attachSteamPrice(detail, rawgId);
}

function normalizeSteamGame(data) {
  const platforms = data.platforms || {};
  return {
    id: `steam-${data.steam_appid}`,
    title: data.name,
    image: data.header_image || null,
    genres: (data.genres || []).map((g) => g.description),
    platforms: Object.keys(platforms).filter((key) => platforms[key]),
    rating: data.metacritic ? Math.round((data.metacritic.score / 20) * 10) / 10 : null,
    released: data.release_date?.date || null,
    metacritic: data.metacritic?.score ?? null,
    esrb: data.required_age > 0 ? `${data.required_age}+` : "Not Rated",
    price: data.is_free ? "Free" : data.price_overview?.final_formatted || "N/A",
    developers: data.developers || [],
    publishers: data.publishers || [],
    description: data.short_description || "",
    website: data.website || "",
    screenshots: (data.screenshots || []).map((s) => s.path_full),
  };
}

async function getSteamAppIdFromRawgStores(rawgId) {
  const res = await fetchWithTimeout(
    `${RAWG_BASE_URL}/games/${rawgId}/stores?key=${RAWG_API_KEY}`,
    PRICE_LOOKUP_TIMEOUT_MS
  );
  if (!res.ok) return null;
  const data = await res.json();
  const steamEntry = (data.results || []).find((entry) => entry.store_id === RAWG_STEAM_STORE_ID);
  if (!steamEntry) return null;
  const match = steamEntry.url.match(/\/app\/(\d+)/);
  return match ? match[1] : null;
}

// Looks up a RAWG game's Steam listing (if any) and borrows its price.
// Swallows every failure itself — a RAWG game just keeps price: null if
// anything here doesn't pan out, same as before this existed.
async function attachSteamPrice(game, rawgId) {
  try {
    const appid = await getSteamAppIdFromRawgStores(rawgId);
    if (!appid) return game;
    const steamGame = await fetchSteamGame(appid);
    if (!steamGame) return game;
    return { ...game, price: steamGame.price };
  } catch (error) {
    return game;
  }
}

async function fetchSteamGame(appid) {
  const params = new URLSearchParams({ appids: appid, cc: "us", l: "en" });
  const res = await fetchWithTimeout(`${STEAM_STORE_URL}?${params}`, STEAM_TIMEOUT_MS);
  if (!res.ok) return null;
  const payload = await res.json();
  const entry = payload[appid];
  if (!entry?.success) return null;
  if (isSteamExplicitContent(entry.data)) return null;
  return normalizeSteamGame(entry.data);
}

async function getSteamFallbackCatalog({ search, genre, platform, ordering }) {
  const settled = await Promise.all(
    STEAM_FALLBACK_APP_IDS.map((id) => fetchSteamGame(id).catch(() => null))
  );
  let games = settled.filter(Boolean);

  if (search) {
    const term = search.toLowerCase();
    games = games.filter((g) => g.title.toLowerCase().includes(term));
  }
  if (genre) {
    games = games.filter((g) => g.genres.some((name) => name.toLowerCase() === genre.toLowerCase()));
  }
  if (platform) {
    games = games.filter((g) => g.platforms.includes(platform.toLowerCase()));
  }

  const sorters = {
    "-rating": (a, b) => (b.rating || 0) - (a.rating || 0),
    "-released": (a, b) => new Date(b.released || 0) - new Date(a.released || 0),
    name: (a, b) => a.title.localeCompare(b.title),
    "-metacritic": (a, b) => (b.metacritic || 0) - (a.metacritic || 0),
  };
  if (ordering && sorters[ordering]) games.sort(sorters[ordering]);

  return games;
}

// Catalog list — tries RAWG first, falls back to the curated Steam list if
// RAWG is unreachable or errors out.
app.get("/api/games", async (req, res) => {
  const { search = "", genres = "", platform = "", ordering = "", page = "1" } = req.query;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);

  try {
    const params = new URLSearchParams({
      key: RAWG_API_KEY,
      page: pageNum,
      page_size: PAGE_SIZE,
    });
    if (search) params.set("search", search);
    if (RAWG_GENRE_SLUGS[genres.toLowerCase()]) {
      params.set("genres", RAWG_GENRE_SLUGS[genres.toLowerCase()]);
    }
    if (RAWG_PLATFORM_IDS[platform.toLowerCase()]) {
      params.set("platforms", RAWG_PLATFORM_IDS[platform.toLowerCase()]);
    }
    if (ordering) params.set("ordering", ordering);

    const rawgRes = await fetchWithTimeout(`${RAWG_BASE_URL}/games?${params}`, RAWG_TIMEOUT_MS);
    if (!rawgRes.ok) throw new Error(`RAWG responded with ${rawgRes.status}`);

    const data = await rawgRes.json();
    const rawResults = (data.results || []).filter((game) => !isRawgExplicitContent(game));
    const results = await Promise.all(
      rawResults.map((game) => attachSteamPrice(normalizeRawgGame(game), game.id))
    );

    return res.json({
      source: "rawg",
      count: data.count,
      page: pageNum,
      hasNext: Boolean(data.next),
      hasPrev: Boolean(data.previous),
      results,
    });
  } catch (error) {
    console.error("RAWG unavailable, falling back to Steam:", error.message);
  }

  try {
    const all = await getSteamFallbackCatalog({ search, genre: genres, platform, ordering });
    const start = (pageNum - 1) * PAGE_SIZE;
    const pageItems = all.slice(start, start + PAGE_SIZE);

    return res.json({
      source: "steam",
      count: all.length,
      page: pageNum,
      hasNext: start + PAGE_SIZE < all.length,
      hasPrev: pageNum > 1,
      results: pageItems,
    });
  } catch (error) {
    return res.status(502).json({ error: "Both RAWG and Steam are unreachable right now." });
  }
});

// Game detail — the id's prefix (set by normalizeRawgGame/normalizeSteamGame
// above) says which API it came from, so we always ask the right one back.
app.get("/api/games/:id", async (req, res) => {
  const [sourcePrefix, sourceId] = req.params.id.split("-");

  try {
    if (sourcePrefix === "rawg") {
      return res.json(await fetchRawgDetail(sourceId));
    }

    if (sourcePrefix === "steam") {
      const game = await fetchSteamGame(sourceId);
      if (!game) throw new Error("No details found for that game.");
      return res.json(game);
    }

    return res.status(400).json({ error: "Unrecognized game id." });
  } catch (error) {
    console.error(`Detail lookup failed for ${req.params.id}:`, error.message);
    res.status(502).json({ error: "Could not load details for that game." });
  }
});

app.listen(PORT, () => {
  console.log(`GameGo server running at http://localhost:${PORT}`);
});
