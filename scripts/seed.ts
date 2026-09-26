import 'dotenv/config'
import { deleteApp, initializeApp } from 'firebase/app'
import { inMemoryPersistence, initializeAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { doc, getDoc, getFirestore, writeBatch } from 'firebase/firestore'
import { fixtures, news } from '../src/sample.ts'

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
}

async function seed() {
  const email = process.env.SEED_EMAIL?.trim().toLowerCase()
  const password = process.env.SEED_PASSWORD
  if (!email || !password) {
    throw new Error('Set SEED_EMAIL and SEED_PASSWORD for an admin or superadmin account before running the seed command.')
  }
  if (Object.values(firebaseConfig).some((value) => !value)) {
    throw new Error('Firebase config is incomplete. Check the root .env file.')
  }

  const app = initializeApp(firebaseConfig)
  const auth = initializeAuth(app, { persistence: inMemoryPersistence })
  const db = getFirestore(app)

  try {
    const credential = await signInWithEmailAndPassword(auth, email, password)
    const userSnapshot = await getDoc(doc(db, 'users', credential.user.uid))
    const role = userSnapshot.data()?.role
    if (role !== 'admin' && role !== 'superadmin') {
      throw new Error('This account does not have admin or superadmin role. No sample data was written.')
    }

    const batch = writeBatch(db)
    for (const fixture of fixtures) {
      batch.set(doc(db, 'fixtures', fixture.id), fixture, { merge: true })
    }
    for (const item of news) {
      batch.set(doc(db, 'news', item.id), item, { merge: true })
    }
    await batch.commit()
    console.log(`Seeded ${fixtures.length} fixtures and ${news.length} news items.`)
  } finally {
    await signOut(auth).catch(() => undefined)
    await deleteApp(app)
  }
}

seed().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown seeding error.'
  console.error(`Seed failed: ${message}`)
  process.exitCode = 1
})