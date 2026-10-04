// "Seen" time is kept per device. Until it is set, the last 7 days count as new.
const SEEN_KEY = 'ekhaya-admin-users-seen-at'
export const SEEN_EVENT = 'ekhaya-admin-users-seen'
const WEEK = 7 * 24 * 60 * 60 * 1000

export function getUsersSeenAt() {
  try {
    const value = Number(localStorage.getItem(SEEN_KEY))
    if (value > 0) return value
  } catch {
    // Storage blocked (private mode); fall through.
  }
  return Date.now() - WEEK
}

export function markUsersSeen() {
  try { localStorage.setItem(SEEN_KEY, String(Date.now())) } catch { /* ignore */ }
  window.dispatchEvent(new Event(SEEN_EVENT))
}

export async function systemNotify(title: string, body: string) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted' || !document.hidden) return
    const registration = await navigator.serviceWorker?.getRegistration()
    if (registration) await registration.showNotification(title, { body, icon: './pwa-icon-192.png', tag: 'ekhaya-new-fan' })
  } catch {
    // Phone alerts are a bonus; the in-app bell still works.
  }
}

export async function requestPhoneAlerts() {
  if (!('Notification' in window)) return 'unsupported' as const
  return Notification.requestPermission()
}

