import { defineConfig } from "vite";

export default defineConfig({
  // GitHub Pages serves this project beneath /Fusion-Bot-Panel/.
  // Relative asset URLs also keep the build usable in preview environments.
  base: "./",
  server: { host: "0.0.0.0" },
  preview: { host: "0.0.0.0" }
});