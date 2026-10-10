// Records why someone was signed out without pressing "Sign out", so the login
// page can show the reason (and fans can copy it for the club) instead of
// silently sending them back to sign in.
const KEY = 'ekhaya-signout-report'
const recent: string[] = []
let expectedSignOut = false

function remember(kind: string, value: unknown) {
  let text: string
  if (value instanceof Error) text = `${value.name}: ${value.message}${(value as Error & { code?: string }).code ? ` (${(value as Error & { code?: string }).code})` : ''}`
  else if (typeof value === 'string') text = value
  else { try { text = JSON.stringify(value) } catch { text = String(value) } }
  recent.push(`${new Date().toISOString().slice(11, 19)} ${kind}: ${text.slice(0, 300)}`)
  if (recent.length > 15) recent.shift()
}

/** Keeps the last few warnings and errors (Firebase reports sign-in problems there). */
export function startAuthDiagnostics() {
  for (const level of ['error', 'warn'] as const) {
    const original = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      try { remember(level, args.map((arg) => (arg instanceof Error ? `${arg.message}${(arg as Error & { code?: string }).code ? ` (${(arg as Error & { code?: string }).code})` : ''}` : typeof arg === 'string' ? arg : (() => { try { return JSON.stringify(arg) } catch { return String(arg) } })())).join(' ')) } catch { /* never break logging */ }
      original(...args)
    }
  }
  window.addEventListener('unhandledrejection', (event) => remember('promise', event.reason))
  window.addEventListener('error', (event) => remember('error', event.error ?? event.message))
}

export function noteAuthEvent(text: string) {
  remember('auth', text)
}

/** Call just before a deliberate sign-out (Sign out button, blocked account). */
export function markExpectedSignOut() {
  expectedSignOut = true
}

/** Called when the signed-in user disappears. */
export function recordSignOut(uid: string, email: string | null) {
  if (expectedSignOut) { expectedSignOut = false; return }
  try {
    localStorage.setItem(KEY, JSON.stringify({ at: new Date().toISOString(), uid, email, path: location.hash, online: navigator.onLine, agent: navigator.userAgent.slice(0, 120), events: recent.slice(-10) }))
  } catch { /* storage blocked */ }
}

export type SignOutReport = { at: string; uid: string; email: string | null; path: string; online: boolean; agent: string; events: string[] }

export function readSignOutReport(): SignOutReport | null {
  try {
    const report = JSON.parse(localStorage.getItem(KEY) ?? 'null') as SignOutReport | null
    // Only recent ones matter.
    if (!report || Date.now() - new Date(report.at).getTime() > 30 * 60 * 1000) return null
    return report
  } catch {
    return null
  }
}

export function clearSignOutReport() {
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}
