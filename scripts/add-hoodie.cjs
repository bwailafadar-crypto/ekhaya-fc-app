// Adds the Ekhaya FC cream Hoodie (fanwear, MK 150,000) to the club shop,
// with its product photo. Idempotent (fixed id). WRITE=1 to save.
const os = require('node:os'), path = require('node:path'), fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json'), 'utf8'))) })
const db = getFirestore()
const note = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)
const WRITE = process.env.WRITE === '1'
const ID = 'hoodie-cream-2026'
const image = fs.readFileSync(path.resolve('scripts/hoodie-image.b64'), 'utf8').trim()

;(async () => {
  const existing = (await db.collection('shopProducts').get()).docs
  const maxOrder = Math.max(0, ...existing.map((d) => Number(d.data().order) || 0))
  const already = existing.find((d) => d.id === ID)
  const doc = {
    name: 'Ekhaya FC Hoodie',
    category: 'fanwear',
    price: 150000,
    description: 'Premium cream Ekhaya FC hoodie with the embroidered club crest and DODA mark. Soft brushed fleece inside, kangaroo pocket, drawstring hood — matchday warmth off the pitch.',
    images: [image],
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    badge: 'New',
    colour: 'third',
    active: true,
    soldOut: false,
    order: already ? (already.data().order ?? maxOrder) : maxOrder + 1,
    updatedAt: FieldValue.serverTimestamp(),
  }
  if (!already) doc.createdAt = FieldValue.serverTimestamp()
  note(`${already ? 'Updating' : 'Adding'} "${doc.name}" — MK ${doc.price.toLocaleString()}, sizes ${doc.sizes.join(' ')}, photo ${(image.length / 1024).toFixed(0)}KB`)
  if (!WRITE) { note('DRY RUN (set WRITE=1 to save).'); return }
  await db.collection('shopProducts').doc(ID).set(doc, { merge: true })
  note('Saved. The hoodie is live in the shop (Fanwear).')
})().catch((e) => { console.log('::error::' + e.message); process.exit(1) })
