// Hamburger menu for mobile.
// Clicking the button opens or closes the nav list.

const menuBtn = document.getElementById("menu-btn");
const navList = document.getElementById("nav-list");

menuBtn.addEventListener("click", function () {
    navList.classList.toggle("open");

    // tell screen readers if the menu is open or closed
    const isOpen = navList.classList.contains("open");
    menuBtn.setAttribute("aria-expanded", isOpen);
    menuBtn.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
});
