// Posts the "Next up" matchday graphic (Masters FC v Ekhaya FC, Sun 29 Nov)
// as an image story on the app. Lives until just after kick-off. WRITE=1 to post.
const os = require('node:os'), path = require('node:path'), fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json'), 'utf8'))) })
const db = getFirestore()
const note = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)
const WRITE = process.env.WRITE === '1'
const image = fs.readFileSync(path.resolve('scripts/story-image.b64'), 'utf8').trim()
const thumb = fs.readFileSync(path.resolve('scripts/story-thumb.b64'), 'utf8').trim()
const FIXTURE = '2026-11-28-masters-fc-v-ekhaya-fc'
const EXPIRES = Date.parse('2026-11-29T18:00:00+02:00') // keep it up until after the match

;(async () => {
  const caption = 'Next up — Masters FC v Ekhaya FC · Sun 29 Nov, 15:00 · BNS'
  note(`Story: "${caption}" | image ${(image.length/1024).toFixed(0)}KB, thumb ${(thumb.length/1024).toFixed(0)}KB | expires ${new Date(EXPIRES).toISOString()}`)
  if (!WRITE) { note('DRY RUN (WRITE=1 to post).'); return }
  await db.collection('stories').doc().set({
    caption, label: 'Next up', thumb, image, hasImage: true,
    path: `/live?match=${FIXTURE}`,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(EXPIRES), by: 'admin',
  })
  note('Posted. The matchday graphic is live as a story.')
})().catch((e) => { console.log('::error::' + e.message); process.exit(1) })
