import { defineConfig } from "vite"
import { devtools } from "@tanstack/devtools-vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import { nitro } from "nitro/vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { VitePWA } from "vite-plugin-pwa"

// Nitro public root differs by preset; PWA must emit SW into the same folder.
const nitroPublicDir =
  process.env.VERCEL || process.env.NITRO_PRESET === "vercel"
    ? ".vercel/output/static"
    : ".output/public"

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(),
    tailwindcss(),
    tanstackStart(),
    // Nitro targets Vercel on CI (`VERCEL=1`); local builds use node-server.
    nitro(),
    viteReact(),
    VitePWA({
      // Prompt UI via virtual:pwa-register/react (PwaUpdatePrompt).
      registerType: "prompt",
      injectRegister: false,
      // Default `dist` would 404 the SW once Nitro remaps the public root.
      outDir: nitroPublicDir,
      includeAssets: ["favicon.svg", "icons/apple-touch-icon.png"],
      manifest: {
        name: "Split",
        short_name: "Split",
        description: "Split trip costs. No accounts.",
        theme_color: "#1a1a1a",
        background_color: "#ede4ff",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // SPA shell for deep links (/r/$code, /r/$code/new) while offline.
        navigateFallback: "/",
        // Never serve the HTML shell for API / server-fn style paths.
        navigateFallbackDenylist: [/^\/api\//, /^\/_server/, /^\/__\//],
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        // Writes stay NetworkOnly — TanStack Query owns the offline outbox.
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
})

export default config
