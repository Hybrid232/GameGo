import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  base: "/GameGo/",
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        cart: resolve(import.meta.dirname, "cart.html"),
      },
    },
  },
});
