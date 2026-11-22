const cardGrid = document.getElementById("card-grid");
const catalogStatus = document.getElementById("catalog-status");
const cardTemplate = document.getElementById("game-card-template");
const gameModal = document.getElementById("game-modal");
const filterForm = document.getElementById("filter-form");
const prevPageBtn = document.getElementById("prev-page");
const nextPageBtn = document.getElementById("next-page");

const PLACEHOLDER_IMAGE = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7";

// GitHub Pages only serves static files, so there's no server here to hide
// this key or proxy the request — it calls RAWG straight from the browser.
// RAWG allows that (it sends Access-Control-Allow-Origin: *), but it does
// mean this key ends up visible in the built page source. Vite inlines it
// from .env (VITE_RAWG_API_KEY) at build time so it's out of source control.
const RAWG_API_KEY = import.meta.env.VITE_RAWG_API_KEY;
const RAWG_BASE_URL = "https://api.rawg.io/api";
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

function isExplicitContent(game) {
  if (EXPLICIT_CONTENT_ESRB_SLUGS.has(game.esrb_rating?.slug)) return true;
  return (game.tags || []).some((tag) => EXPLICIT_CONTENT_TAG_SLUGS.has(tag.slug));
}

// RAWG is a review/database site, not a store, so it has no price data.
// Without a backend we can't cross-reference Steam for it either (Steam's
// API blocks direct browser calls), so price always shows as "N/A" now.
function normalizeGame(game) {
  return {
    id: game.id,
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

const state = {
  page: 1,
  filters: { search: "", genres: "", platform: "", ordering: "" },
};

async function loadGames() {
  catalogStatus.textContent = "Loading games...";
  prevPageBtn.disabled = true;
  nextPageBtn.disabled = true;

  const params = new URLSearchParams({
    key: RAWG_API_KEY,
    page: state.page,
    page_size: PAGE_SIZE,
  });
  if (state.filters.search) params.set("search", state.filters.search);
  if (RAWG_GENRE_SLUGS[state.filters.genres.toLowerCase()]) {
    params.set("genres", RAWG_GENRE_SLUGS[state.filters.genres.toLowerCase()]);
  }
  if (RAWG_PLATFORM_IDS[state.filters.platform.toLowerCase()]) {
    params.set("platforms", RAWG_PLATFORM_IDS[state.filters.platform.toLowerCase()]);
  }
  if (state.filters.ordering) params.set("ordering", state.filters.ordering);

  try {
    const response = await fetch(`${RAWG_BASE_URL}/games?${params}`);
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    const data = await response.json();

    const games = (data.results || []).filter((game) => !isExplicitContent(game)).map(normalizeGame);

    if (!games.length) {
      cardGrid.innerHTML = "";
      catalogStatus.textContent = "No games found. Try different filters.";
      prevPageBtn.disabled = state.page <= 1;
      nextPageBtn.disabled = !data.next;
      return;
    }

    renderCards(games);
    catalogStatus.textContent = `Showing ${games.length} of ${data.count} games.`;
    prevPageBtn.disabled = !data.previous;
    nextPageBtn.disabled = !data.next;
  } catch (error) {
    console.error(error);
    catalogStatus.textContent = "Couldn't load games right now. Please try again later.";
  }
}

// ---------- Fade cards in as they scroll into view ----------
// The observer watches each card and tells us when it enters the screen.
// Then we add the "visible" class, which plays the fade-in in home.css.
const cardObserver = new IntersectionObserver(function (entries) {
  entries.forEach(function (entry) {
    if (entry.isIntersecting) {
      entry.target.classList.add("visible");
      cardObserver.unobserve(entry.target); // only fade in once
    }
  });
}, { threshold: 0.15 }); // 15% of the card has to be showing

function renderCards(games) {
  cardGrid.innerHTML = "";
  cardObserver.disconnect(); // stop watching the old page of cards

  for (const game of games) {
    const card = cardTemplate.content.cloneNode(true);
    const article = card.querySelector(".game-card");
    article.dataset.gameId = game.id;

    const image = article.querySelector('[data-field="image"]');
    image.src = game.image || PLACEHOLDER_IMAGE;
    image.alt = game.title;

    article.querySelector('[data-field="title"]').textContent = game.title;
    article.querySelector('[data-field="genres"]').textContent = game.genres.join(", ") || "—";
    article.querySelector('[data-field="platforms"]').textContent = game.platforms.join(", ") || "—";
    article.querySelector('[data-field="rating"]').textContent = game.rating ? `${game.rating} / 5` : "N/A";
    article.querySelector('[data-field="price"]').textContent = game.price || "N/A";

    article.querySelector(".card-open-btn").addEventListener("click", () => openGameModal(game.id));

    cardGrid.appendChild(card);
    cardObserver.observe(article); // fade it in when it scrolls into view
  }
}

async function openGameModal(gameId) {
  gameModal.querySelector('[data-field="title"]').textContent = "Loading...";
  gameModal.querySelector('[data-field="description"]').textContent = "";
  gameModal.querySelector('[data-field="screenshots"]').innerHTML = "";
  carouselImages = []; // clear the last game's pictures while this one loads
  showCarouselImage(0);
  gameModal.showModal();

  try {
    const [detailRes, shotsRes] = await Promise.all([
      fetch(`${RAWG_BASE_URL}/games/${gameId}?key=${RAWG_API_KEY}`),
      fetch(`${RAWG_BASE_URL}/games/${gameId}/screenshots?key=${RAWG_API_KEY}`),
    ]);
    if (!detailRes.ok) throw new Error(`Request failed: ${detailRes.status}`);
    const game = await detailRes.json();
    if (isExplicitContent(game)) throw new Error("This game is not available.");
    const shotsData = shotsRes.ok ? await shotsRes.json() : { results: [] };

    populateModal({
      ...normalizeGame(game),
      developers: (game.developers || []).map((d) => d.name),
      publishers: (game.publishers || []).map((p) => p.name),
      description: game.description_raw || "",
      website: game.website || "",
      screenshots: (shotsData.results || []).map((s) => s.image),
    });
  } catch (error) {
    console.error(error);
    gameModal.querySelector('[data-field="title"]').textContent = "Couldn't load details";
    gameModal.querySelector('[data-field="description"]').textContent =
      "Something went wrong loading this game. Please close this and try again.";
  }
}

function populateModal(game) {
  // Carousel list: the cover image first, then every screenshot.
  // (RAWG's first screenshot is often the cover again, so skip repeats.)
  carouselImages = [];
  if (game.image) carouselImages.push(game.image);
  for (const shot of game.screenshots || []) {
    if (!carouselImages.includes(shot)) carouselImages.push(shot);
  }
  carouselTitle = game.title;
  showCarouselImage(0);
  startSlideshow(); // start sliding through the pictures

  gameModal.querySelector('[data-field="title"]').textContent = game.title;
  gameModal.querySelector('[data-field="price"]').textContent = game.price || "N/A";
  gameModal.querySelector('[data-field="released"]').textContent = game.released || "Unknown";
  gameModal.querySelector('[data-field="rating"]').textContent = game.rating ? `${game.rating} / 5` : "N/A";
  gameModal.querySelector('[data-field="metacritic"]').textContent = game.metacritic ?? "N/A";
  gameModal.querySelector('[data-field="esrb"]').textContent = game.esrb || "Not Rated";
  gameModal.querySelector('[data-field="genres"]').textContent = game.genres.join(", ") || "—";
  gameModal.querySelector('[data-field="platforms"]').textContent = game.platforms.join(", ") || "—";
  gameModal.querySelector('[data-field="developers"]').textContent = game.developers?.join(", ") || "Unknown";
  gameModal.querySelector('[data-field="publishers"]').textContent = game.publishers?.join(", ") || "Unknown";
  gameModal.querySelector('[data-field="description"]').textContent = game.description || "No description available.";

  const websiteLink = gameModal.querySelector('[data-field="website"]');
  websiteLink.href = game.website || "#";
  websiteLink.style.display = game.website ? "" : "none";

  const gallery = gameModal.querySelector('[data-field="screenshots"]');
  gallery.innerHTML = "";
  for (const shot of game.screenshots || []) {
    const img = document.createElement("img");
    img.src = shot;
    img.alt = `${game.title} screenshot`;
    // clicking a thumbnail opens that picture in the big image viewer
    img.addEventListener("click", function () {
      openImageViewer(carouselImages.indexOf(shot));
    });
    gallery.appendChild(img);
  }
}

// ---------- Modal image carousel ----------
const carouselImage = gameModal.querySelector(".modal-image");
const carouselPrevBtn = gameModal.querySelector(".carousel-prev");
const carouselNextBtn = gameModal.querySelector(".carousel-next");
const carouselCount = gameModal.querySelector(".carousel-count");

let carouselImages = []; // every image url for the open game
let carouselIndex = 0;   // which image is showing right now
let carouselTitle = "";  // game title, used for the alt text

// Shows the image at "index". Going past the end wraps back to the start
// (and going before the start wraps to the end).
function showCarouselImage(index) {
  const total = carouselImages.length;

  // no images yet (still loading, or the game has none)
  if (total === 0) {
    carouselImage.src = PLACEHOLDER_IMAGE;
    carouselImage.alt = "";
    carouselCount.textContent = "";
    carouselPrevBtn.hidden = true;
    carouselNextBtn.hidden = true;
    return;
  }

  // wrap around: -1 becomes the last image, total becomes 0
  carouselIndex = (index + total) % total;

  carouselImage.src = carouselImages[carouselIndex];
  carouselImage.alt = `${carouselTitle} image ${carouselIndex + 1} of ${total}`;
  carouselCount.textContent = `${carouselIndex + 1} / ${total}`;

  // replay the slide-in animation (same trick as jingleCart)
  carouselImage.classList.remove("slide-in");
  void carouselImage.offsetWidth;
  carouselImage.classList.add("slide-in");

  // arrows only make sense when there is more than one image
  carouselPrevBtn.hidden = total < 2;
  carouselNextBtn.hidden = total < 2;
}

// ---------- Slideshow: move to the next image every 2 seconds ----------
const SLIDE_DELAY = 2000; // 2 seconds
let slideshowTimer = null;

function startSlideshow() {
  stopSlideshow(); // never run two timers at once
  if (carouselImages.length < 2) return;
  slideshowTimer = setInterval(function () {
    showCarouselImage(carouselIndex + 1);
  }, SLIDE_DELAY);
}

function stopSlideshow() {
  clearInterval(slideshowTimer);
  slideshowTimer = null;
}

// the arrows restart the timer so the picture doesn't change right after a click
carouselPrevBtn.addEventListener("click", function () {
  showCarouselImage(carouselIndex - 1);
  startSlideshow();
});

carouselNextBtn.addEventListener("click", function () {
  showCarouselImage(carouselIndex + 1);
  startSlideshow();
});

// clicking the big image opens it in the full-size viewer
carouselImage.addEventListener("click", function () {
  if (carouselImages.length > 0) openImageViewer(carouselIndex);
});

// stop the slideshow when the game modal closes
gameModal.addEventListener("close", stopSlideshow);

// ---------- Full-size image viewer (a second modal) ----------
const imageViewer = document.getElementById("image-viewer");
const viewerImage = imageViewer.querySelector(".viewer-image");
const viewerPrevBtn = imageViewer.querySelector(".viewer-prev");
const viewerNextBtn = imageViewer.querySelector(".viewer-next");
const viewerCount = imageViewer.querySelector(".viewer-count");

let viewerIndex = 0; // which picture the viewer is showing

// Shows picture number "index" in the viewer (wraps around like the carousel)
function showViewerImage(index) {
  const total = carouselImages.length;
  viewerIndex = (index + total) % total;

  viewerImage.src = carouselImages[viewerIndex];
  viewerImage.alt = `${carouselTitle} image ${viewerIndex + 1} of ${total}`;
  viewerCount.textContent = `${viewerIndex + 1} / ${total}`;

  viewerPrevBtn.hidden = total < 2;
  viewerNextBtn.hidden = total < 2;
}

function openImageViewer(index) {
  stopSlideshow(); // pause the small slideshow behind it
  showViewerImage(index);
  imageViewer.showModal();
}

// when the viewer closes, the game modal picks up from the same picture
imageViewer.addEventListener("close", function () {
  showCarouselImage(viewerIndex);
  startSlideshow();
});

viewerPrevBtn.addEventListener("click", function () {
  showViewerImage(viewerIndex - 1);
});

viewerNextBtn.addEventListener("click", function () {
  showViewerImage(viewerIndex + 1);
});

// clicking the picture goes to the next one
viewerImage.addEventListener("click", function () {
  showViewerImage(viewerIndex + 1);
});

// left / right arrow keys
imageViewer.addEventListener("keydown", function (event) {
  if (event.key === "ArrowLeft") showViewerImage(viewerIndex - 1);
  if (event.key === "ArrowRight") showViewerImage(viewerIndex + 1);
});

// Mouse wheel / trackpad scroll. One scroll fires lots of "wheel" events,
// so after changing pictures we ignore the wheel for a short moment.
let wheelPaused = false;

imageViewer.addEventListener("wheel", function (event) {
  event.preventDefault(); // don't scroll the page behind
  if (wheelPaused) return;

  if (event.deltaY > 0 || event.deltaX > 0) {
    showViewerImage(viewerIndex + 1); // scrolling down = next
  } else {
    showViewerImage(viewerIndex - 1); // scrolling up = previous
  }

  wheelPaused = true;
  setTimeout(function () {
    wheelPaused = false;
  }, 400);
});

// ---------- Close a modal by clicking outside it ----------
// Clicks on the dark backdrop count as clicks on the <dialog> itself, so we
// check if the mouse was outside the dialog's box before closing it.
// Both the game modal and the image viewer use this.
function closeOnOutsideClick(dialog) {
  dialog.addEventListener("click", function (event) {
    if (event.target !== dialog) return; // clicked something inside the card

    const box = dialog.getBoundingClientRect();
    const clickedOutside =
      event.clientX < box.left || event.clientX > box.right ||
      event.clientY < box.top || event.clientY > box.bottom;

    if (clickedOutside) {
      dialog.close();
    }
  });
}

closeOnOutsideClick(gameModal);
closeOnOutsideClick(imageViewer);

filterForm.addEventListener("submit", (event) => {
  event.preventDefault();
  state.filters.search = document.getElementById("search-input").value.trim();
  state.filters.genres = document.getElementById("genre-select").value;
  state.filters.platform = document.getElementById("platform-select").value;
  state.filters.ordering = document.getElementById("sort-select").value;
  state.page = 1;
  loadGames();
});

filterForm.addEventListener("reset", () => {
  state.filters = { search: "", genres: "", platform: "", ordering: "" };
  state.page = 1;
  setTimeout(loadGames, 0);
});

prevPageBtn.addEventListener("click", () => {
  if (state.page > 1) {
    state.page -= 1;
    loadGames();
  }
});

nextPageBtn.addEventListener("click", () => {
  state.page += 1;
  loadGames();
});

// Makes every cart icon in the header and the floating button jingle.
function jingleCart() {
  const cartLinks = document.querySelectorAll(".cart-link");

  cartLinks.forEach(function (link) {
    // remove the class first so the animation can play again
    link.classList.remove("jingle");
    void link.offsetWidth; // forces the browser to restart the animation
    link.classList.add("jingle");
  });
}

// The game cards are added later from the template, so we listen on the
// whole page and check if the click was on an "Add to Cart" button.
document.addEventListener("click", function (event) {
  const button = event.target.closest('[data-action="add-to-cart"]');

  if (button) {
    // TODO: save the game to the cart in localStorage here
    jingleCart();
  }
});

loadGames();
