const RELOAD_KEY = 'ekhaya-reloaded-at'

/** Reloads the page at most once every 30 seconds (so a real fault can never loop). */
export function reloadOnce() {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0)
    if (Date.now() - last < 30000) return false
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch { /* storage blocked: still try once */ }
  window.location.reload()
  return true
}

export function clearReloadGuard() {
  try { sessionStorage.removeItem(RELOAD_KEY) } catch { /* ignore */ }
}

/** A piece of an older app version that is gone after an update (every browser words it differently). */
export function isOldVersionError(message: string) {
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported|ChunkLoadError|Loading chunk|MIME type|Failed to fetch|_result|reading 'default'|\.default\b/i.test(message)
}
