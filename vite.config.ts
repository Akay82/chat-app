import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { emulatorDefines } from "./emulator-env.ts";
export default defineConfig(({ mode }) => ({
  define: mode === "emulator" ? emulatorDefines() : {},
  plugins: [
    react(),
    tailwind(),
    VitePWA({
      registerType: "prompt",
      devOptions: { enabled: mode !== "emulator" },
      includeAssets: ["icon.svg", "icon-192.png", "icon-512.png"],
      manifest: {
        name: "Gather · A little closer",
        id: "/",
        scope: "/",
        short_name: "Gather",
        description: "Conversations that bring you closer.",
        theme_color: "#236c57",
        background_color: "#f6f7f3",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        importScripts: ["/notification-events.js"],
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        navigateFallbackDenylist: [/^\/api/],
        maximumFileSizeToCacheInBytes: 4000000,
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes("@firebase/firestore")) return "firebase-firestore";
          if (id.includes("@firebase/auth")) return "firebase-auth";
          if (id.includes("@firebase/database")) return "firebase-presence";
          return undefined;
        },
      },
    },
  },
}));
