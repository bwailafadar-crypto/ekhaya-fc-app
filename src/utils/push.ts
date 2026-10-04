import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { deleteToken, getMessaging, getToken, isSupported, onMessage, type Messaging } from 'firebase/messaging'
import { db, firebaseApp } from '../firebase'
import { isAndroidApp } from './appShell'

export type PushPrefs = { match: boolean; news: boolean }
export const DEFAULT_PREFS: PushPrefs = { match: true, news: true }

const TOKEN_KEY = 'ekhaya-push-token'
const PREFS_KEY = 'ekhaya-push-prefs'
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

let messagingPromise: Promise<Messaging | null> | null = null
function messaging() {
  messagingPromise ??= isSupported().then((ok) => (ok ? getMessaging(firebaseApp) : null)).catch(() => null)
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
  if (instance) await deleteToken(instance).catch(() => undefined)
  writeLocal(TOKEN_KEY, null)
}

/** While the app is open, alerts arrive here instead of as a system notification. */
export async function listenForForegroundAlerts(show: (title: string, body: string) => void) {
  if (!savedToken()) return () => undefined
  const instance = await messaging()
  if (!instance) return () => undefined
  return onMessage(instance, (payload) => {
    const title = payload.notification?.title ?? payload.data?.title ?? 'Ekhaya FC'
    const body = payload.notification?.body ?? payload.data?.body ?? ''
    show(title, body)
  })
}
