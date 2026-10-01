import { readFileSync } from 'node:fs'
import { after, before, beforeEach, test } from 'node:test'
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'

const projectId = 'demo-ekhaya-rules'
let testEnvironment: RulesTestEnvironment

before(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
    },
  })
})

after(async () => {
  await testEnvironment.cleanup()
})

beforeEach(async () => {
  await testEnvironment.clearFirestore()
})

function signedIn(uid: string, email = `${uid}@example.com`) {
  return testEnvironment.authenticatedContext(uid, { email }).firestore()
}

async function seedDocument(path: string, data: Record<string, unknown>) {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path), data)
  })
}

async function seedRole(uid: string, role: 'fan' | 'admin' | 'superadmin') {
  await seedDocument(`users/${uid}`, { role })
}

test('allows a user to create only their own fan profile', async () => {
  const db = signedIn('fan-1')
  await assertSucceeds(setDoc(doc(db, 'users/fan-1'), {
    role: 'fan',
    email: 'fan-1@example.com',
    fullName: 'Supporter One',
    phone: null,
    legacyFanDocId: null,
    legacyFanId: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }))

  await assertFails(setDoc(doc(db, 'users/fan-2'), {
    role: 'fan',
    email: 'fan-1@example.com',
    fullName: 'Supporter One',
    phone: null,
    legacyFanDocId: null,
    legacyFanId: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }))

  await assertFails(updateDoc(doc(db, 'users/fan-1'), {
    fullName: 'x'.repeat(121),
    updatedAt: serverTimestamp(),
  }))
})

test('prevents users from changing their own role', async () => {
  await seedRole('fan-1', 'fan')
  await assertFails(updateDoc(doc(signedIn('fan-1'), 'users/fan-1'), {
    role: 'superadmin',
    updatedAt: serverTimestamp(),
  }))
})

test('keeps user profiles private to their owner and superadmins', async () => {
  await seedRole('fan-1', 'fan')
  await assertSucceeds(getDoc(doc(signedIn('fan-1'), 'users/fan-1')))
  await assertFails(getDoc(doc(signedIn('fan-2'), 'users/fan-1')))
})

test('allows a fan to create a pending request for an active tier only', async () => {
  await seedDocument('membershipTiers/basic', { active: true, priceMWK: 5000 })
  const db = signedIn('fan-1')
  await assertSucceeds(setDoc(doc(db, 'memberships/fan-1'), {
    uid: 'fan-1',
    tierId: 'basic',
    fullName: 'Supporter One',
    phone: '+265991234567',
    email: 'fan-1@example.com',
    status: 'pending',
    createdAt: serverTimestamp(),
  }))

  await assertFails(updateDoc(doc(db, 'memberships/fan-1'), { status: 'active' }))
  await assertFails(setDoc(doc(signedIn('fan-2'), 'memberships/fan-2'), {
    uid: 'fan-2',
    tierId: 'basic',
    fullName: 'x'.repeat(121),
    phone: '+265991234567',
    email: 'fan-2@example.com',
    status: 'pending',
    createdAt: serverTimestamp(),
  }))
})

test('allows fans to read published news but not drafts', async () => {
  await seedDocument('news/published', { status: 'published', title: 'Published story' })
  await seedDocument('news/draft', { status: 'draft', title: 'Draft story' })
  const db = signedIn('fan-1')

  await assertSucceeds(getDoc(doc(db, 'news/published')))
  await assertFails(getDoc(doc(db, 'news/draft')))
})

test('restricts club data writes to admins', async () => {
  await seedRole('fan-1', 'fan')
  await seedRole('admin-1', 'admin')

  await assertFails(setDoc(doc(signedIn('fan-1'), 'teams/team-1'), { name: 'Team One' }))
  await assertSucceeds(setDoc(doc(signedIn('admin-1'), 'teams/team-1'), { name: 'Team One' }))
})

test('limits match reactions to the signed-in owner and supported emoji', async () => {
  const fanDb = signedIn('fan-1')
  await assertSucceeds(setDoc(doc(fanDb, 'fixtures/match-1/reactions/fan-1'), { emoji: '⚽', updatedAt: serverTimestamp() }))
  await assertFails(setDoc(doc(fanDb, 'fixtures/match-1/reactions/fan-2'), { emoji: '⚽', updatedAt: serverTimestamp() }))
  await assertFails(setDoc(doc(fanDb, 'fixtures/match-1/reactions/fan-1'), { emoji: '🔥🔥', updatedAt: serverTimestamp() }))
})
