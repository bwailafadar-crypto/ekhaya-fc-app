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
    registerType: 'autoUpdate',
    injectRegister: false,
    includeAssets: ['apple-touch-icon.png'],
    manifest: {
      id: '/',
      start_url: '/',
      scope: '/',
      name: 'Ekhaya FC',
      short_name: 'Ekhaya FC',
      description: 'The official Ekhaya FC supporters app.',
      theme_color: '#0E0E0E',
      background_color: '#0E0E0E',
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
        'assets/*-{cyrillic,cyrillic-ext,greek,greek-ext,vietnamese}-*',
      ],
      navigateFallback: 'index.html',
      navigateFallbackDenylist: [/^\/\.netlify\/functions\//, /firestore\.googleapis\.com/],
      cleanupOutdatedCaches: true,
      // A new deploy takes over open tabs immediately instead of waiting for
      // every tab to close; PwaUpdateNotice then reloads onto it.
      skipWaiting: true,
      clientsClaim: true,
    },
  })],
  base: './',
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
