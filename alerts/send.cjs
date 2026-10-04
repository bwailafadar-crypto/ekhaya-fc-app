// Sends one push alert to every device that chose this kind of alert.
// Run by .github/workflows/send-alert.yml, which the admin app triggers.
//   node send.cjs --kind match --title "GOAL! ..." --body "23' J. Banda" --path /live
const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const { getMessaging } = require('firebase-admin/messaging')

const APP_URL = 'https://ekhaya-fc-app.web.app'
const DEAD_TOKEN = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token', 'messaging/invalid-argument'])

function arg(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? String(process.argv[index + 1] ?? '') : fallback
}

async function sendAlert({ kind, title, body, path }, db, messaging) {
  if (!['match', 'news', 'test'].includes(kind)) throw new Error(`Unknown alert kind "${kind}"`)
  if (!title) throw new Error('An alert needs a title')
  const safePath = path.startsWith('/') ? path : '/'
  const link = `${APP_URL}/#${safePath}`
  // "test" alerts go to every device so the setup can be checked.
  const query = kind === 'test' ? db.collection('pushTokens') : db.collection('pushTokens').where(`prefs.${kind}`, '==', true)
  const tokens = (await query.get()).docs.map((doc) => doc.id)
  let sent = 0
  const dead = []
  for (let i = 0; i < tokens.length; i += 500) {
    const batch = tokens.slice(i, i + 500)
    const result = await messaging.sendEachForMulticast({
      tokens: batch,
      webpush: {
        notification: {
          title: title.slice(0, 120), body: body.slice(0, 240),
          icon: `${APP_URL}/pwa-icon-192.png`, badge: `${APP_URL}/pwa-icon-192.png`,
          ...(kind === 'match' ? { tag: 'ekhaya-match', renotify: true } : {}),
        },
        fcmOptions: { link },
      },
      data: { title, body, link },
    })
    sent += result.successCount
    result.responses.forEach((response, index) => { if (!response.success && DEAD_TOKEN.has(response.error?.code)) dead.push(batch[index]) })
  }
  if (dead.length) {
    const writer = db.batch()
    dead.forEach((token) => writer.delete(db.collection('pushTokens').doc(token)))
    await writer.commit()
  }
  return { sent, total: tokens.length, removed: dead.length }
}

module.exports = { sendAlert }

if (require.main === module) {
  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (!keyFile || !fs.existsSync(keyFile)) { console.error('✖ Firebase key missing (FIREBASE_SA secret).'); process.exit(1) }
  initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyFile, 'utf8'))) })
  sendAlert({ kind: arg('kind', 'match'), title: arg('title'), body: arg('body'), path: arg('path', '/') }, getFirestore(), getMessaging())
    .then(({ sent, total, removed }) => console.log(`✔ "${arg('title')}" sent to ${sent} of ${total} devices${removed ? ` (${removed} old devices removed)` : ''}`))
    .catch((error) => { console.error('✖', error.message); process.exit(1) })
}
