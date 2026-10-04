// App-wide logging. In development everything goes to the browser console.
// In production, errors are also saved (a few per visit, never duplicates) to
// the clientErrors collection, so admins can see problems fans hit in
// Admin → App health without asking them for screenshots.
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { config } from '../config'

type Level = 'debug' | 'info' | 'warn' | 'error'
const MAX_REPORTS_PER_VISIT = 5
const sent = new Set<string>()
let reports = 0
let currentUid: string | null = null

export function setLogUser(uid: string | null) {
  currentUid = uid
}

function describe(error: unknown) {
  if (error instanceof Error) return { message: error.message, stack: (error.stack ?? '').split('\n').slice(0, 6).join('\n'), code: (error as Error & { code?: string }).code ?? '' }
  if (typeof error === 'string') return { message: error, stack: '', code: '' }
  try { return { message: JSON.stringify(error).slice(0, 300), stack: '', code: '' } } catch { return { message: String(error), stack: '', code: '' } }
}

function write(level: Level, context: string, details: unknown) {
  if (config.environment === 'development' || level === 'error' || level === 'warn') {
    const method = level === 'debug' ? 'log' : level
    console[method](`[${context}]`, details)
  }
}

// Network blips and offline moments are normal on mobile; not worth reporting.
const IGNORE = /network|offline|failed to fetch|load failed|unavailable|deadline-exceeded|quota|ResizeObserver loop|aborted/i

async function report(context: string, error: unknown) {
  if (config.environment === 'development' || !currentUid) return
  const info = describe(error)
  if (IGNORE.test(`${info.code} ${info.message}`)) return
  const key = `${context}|${info.code}|${info.message}`.slice(0, 300)
  if (sent.has(key) || reports >= MAX_REPORTS_PER_VISIT) return
  sent.add(key)
  reports += 1
  try {
    // Lazy import keeps the database out of the logger's start-up cost.
    const { db } = await import('../firebase')
    await addDoc(collection(db, 'clientErrors'), {
      uid: currentUid,
      context: context.slice(0, 60),
      message: info.message.slice(0, 500),
      code: String(info.code).slice(0, 80),
      stack: info.stack.slice(0, 1500),
      path: (window.location.hash || '/').slice(0, 120),
      build: config.build.slice(0, 40),
      env: config.environment,
      agent: navigator.userAgent.slice(0, 160),
      createdAt: serverTimestamp(),
    })
  } catch {
    // Logging must never break the app.
  }
}

export const log = {
  debug: (context: string, details?: unknown) => write('debug', context, details),
  info: (context: string, details?: unknown) => write('info', context, details),
  warn: (context: string, details?: unknown) => write('warn', context, details),
}

export function logError(context: string, error: unknown) {
  write('error', context, error)
  void report(context, error)
}

/** Catches anything that slips through: crashes outside React and failed promises. */
export function installGlobalErrorHandlers() {
  window.addEventListener('error', (event) => {
    // Missing images or scripts are reported by the browser as plain events.
    if (!(event.error instanceof Error)) return
    logError('window', event.error)
  })
  window.addEventListener('unhandledrejection', (event) => logError('promise', event.reason))
}
