import { readFileSync } from 'node:fs'
import { after, before, beforeEach, test } from 'node:test'
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, Timestamp, updateDoc, where, writeBatch } from 'firebase/firestore'
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

test('memberships are created only by the payment server, never by a fan', async () => {
  await seedDocument('membershipTiers/basic', { active: true, priceMWK: 5000 })
  const db = signedIn('fan-1')
  await assertFails(setDoc(doc(db, 'memberships/fan-1'), {
    uid: 'fan-1',
    tierId: 'basic',
    fullName: 'Supporter One',
    phone: '+265991234567',
    email: 'fan-1@example.com',
    status: 'pending',
    createdAt: serverTimestamp(),
  }))
  await seedDocument('memberships/fan-1', { uid: 'fan-1', status: 'pending' })
  await assertSucceeds(getDoc(doc(db, 'memberships/fan-1')))
  await assertFails(updateDoc(doc(db, 'memberships/fan-1'), { status: 'active' }))
  await assertFails(getDoc(doc(signedIn('fan-2'), 'memberships/fan-1')))
})

test('payments are never readable or writable from the app', async () => {
  await seedDocument('payments/tx-1', { uid: 'fan-1', status: 'pending', amount: 5000 })
  await assertFails(getDoc(doc(signedIn('fan-1'), 'payments/tx-1')))
  await assertFails(setDoc(doc(signedIn('fan-1'), 'payments/tx-2'), { uid: 'fan-1', status: 'paid' }))
})

test('a fan can delete their own account and leave a deletion request, not someone else\'s', async () => {
  await seedRole('fan-1', 'fan')
  await seedRole('fan-2', 'fan')
  const db = signedIn('fan-1')
  await assertSucceeds(setDoc(doc(db, 'deletionRequests/fan-1'), { email: 'fan-1@example.com', createdAt: serverTimestamp() }))
  await assertFails(setDoc(doc(db, 'deletionRequests/fan-2'), { email: 'fan-1@example.com', createdAt: serverTimestamp() }))
  await assertFails(getDoc(doc(db, 'deletionRequests/fan-1')))
  await assertFails(deleteDoc(doc(db, 'users/fan-2')))
  await assertSucceeds(deleteDoc(doc(db, 'users/fan-1')))
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

test('stories: admins post (photo + caption, max 2 days), fans can only read', async () => {
  await seedRole('admin-1', 'admin')
  await seedRole('fan-1', 'fan')
  const admin = signedIn('admin-1')
  const fan = signedIn('fan-1')
  const story = (by: string, extra: Record<string, unknown> = {}) => ({
    caption: 'Warm-up done', label: 'Match day', thumb: 'data:image/jpeg;base64,AAAA', hasImage: true, path: '/live',
    createdAt: serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + 24 * 3600 * 1000), by, ...extra,
  })
  const batch = writeBatch(admin)
  batch.set(doc(admin, 'storyImages/s1'), { image: 'data:image/jpeg;base64,BBBB', createdAt: serverTimestamp() })
  batch.set(doc(admin, 'stories/s1'), story('admin-1'))
  await assertSucceeds(batch.commit())
  // Text-only story without a thumbnail.
  await assertSucceeds(setDoc(doc(admin, 'stories/s2'), { caption: 'Kick-off at 2pm', label: 'Club', thumb: null, hasImage: false, createdAt: serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + 3600 * 1000), by: 'admin-1' }))
  // Fans read the live stories and photos, but cannot post or delete.
  await assertSucceeds(getDocs(query(collection(fan, 'stories'), where('expiresAt', '>', Timestamp.now()))))
  await assertSucceeds(getDoc(doc(fan, 'storyImages/s1')))
  await assertFails(setDoc(doc(fan, 'stories/s3'), story('fan-1')))
  await assertFails(deleteDoc(doc(fan, 'stories/s1')))
  // Wrong label, someone else's name, or a story that lasts a week are refused.
  await assertFails(setDoc(doc(admin, 'stories/s4'), story('admin-1', { label: 'Anything' })))
  await assertFails(setDoc(doc(admin, 'stories/s5'), story('fan-1')))
  await assertFails(setDoc(doc(admin, 'stories/s6'), story('admin-1', { expiresAt: Timestamp.fromMillis(Date.now() + 7 * 24 * 3600 * 1000) })))
  await assertSucceeds(deleteDoc(doc(admin, 'stories/s1')))
})

test('alerts: a fan saves the players they follow on their own device only', async () => {
  const token = 't'.repeat(150)
  const fan = signedIn('fan-1')
  const device = { uid: 'fan-1', token, prefs: { match: true, news: true }, platform: 'android', updatedAt: serverTimestamp() }
  await assertSucceeds(setDoc(doc(fan, `pushTokens/${token}`), { ...device, follows: ['allen-chihana'] }))
  await assertSucceeds(updateDoc(doc(fan, `pushTokens/${token}`), { follows: ['allen-chihana', 'samuel-rukura'], updatedAt: serverTimestamp() }))
  await assertFails(updateDoc(doc(fan, `pushTokens/${token}`), { follows: Array.from({ length: 31 }, (_, i) => `p${i}`), updatedAt: serverTimestamp() }))
  await assertFails(updateDoc(doc(signedIn('fan-2'), `pushTokens/${token}`), { follows: [], updatedAt: serverTimestamp() }))
})

test('stadium check-in: once team news is out or during the match, in the fan\'s own name, never in practice', async () => {
  await seedDocument('users/fan-1', { role: 'fan', fullName: 'Supporter One' })
  const fan = testEnvironment.authenticatedContext('fan-1', { email: 'fan-1@example.com', email_verified: true }).firestore()
  await seedDocument('fixtures/early', { status: 'upcoming', home: 'Ekhaya FC', away: 'Blue Eagles' })
  await seedDocument('fixtures/teamnews', { status: 'upcoming', lineupConfirmed: true, home: 'Ekhaya FC', away: 'Blue Eagles' })
  await seedDocument('fixtures/live', { status: 'live', home: 'Ekhaya FC', away: 'Blue Eagles' })
  await seedDocument('fixtures/practice', { status: 'live', isTest: true, home: 'Ekhaya FC', away: 'Practice XI' })
  await seedDocument('fixtures/done', { status: 'finished', home: 'Ekhaya FC', away: 'Blue Eagles' })
  const checkIn = (fixture: string, name = 'Supporter One') => setDoc(doc(fan, `fixtures/${fixture}/checkins/fan-1`), { name, createdAt: serverTimestamp() })
  await assertFails(checkIn('early'))
  await assertSucceeds(checkIn('teamnews'))
  await assertSucceeds(checkIn('live'))
  await assertFails(checkIn('practice'))
  await assertFails(checkIn('done'))
  await assertFails(setDoc(doc(fan, 'fixtures/live/checkins/fan-2'), { name: 'Supporter One', createdAt: serverTimestamp() }))
  // Fan points are written by admins only.
  await assertFails(setDoc(doc(fan, 'fanPoints/fan-1'), { points: 9999 }))
  await assertSucceeds(getDoc(doc(fan, 'fanPoints/fan-1')))
})

test('Ekhaya TV, match photos and the club page: admins add, fans watch', async () => {
  await seedRole('admin-1', 'admin')
  await seedRole('fan-1', 'fan')
  const admin = signedIn('admin-1')
  const fan = signedIn('fan-1')
  const video = (url: string, extra: Record<string, unknown> = {}) => ({ title: 'Highlights', url, kind: 'Highlights', createdAt: serverTimestamp(), by: 'admin-1', ...extra })
  await assertSucceeds(setDoc(doc(admin, 'videos/v1'), video('https://youtu.be/dQw4w9WgXcQ', { fixtureId: 'm1' })))
  await assertSucceeds(setDoc(doc(admin, 'videos/v2'), video('https://www.facebook.com/EkhayaFC/videos/123/')))
  await assertFails(setDoc(doc(admin, 'videos/v3'), video('https://example.com/clip.mp4')))
  await assertFails(setDoc(doc(admin, 'videos/v4'), video('https://youtu.be/dQw4w9WgXcQ', { kind: 'Other' })))
  await assertFails(setDoc(doc(fan, 'videos/v5'), video('https://youtu.be/dQw4w9WgXcQ', { by: 'fan-1' })))
  await assertSucceeds(getDoc(doc(fan, 'videos/v1')))
  const batch = writeBatch(admin)
  batch.set(doc(admin, 'matchPhotoImages/p1'), { image: 'data:image/jpeg;base64,AAAA', createdAt: serverTimestamp() })
  batch.set(doc(admin, 'matchPhotos/p1'), { fixtureId: 'm1', thumb: 'data:image/jpeg;base64,BB', createdAt: serverTimestamp(), by: 'admin-1' })
  await assertSucceeds(batch.commit())
  await assertSucceeds(getDocs(query(collection(fan, 'matchPhotos'), where('fixtureId', '==', 'm1'))))
  await assertFails(setDoc(doc(fan, 'matchPhotos/p2'), { fixtureId: 'm1', thumb: 'x', createdAt: serverTimestamp(), by: 'fan-1' }))
  await assertFails(deleteDoc(doc(fan, 'matchPhotos/p1')))
  await assertSucceeds(setDoc(doc(admin, 'clubInfo/history'), { story: 'Founded in Blantyre.' }))
  await assertFails(setDoc(doc(fan, 'clubInfo/history'), { story: 'Hacked' }))
  await assertSucceeds(getDoc(doc(fan, 'clubInfo/history')))
})

test('match GPS figures: fans read, only admins write', async () => {
  await seedRole('fan-1', 'fan')
  await seedRole('admin-1', 'admin')
  await seedDocument('matchGps/m1', { players: [] })
  await assertSucceeds(getDoc(doc(signedIn('fan-1'), 'matchGps/m1')))
  await assertFails(setDoc(doc(signedIn('fan-1'), 'matchGps/m1'), { players: [] }))
  await assertSucceeds(setDoc(doc(signedIn('admin-1'), 'matchGps/m1'), { players: [] }))
})
