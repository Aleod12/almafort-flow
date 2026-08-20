// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

// Внутри Lovable-сборки пресет пинится платформой (LOVABLE_NITRO_PRESET) — не трогаем.
// На своём сервере (VPS Reg.ru) собираем под Node: DEPLOY_TARGET=vps npm run build
// либо NITRO_PRESET=node-server npm run build.
const isLovableBuild = Boolean(process.env["LOVABLE_NITRO_PRESET"]);
const selfHostPreset =
  process.env["NITRO_PRESET"] ||
  (process.env["DEPLOY_TARGET"] === "vps" ? "node-server" : undefined);

export default defineConfig({
  ...(!isLovableBuild && selfHostPreset
    ? { nitro: { preset: selfHostPreset } as const }
    : {}),
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      VitePWA({
        strategies: "generateSW",
        registerType: "autoUpdate",
        injectRegister: null,
        filename: "sw.js",
        // Манифест лежит в public/ и обслуживается как есть.
        manifest: false,
        // Клиентские ассеты собираются в dist/client — SW должен лежать рядом.
        outDir: "dist/client",
        devOptions: { enabled: false },

        workbox: {
          globPatterns: ["**/*.{js,css,woff2,png,svg,webp,ico}"],
          navigateFallback: null,
          navigateFallbackDenylist: [/^\/~oauth/, /^\/api\//],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          runtimeCaching: [
            {
              // HTML — только NetworkFirst: свежая версия важнее офлайна.
              urlPattern: ({ request }: { request: Request }) => request.mode === "navigate",
              handler: "NetworkFirst",
              options: {
                cacheName: "almafort-pages",
                networkTimeoutSeconds: 5,
                expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 },
              },
            },
            {
              urlPattern: ({ request }: { request: Request }) =>
                ["style", "script", "worker", "font"].includes(request.destination),
              handler: "StaleWhileRevalidate",
              options: { cacheName: "almafort-assets" },
            },
            {
              urlPattern: ({ request }: { request: Request }) => request.destination === "image",
              handler: "CacheFirst",
              options: {
                cacheName: "almafort-images",
                expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
          ],
        },
      }),
    ],
  },
});
