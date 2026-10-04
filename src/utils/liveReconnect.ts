// Phones pause the app's live database connection while the screen is off or
// the app is in the background. On a weak mobile network the database can take
// a minute or more to notice the old connection is dead, so changes made by the
// club appear late. This forces a fresh connection the moment the fan comes
// back, so new scores, news and edits show within a second or two.
import { disableNetwork, enableNetwork } from 'firebase/firestore'
import { db } from '../firebase'

const AWAY_MS = 10_000
const MIN_GAP_MS = 5_000

let hiddenAt = 0
let lastReconnect = 0
let busy = false

async function reconnect() {
  if (busy || Date.now() - lastReconnect < MIN_GAP_MS || !navigator.onLine) return
  busy = true
  lastReconnect = Date.now()
  try {
    // Saved changes waiting to upload are kept and sent after reconnecting.
    await disableNetwork(db)
    await enableNetwork(db)
  } catch {
    await enableNetwork(db).catch(() => undefined)
  } finally {
    busy = false
  }
}

export function startLiveReconnect() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return }
    if (hiddenAt && Date.now() - hiddenAt > AWAY_MS) void reconnect()
    hiddenAt = 0
  })
  // Back from airplane mode, a dead spot or switching between Wi-Fi and data.
  window.addEventListener('online', () => { void reconnect() })
  // Page restored from the browser's back/forward memory.
  window.addEventListener('pageshow', (event) => { if (event.persisted) void reconnect() })
}
