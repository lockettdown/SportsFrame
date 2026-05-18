import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        landing: resolve(__dirname, "index.html"),
        legacyLanding: resolve(__dirname, "landing.html"),
        app: resolve(__dirname, "app.html")
      }
    }
  }
});
