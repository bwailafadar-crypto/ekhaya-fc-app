import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, type Firestore } from 'firebase/firestore'

// On Firebase Hosting (web.app / firebaseapp.com) the sign-in helper pages are
// served from the same address as the app, so use that address for sign-in.
// This keeps Google sign-in on the domain the fan already reached, avoiding
// networks that block one of the two Firebase domains.
function pickAuthDomain() {
  const host = typeof window === 'undefined' ? '' : window.location.hostname
  if (host.endsWith('.web.app') || host.endsWith('.firebaseapp.com')) return host
  return import.meta.env.VITE_FIREBASE_AUTH_DOMAIN
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: pickAuthDomain(),
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig)
export const auth = getAuth(firebaseApp)
// Keep a copy of everything fans have seen on the phone, so the app still shows
// fixtures, results, the table, squad and news when the connection drops, and
// sends votes/predictions made offline once it is back. Falls back to the normal
// (memory-only) mode where the browser cannot store data (e.g. private mode).
function createDb(): Firestore {
  try {
    return initializeFirestore(firebaseApp, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    })
  } catch {
    return getFirestore(firebaseApp)
  }
}

export const db = createDb()