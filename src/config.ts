// One place for every app setting. Values come from VITE_* build settings
// (the APP_ENV secret on GitHub, or your .env file locally).

export type AppEnvironment = 'production' | 'staging' | 'development'

function detectEnvironment(): AppEnvironment {
  if (import.meta.env.DEV) return 'development'
  // The Android download runs the production build from inside the phone.
  if (typeof window !== 'undefined' && ('cordova' in window || /EkhayaFCApp\//.test(navigator.userAgent))) return 'production'
  const host = typeof window === 'undefined' ? '' : window.location.hostname
  // Firebase preview channels look like ekhaya-fc-app--staging-abc123.web.app
  if (/--staging/i.test(host) || import.meta.env.VITE_APP_ENV === 'staging') return 'staging'
  if (host === 'localhost' || host === '127.0.0.1') return 'development'
  return 'production'
}

export const config = {
  environment: detectEnvironment(),
  build: typeof __APP_BUILD__ === 'string' ? __APP_BUILD__ : 'dev',
  appUrl: 'https://ekhaya-fc-app.web.app/',
  /** Local test copy of the database (npm run emulators); never touches live data. */
  useEmulators: import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === 'true',
  firebase: {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
    appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
  },
} as const

/** Settings that are missing or look wrong (shown on the rescue screen instead of a blank page). */
export function configProblems() {
  const problems: string[] = []
  for (const [key, value] of Object.entries(config.firebase)) if (!value) problems.push(`missing ${key}`)
  if (config.firebase.apiKey && !config.firebase.apiKey.startsWith('AIza')) problems.push('apiKey looks wrong')
  return problems
}
