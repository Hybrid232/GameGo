const cardGrid = document.getElementById("card-grid");
const catalogStatus = document.getElementById("catalog-status");
const cardTemplate = document.getElementById("game-card-template");
const gameModal = document.getElementById("game-modal");
const filterForm = document.getElementById("filter-form");
const prevPageBtn = document.getElementById("prev-page");
const nextPageBtn = document.getElementById("next-page");

const PLACEHOLDER_IMAGE = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7";

const state = {
  page: 1,
  filters: { search: "", genres: "", platform: "", ordering: "" },
};

async function loadGames() {
  catalogStatus.textContent = "Loading games...";
  prevPageBtn.disabled = true;
  nextPageBtn.disabled = true;

  const params = new URLSearchParams({ page: state.page });
  for (const [key, value] of Object.entries(state.filters)) {
    if (value) params.set(key, value);
  }

  try {
    const response = await fetch(`/api/games?${params}`);
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    const data = await response.json();

    if (!data.results.length) {
      cardGrid.innerHTML = "";
      catalogStatus.textContent = "No games found. Try different filters.";
      return;
    }

    renderCards(data.results);
    catalogStatus.textContent = `Showing ${data.results.length} of ${data.count} games (source: ${data.source}).`;
    prevPageBtn.disabled = !data.hasPrev;
    nextPageBtn.disabled = !data.hasNext;
  } catch (error) {
    console.error(error);
    catalogStatus.textContent = "Couldn't load games right now. Please try again later.";
  }
}

function renderCards(games) {
  cardGrid.innerHTML = "";

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
  }
}

async function openGameModal(gameId) {
  gameModal.querySelector('[data-field="title"]').textContent = "Loading...";
  gameModal.querySelector('[data-field="description"]').textContent = "";
  gameModal.querySelector('[data-field="screenshots"]').innerHTML = "";
  gameModal.showModal();

  try {
    const response = await fetch(`/api/games/${gameId}`);
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    const game = await response.json();
    populateModal(game);
  } catch (error) {
    console.error(error);
    gameModal.querySelector('[data-field="title"]').textContent = "Couldn't load details";
    gameModal.querySelector('[data-field="description"]').textContent =
      "Something went wrong loading this game. Please close this and try again.";
  }
}

function populateModal(game) {
  const image = gameModal.querySelector('[data-field="image"]');
  image.src = game.image || PLACEHOLDER_IMAGE;
  image.alt = game.title;

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
    gallery.appendChild(img);
  }
}

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
