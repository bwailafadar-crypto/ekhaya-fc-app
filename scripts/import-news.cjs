// Publishes (or updates) a news article from a JSON file into the live app.
//   NEWS_FILE=scripts/news/xyz.json node scripts/import-news.cjs
// The JSON holds: id, title, category, summary, body, bodyBlocks, publishedDate,
// featured, status. Uses the admin SDK, so it is not limited by the rules.
const os = require('node:os'); const path = require('node:path'); const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const file = process.env.NEWS_FILE
if (!file) { console.log('::error::Set NEWS_FILE to the article JSON path'); process.exit(1) }
const article = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'))
const { id, ...fields } = article
if (!id || !fields.title || !Array.isArray(fields.bodyBlocks)) { console.log('::error::JSON needs id, title and bodyBlocks'); process.exit(1) }
const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyFile, 'utf8'))) })
const db = getFirestore()
;(async () => {
  const ref = db.collection('news').doc(id)
  const existed = (await ref.get()).exists
  await ref.set({
    ...fields,
    photoIds: fields.photoIds ?? [],
    updatedAt: FieldValue.serverTimestamp(),
    ...(existed ? {} : { createdAt: FieldValue.serverTimestamp() }),
  }, { merge: true })
  console.log(`::notice::${existed ? 'Updated' : 'Published'} "${fields.title}" (status: ${fields.status}, ${fields.bodyBlocks.length} blocks)`)
})().catch((e) => { console.log(`::error::${e.message}`); process.exit(1) })
