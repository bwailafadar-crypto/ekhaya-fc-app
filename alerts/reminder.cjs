// Sends a matchday reminder before each Ekhaya kick-off (men's and women's).
// Run on a schedule by .github/workflows/match-reminder.yml (free, no Blaze plan).
// A one-time lock in alertsSent/ stops the same match being reminded twice, even
// though the schedule runs every hour.
const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, Timestamp } = require('firebase-admin/firestore')
const { getMessaging } = require('firebase-admin/messaging')
const { sendAlert } = require('./send.cjs')

const CLUB = /ekhaya/i
// Remind when kick-off is within the next 3 hours (so fans get a few hours' notice).
const WINDOW_MS = 3 * 60 * 60 * 1000
const MALAWI_OFFSET_MIN = 2 * 60 // CAT (UTC+2), no daylight saving.

const isClubMatch = (f) => CLUB.test(f.home || '') || CLUB.test(f.away || '')

function kickoffMs(f) {
  if (f.kickoffAt && typeof f.kickoffAt.toMillis === 'function') return f.kickoffAt.toMillis()
  // Fall back to the date string (treated as midnight CAT) when no kick-off time is set.
  if (typeof f.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(f.date)) {
    const parsed = Date.parse(`${f.date.slice(0, 10)}T00:00:00+02:00`)
    if (!Number.isNaN(parsed)) return parsed
  }
  return NaN
}

function kickoffLabel(ms, hasTime) {
  const local = new Date(ms + MALAWI_OFFSET_MIN * 60 * 1000)
  if (!hasTime) return 'today'
  const h = local.getUTCHours()
  const m = String(local.getUTCMinutes()).padStart(2, '0')
  const h12 = ((h + 11) % 12) + 1
  return `${h12}:${m} ${h < 12 ? 'am' : 'pm'}`
}

async function sendReminders(db, messaging) {
  const now = Date.now()
  const snap = await db.collection('fixtures').where('status', '==', 'upcoming').get()
  let sent = 0
  for (const docSnap of snap.docs) {
    const f = { id: docSnap.id, ...docSnap.data() }
    if (f.isTest || f.editing || !isClubMatch(f)) continue
    const ms = kickoffMs(f)
    if (Number.isNaN(ms) || ms < now || ms > now + WINDOW_MS) continue
    const lock = db.collection('alertsSent').doc(`reminder-${f.id}-${f.kickoffAt?.seconds ?? f.date ?? 'k'}`)
    try {
      await lock.create({ title: `Reminder ${f.home} v ${f.away}`.slice(0, 200), createdAt: Timestamp.now() })
    } catch {
      continue // already reminded (lock exists)
    }
    const hasTime = Boolean(f.kickoffAt)
    const when = kickoffLabel(ms, hasTime)
    const women = (f.squad ?? 'men') === 'women'
    try {
      const result = await sendAlert({
        kind: 'match',
        title: `⏰ Matchday! ${f.home} v ${f.away}`,
        body: `${women ? 'Ekhaya Women' : 'Ekhaya FC'} kick off ${hasTime ? `at ${when}` : when}. Follow it live in the app.`,
        path: '/live',
      }, db, messaging)
      console.log(`✔ Reminder "${f.home} v ${f.away}" sent to ${result.sent} of ${result.total} devices`)
      sent += 1
    } catch (error) {
      await lock.delete().catch(() => undefined) // let a later run retry
      console.error('✖', f.id, error.message)
    }
  }
  return sent
}

if (require.main === module) {
  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (!keyFile || !fs.existsSync(keyFile)) { console.error('✖ Firebase key missing (FIREBASE_SA secret).'); process.exit(1) }
  initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyFile, 'utf8'))) })
  sendReminders(getFirestore(), getMessaging())
    .then((count) => console.log(count ? `Done: ${count} matchday reminder(s) sent.` : 'No matches kicking off in the next 3 hours.'))
    .catch((error) => { console.error('✖', error.message); process.exit(1) })
}

module.exports = { sendReminders }
