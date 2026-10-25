const RELOAD_KEY = 'ekhaya-reloaded-at'

/** Reloads the page at most once every 30 seconds (so a real fault can never loop). */
export function reloadOnce() {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0)
    if (Date.now() - last < 30000) return false
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch { /* storage blocked: still try once */ }
  void freshReload()
  return true
}

/**
 * Reload onto the newest version: the offline helper (service worker) may still
 * hold the old app, so it is told to update, its saved copy is cleared, and
 * then the page reloads. Used when a piece of an old version is missing.
 */
export async function freshReload() {
  try {
    const registrations = await navigator.serviceWorker?.getRegistrations?.() ?? []
    await Promise.all(registrations.map(async (registration) => {
      try { await registration.update() } catch { /* offline */ }
      registration.waiting?.postMessage({ type: 'SKIP_WAITING' })
      await registration.unregister()
    }))
    if ('caches' in window) {
      const names = await caches.keys()
      await Promise.all(names.filter((name) => /workbox|precache|ekhaya/i.test(name)).map((name) => caches.delete(name)))
    }
  } catch { /* still reload */ }
  window.location.reload()
}

export function clearReloadGuard() {
  try { sessionStorage.removeItem(RELOAD_KEY) } catch { /* ignore */ }
}

/** A piece of an older app version that is gone after an update (every browser words it differently). */
export function isOldVersionError(message: string) {
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported|ChunkLoadError|Loading chunk|MIME type|Failed to fetch|_result|reading 'default'|\.default\b/i.test(message)
}
