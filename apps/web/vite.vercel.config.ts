import tailwindcss from "@tailwindcss/postcss";
import { createRequire } from "node:module";
import vinext from "vinext";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

const require = createRequire(import.meta.url);
const tailwindStylesheet = require.resolve("tailwindcss/index.css");

// Vinext's native build targets Cloudflare Workers. Vercel runs the same
// application through Nitro so server components and app/api routes remain
// available instead of degrading into a static-only deployment.
export default defineConfig({
  css: {
    postcss: {
      plugins: [tailwindcss()],
    },
  },
  plugins: [
    vinext(),
    nitro({
      output: { dir: "../../.vercel/output" },
      preset: "vercel",
    }),
  ],
  resolve: {
    alias: [{ find: /^tailwindcss$/, replacement: tailwindStylesheet }],
  },
});
