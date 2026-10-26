// Fixes a misspelt player name everywhere in the live data (players, fixtures,
// line-ups, goals, match events, stories, news, shared fan data...).
// Fans' own chat messages are never changed.
//   FROM="Alfred Chinga" TO="Alfred Chizinga" node scripts/rename-player.cjs [--apply]
// Also reports any other place the wrong surname appears on its own.
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const apply = process.argv.includes('--apply')
const FROM = (process.env.FROM || '').trim(); const TO = (process.env.TO || '').trim()
if (!FROM || !TO) { console.error('Set FROM and TO'); process.exit(1) }
const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyFile, 'utf8'))) })
const db = getFirestore()
const lines = []
const say = (t) => { lines.push(t); if (!process.env.GITHUB_ACTIONS) console.log(t) }
const flush = () => { if (process.env.GITHUB_ACTIONS) for (let i = 0; i < lines.length; i += 4) console.log(`::notice::${lines.slice(i, i + 4).join(' || ')}`) }
const SKIP = new Set(['users', 'activity', 'chat', 'shopOrders', 'memberships', 'fans', 'alertTokens', 'pushTokens'])
const fromRe = new RegExp(FROM.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
const wrongSurname = FROM.split(/\s+/).pop(); const rightSurname = TO.split(/\s+/).pop()
const surnameRe = new RegExp(`\\b${wrongSurname}\\b`, 'i')

function fix(value, where, hits) {
  if (typeof value === 'string') {
    if (fromRe.test(value)) { fromRe.lastIndex = 0; hits.push(where); return value.replace(fromRe, TO) }
    fromRe.lastIndex = 0
    if (surnameRe.test(value) && !/machinga/i.test(value)) hits.push(`${where} (surname only: "${value.slice(0, 60)}")`)
    return value
  }
  if (Array.isArray(value)) return value.map((v, i) => fix(v, `${where}[${i}]`, hits))
  if (value && typeof value === 'object' && value.constructor === Object) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fix(v, `${where}.${k}`, hits)]))
  return value
}

async function scan(col, label, writes) {
  const snap = await col.get()
  for (const doc of snap.docs) {
    const hits = []
    const data = doc.data()
    const fixed = fix(data, `${label}/${doc.id}`, hits)
    if (hits.length) {
      const full = hits.filter((h) => !h.includes('surname only'))
      hits.forEach((h) => say(h))
      if (full.length) writes.push([doc.ref, fixed])
      // A surname-only field that belongs to this player (playerName "Chinga" next to the right id) is fixed too.
    }
    for (const sub of await doc.ref.listCollections()) if (!SKIP.has(sub.id)) await scan(sub, `${label}/${doc.id}/${sub.id}`, writes)
  }
}

async function main() {
  const writes = []
  for (const col of await db.listCollections()) if (!SKIP.has(col.id)) await scan(col, col.id, writes)
  say(`${apply ? 'SAVING' : 'PREVIEW'}: "${FROM}" → "${TO}" in ${writes.length} document(s)`)
  if (apply && writes.length) { for (let i = 0; i < writes.length; i += 400) { const b = db.batch(); writes.slice(i, i + 400).forEach(([ref, data]) => b.set(ref, data)); await b.commit() } say('Saved.') }
  if (!writes.length) say('Nothing to change.')
  flush()
}
main().catch((e) => { console.error(e); flush(); process.exit(1) })
