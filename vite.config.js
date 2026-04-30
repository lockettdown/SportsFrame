import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        app: resolve(__dirname, "index.html"),
        landing: resolve(__dirname, "landing.html")
      }
    }
  }
});
