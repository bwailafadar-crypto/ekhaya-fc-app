import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    includeAssets: ['apple-touch-icon.png'],
    manifest: {
      name: 'Ekhaya FC',
      short_name: 'Ekhaya FC',
      description: 'The official Ekhaya FC supporters app.',
      theme_color: '#0E0E0E',
      background_color: '#0E0E0E',
      display: 'standalone',
      orientation: 'portrait',
      icons: [
        { src: './pwa-icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: './pwa-icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest,woff,woff2}'],
      navigateFallback: 'index.html',
      navigateFallbackDenylist: [/^\/\.netlify\/functions\//, /firestore\.googleapis\.com/],
      cleanupOutdatedCaches: true,
    },
  })],
  base: './',
})
