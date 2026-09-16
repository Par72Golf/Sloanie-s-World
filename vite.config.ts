import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// GitHub Pages serves the site under /<repo-name>/, so production assets need
// that prefix. Local dev and `vite preview` stay at the root. Override with
// BASE_PATH=/ to build a root-hosted copy (e.g. for a custom domain).
const base = process.env.BASE_PATH ?? (process.env.GITHUB_ACTIONS ? "/Sloanie-s-World/" : "/");

export default defineConfig({
  base,
  plugins: [tailwindcss(), viteReact()],
  resolve: { tsconfigPaths: true },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 1500,
  },
});
