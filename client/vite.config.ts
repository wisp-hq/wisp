import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type PluginOption } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// In dev: open http://localhost:8080 (the Go launcher), NOT :5173. The launcher
// reverse-proxies SPA + HMR to this Vite server, so Go fronts the whole stack —
// same shape as prod. We can't proxy /s/<id>/websockets through Vite (http-proxy
// drops bridged frames), so going through Go is what makes Selkies sessions work.
//
// CORS lets index.html fetched at :8080 load Vite assets at :5173 during HMR.

export default defineConfig({
  plugins: [
    // Please make sure that '@tanstack/router-plugin' is passed before '@vitejs/plugin-react'
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
    // VitePWA returns a Plugin typed against its own vite copy; bun's isolated
    // install hoists vite under two different paths so tsc sees the resulting
    // type as a different identity than vite's own PluginOption.
    ...(VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'wisp.svg'],
      // The launcher proxies /s/<id>/* to per-session containers (Selkies). Those
      // assets must never be intercepted by the SW or precached.
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/s\//, /^\/api\//, /^\/_\//],
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
      },
      manifest: {
        name: 'wisp',
        short_name: 'wisp',
        description: 'Launch and stream containerised apps from your browser.',
        theme_color: '#0b0b0d',
        background_color: '#0b0b0d',
        display: 'standalone',
        // Tight scope so a PWA installed from "/" never tries to deep-link back into
        // an old /s/<sessionId>/ URL that has long since been cleaned up.
        scope: '/',
        start_url: '/',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }) as PluginOption[]),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    // Vite pre-bundles @tanstack/react-db with its own inlined @tanstack/db, while our
    // app code imports @tanstack/db directly. Without dedupe the two bundles end up
    // with distinct CollectionImpl classes, so `instanceof` checks inside useLiveQuery
    // reject collections built by our code.
    dedupe: ['@tanstack/db'],
  },
  server: {
    port: 5173,
    // HMR WebSocket goes through the Go launcher (:8080), not Vite directly — the
    // browser only knows about :8080. Without this Vite tells the client to dial
    // :5173 and the HMR connection breaks.
    hmr: { clientPort: 8080 },
  },
});
