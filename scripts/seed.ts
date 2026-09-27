import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import { deleteApp, initializeApp } from 'firebase/app'
import { inMemoryPersistence, initializeAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { doc, getDocFromServer, getFirestore, writeBatch } from 'firebase/firestore'

type SeedDocument = { id: string; [key: string]: unknown }
type ClubData = {
  teams: SeedDocument[]
  standings: SeedDocument[]
  fixtures: SeedDocument[]
  players: SeedDocument[]
}

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
    const rawData = await readFile(new URL('../ekhaya-data.json', import.meta.url), 'utf8')
    const clubData = JSON.parse(rawData) as ClubData
    const collections: Array<[keyof ClubData, SeedDocument[]]> = [
      ['teams', clubData.teams],
      ['standings', clubData.standings],
      ['fixtures', clubData.fixtures],
      ['players', clubData.players],
    ]

    for (const [collectionName, documents] of collections) {
      if (!Array.isArray(documents) || documents.some((item) => !item || typeof item.id !== 'string' || !item.id.trim())) {
        throw new Error(`The ${collectionName} data must be an array of documents with non-empty string ids.`)
      }
      if (new Set(documents.map((item) => item.id)).size !== documents.length) {
        throw new Error(`The ${collectionName} data contains duplicate document ids.`)
      }
    }

    const credential = await signInWithEmailAndPassword(auth, email, password)
    const userSnapshot = await getDocFromServer(doc(db, 'users', credential.user.uid))
    const role = userSnapshot.get('role')
    console.log(`[seed:debug] uid=${credential.user.uid} projectId=${firebaseConfig.projectId} userDocumentExists=${userSnapshot.exists()} role=${role === undefined ? '<missing>' : JSON.stringify(role)}`)
    if (role !== 'admin' && role !== 'superadmin') {
      throw new Error('This account does not have admin or superadmin role. No sample data was written.')
    }

    const batch = writeBatch(db)
    for (const [collectionName, documents] of collections) {
      for (const item of documents) {
        batch.set(doc(db, collectionName, item.id), item, { merge: true })
      }
    }
    await batch.commit()
    const totals = collections.map(([name, documents]) => `${documents.length} ${name}`).join(', ')
    console.log(`Seeded ${totals}. Existing documents were merged by id; users and fans were not changed.`)
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