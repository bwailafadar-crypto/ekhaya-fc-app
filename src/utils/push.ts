import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import type { Messaging } from 'firebase/messaging'
import { db, firebaseApp } from '../firebase'
import { isAndroidApp } from './appShell'

export type PushPrefs = { match: boolean; news: boolean }
export const DEFAULT_PREFS: PushPrefs = { match: true, news: true }

const TOKEN_KEY = 'ekhaya-push-token'
const PREFS_KEY = 'ekhaya-push-prefs'
const OFF_KEY = 'ekhaya-push-off'
const ASKED_KEY = 'ekhaya-push-asked-at'
const REFRESHED_KEY = 'ekhaya-push-refreshed-at'
const SW_SCOPE = '/firebase-cloud-messaging-push-scope'
const VAPID_KEY = (import.meta.env.VITE_FIREBASE_VAPID_KEY ?? '').trim()

function readLocal(key: string) {
  try { return localStorage.getItem(key) } catch { return null }
}
function writeLocal(key: string, value: string | null) {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value) } catch { /* storage blocked */ }
}

export function savedToken() {
  return readLocal(TOKEN_KEY)
}

export function savedPrefs(): PushPrefs {
  try { return { ...DEFAULT_PREFS, ...JSON.parse(readLocal(PREFS_KEY) ?? '{}') } } catch { return DEFAULT_PREFS }
}

// The alerts library (about 120 KB) is only downloaded when alerts are used.
const messagingLib = () => import('firebase/messaging')
let messagingPromise: Promise<Messaging | null> | null = null
function messaging() {
  messagingPromise ??= messagingLib()
    .then(async ({ isSupported, getMessaging }) => ((await isSupported()) ? getMessaging(firebaseApp) : null))
    .catch(() => null)
  return messagingPromise
}

export type PushSupport = 'ok' | 'no-key' | 'apk' | 'ios-install' | 'unsupported' | 'blocked'

/** Whether this device can receive alerts, and if not, why. */
export async function pushSupport(): Promise<PushSupport> {
  if (isAndroidApp()) return 'apk'
  if (!VAPID_KEY) return 'no-key'
  const isIos = /iPhone|iPad|iPod/i.test(navigator.userAgent)
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone
  if (isIos && !standalone) return 'ios-install'
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !(await messaging())) return 'unsupported'
  if (Notification.permission === 'denied') return 'blocked'
  return 'ok'
}

async function messagingWorker() {
  // A separate worker just for alerts, so it never interferes with the app's offline worker.
  const config = firebaseApp.options
  const params = new URLSearchParams({
    apiKey: config.apiKey ?? '',
    projectId: config.projectId ?? '',
    messagingSenderId: config.messagingSenderId ?? '',
    appId: config.appId ?? '',
  })
  return navigator.serviceWorker.register(`/firebase-messaging-sw.js?${params}`, { scope: SW_SCOPE })
}

/** Asks permission, registers this device and saves its alert choices. */
export async function enablePush(uid: string, prefs: PushPrefs) {
  const instance = await messaging()
  if (!instance) throw new Error('unsupported')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error(permission === 'denied' ? 'blocked' : 'dismissed')
  const registration = await messagingWorker()
  const { getToken } = await messagingLib()
  const token = await getToken(instance, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration })
  if (!token) throw new Error('no-token')
  const old = savedToken()
  if (old && old !== token) await deleteDoc(doc(db, 'pushTokens', old)).catch(() => undefined)
  await setDoc(doc(db, 'pushTokens', token), {
    uid, token, prefs,
    platform: /Android/i.test(navigator.userAgent) ? 'android' : /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'ios' : 'desktop',
    updatedAt: serverTimestamp(),
  })
  writeLocal(TOKEN_KEY, token)
  writeLocal(PREFS_KEY, JSON.stringify(prefs))
  writeLocal(OFF_KEY, null)
  writeLocal(REFRESHED_KEY, String(Date.now()))
  return token
}

export async function updatePushPrefs(prefs: PushPrefs) {
  const token = savedToken()
  writeLocal(PREFS_KEY, JSON.stringify(prefs))
  if (token) await updateDoc(doc(db, 'pushTokens', token), { prefs, updatedAt: serverTimestamp() })
}

/** Stops alerts on this device. */
export async function disablePush() {
  const token = savedToken()
  if (token) await deleteDoc(doc(db, 'pushTokens', token)).catch(() => undefined)
  const instance = await messaging()
  if (instance) await messagingLib().then(({ deleteToken }) => deleteToken(instance)).catch(() => undefined)
  writeLocal(TOKEN_KEY, null)
  // The fan switched alerts off on purpose: never switch them back on by ourselves.
  writeLocal(OFF_KEY, '1')
}

/** While the app is open, alerts arrive here instead of as a system notification. */
export async function listenForForegroundAlerts(show: (title: string, body: string) => void) {
  if (!savedToken()) return () => undefined
  const instance = await messaging()
  if (!instance) return () => undefined
  const { onMessage } = await messagingLib()
  return onMessage(instance, (payload) => {
    const title = payload.notification?.title ?? payload.data?.title ?? 'Ekhaya FC'
    const body = payload.notification?.body ?? payload.data?.body ?? ''
    show(title, body)
  })
}

const DAY = 24 * 60 * 60 * 1000

/**
 * Runs when a fan opens the app signed in.
 * - Phone already allowed alerts: switch them on (or refresh them) silently.
 * - Never asked / asked over 3 days ago: return 'ask' so the app shows the one-tap card.
 * - The fan turned alerts off, or the phone cannot get them: do nothing.
 */
export async function autoAlerts(uid: string): Promise<'done' | 'ask' | 'skip'> {
  if (readLocal(OFF_KEY)) return 'skip'
  if ((await pushSupport()) !== 'ok') return 'skip'
  if (Notification.permission === 'granted') {
    const fresh = Date.now() - Number(readLocal(REFRESHED_KEY) || 0) < DAY
    if (savedToken() && fresh) return 'done'
    try { await enablePush(uid, savedPrefs()) } catch (error) { console.warn('Alerts were not switched on yet', error) }
    return 'done'
  }
  if (savedToken()) return 'done'
  return Date.now() - Number(readLocal(ASKED_KEY) || 0) > 3 * DAY ? 'ask' : 'skip'
}

/** The fan tapped "Not now": ask again in 3 days. */
export function postponeAlertsPrompt() {
  writeLocal(ASKED_KEY, String(Date.now()))
}
