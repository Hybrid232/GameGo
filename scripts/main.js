// Home page script.

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
