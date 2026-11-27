import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const certDir = fileURLToPath(new URL('./certs/', import.meta.url))
const keyPath = path.join(certDir, 'localhost-key.pem')
const certPath = path.join(certDir, 'localhost-cert.pem')
// Local HTTPS certs are optional (they are gitignored). Without them the dev
// server falls back to plain HTTP instead of crashing every build.
const httpsConfig = fs.existsSync(keyPath) && fs.existsSync(certPath)
  ? { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }
  : undefined

// e.g. "2026-10-01 14:32" in Malawi time, shown at the bottom of More.
const appBuild = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Africa/Blantyre', dateStyle: 'short', timeStyle: 'short',
}).format(new Date())

export default defineConfig({
  define: { __APP_BUILD__: JSON.stringify(appBuild) },
  plugins: [react(), VitePWA({
    registerType: 'prompt',
    injectRegister: false,
    includeAssets: ['apple-touch-icon.png'],
    manifest: {
      id: '/',
      start_url: '/',
      scope: '/',
      name: 'Ekhaya FC',
      short_name: 'Ekhaya FC',
      description: 'The official Ekhaya FC supporters app.',
      theme_color: '#FBFAF6',
      background_color: '#FBFAF6',
      display: 'standalone',
      orientation: 'portrait',
      icons: [
        { src: '/pwa-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/pwa-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/pwa-icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      // Keep the first download small for fans on mobile data: only modern
      // woff2 fonts in latin scripts, and only the Ekhaya crest from the
      // opponent logo folder (opponent logos are only used by the admin importer).
      globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest,woff2}'],
      globIgnores: [
        '**/node_modules/**',
        'team-logos/!(ekhaya-fc).png',
        'downloads/**',
        // The alerts worker is registered separately and must never be cached.
        'firebase-messaging-sw.js',
        // Sponsor logos scroll in a decorative band; load from network, not
        // the offline precache, to keep the first download small.
        'sponsors/**',
        'assets/*-{cyrillic,cyrillic-ext,greek,greek-ext,vietnamese,latin-ext}-*',
      ],
      navigateFallback: 'index.html',
      navigateFallbackDenylist: [/^\/__\//, /^\/\.netlify\/functions\//, /firestore\.googleapis\.com/, /^\/(privacy|terms|delete-account|yt)\.html/],
      cleanupOutdatedCaches: true,
      // A new deploy takes over open tabs immediately instead of waiting for
      // every tab to close; PwaUpdateNotice then reloads onto it.
      skipWaiting: true,
      clientsClaim: true,
    },
  })],
  base: './',
  build: {
    // Libraries go in their own files, so a new deploy only changes the small
    // app files: fans re-download ~100 KB instead of ~1 MB after each update.
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'vendor-react', test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/, priority: 3 },
            { name: 'vendor-firebase', test: /node_modules[\\/](@firebase[\\/](app|auth|firestore|util|component|logger|webchannel-wrapper)|firebase[\\/](app|auth|firestore)|re2js)[\\/]/, priority: 2 },
          ],
        },
      },
    },
    chunkSizeWarningLimit: 900,
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    https: httpsConfig,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    https: httpsConfig,
  },
})
