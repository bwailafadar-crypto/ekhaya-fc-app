// Merges a duplicate player into the right one: every line-up, bench, goal,
// substitution and event that points to the duplicate now points to the right
// player (id and name), numbers in stats are added together, and the duplicate
// is removed. Fans' chat messages are never changed.
//   KEEP=alfred-chizinga DROP=alfred-chinga-muuxapj9 node scripts/merge-player.cjs [--apply]
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const apply = process.argv.includes('--apply')
const KEEP = (process.env.KEEP || '').trim(); const DROP = (process.env.DROP || '').trim()
if (!KEEP || !DROP || KEEP === DROP) { console.error('Set KEEP and DROP'); process.exit(1) }
const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyFile, 'utf8'))) })
const db = getFirestore()
const lines = []
const say = (t) => { lines.push(t); if (!process.env.GITHUB_ACTIONS) console.log(t) }
const flush = () => { if (process.env.GITHUB_ACTIONS) for (let i = 0; i < lines.length; i += 4) console.log(`::notice::${lines.slice(i, i + 4).join(' || ')}`) }
const SKIP = new Set(['chat', 'activity'])

async function main() {
  const keepRef = db.collection('players').doc(KEEP); const dropRef = db.collection('players').doc(DROP)
  const [keep, drop] = await Promise.all([keepRef.get(), dropRef.get()])
  if (!keep.exists || !drop.exists) throw new Error(`Player not found: ${keep.exists ? DROP : KEEP}`)
  const k = keep.data(); const d = drop.data()
  const KEEP_NAME = k.name; const DROP_NAME = d.name
  say(`Keep: ${KEEP_NAME} (#${k.number ?? '-'}, ${k.team}, photo ${k.photoDataUrl ? 'yes' : 'no'}, stats ${JSON.stringify(k.stats ?? {})})`)
  say(`Remove: ${DROP_NAME} (#${d.number ?? '-'}, ${d.team}, photo ${d.photoDataUrl ? 'yes' : 'no'}, stats ${JSON.stringify(d.stats ?? {})})`)

  const fix = (value, where, hits) => {
    if (typeof value === 'string') {
      if (value === DROP) { hits.push(`${where} id`); return KEEP }
      if (value === DROP_NAME) { hits.push(`${where} name`); return KEEP_NAME }
      return value
    }
    if (Array.isArray(value)) {
      const out = value.map((v, i) => fix(v, `${where}[${i}]`, hits))
      return out.every((v) => typeof v === 'string') ? [...new Set(out)] : out
    }
    if (value && typeof value === 'object' && value.constructor === Object) return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, fix(v, `${where}.${key}`, hits)]))
    return value
  }
  const writes = []
  const scan = async (col, label) => {
    for (const doc of (await col.get()).docs) {
      if (label === 'players' && (doc.id === KEEP || doc.id === DROP)) continue
      const hits = []; const fixed = fix(doc.data(), `${label}/${doc.id}`, hits)
      if (hits.length) { writes.push([doc.ref, fixed]); say(`${label}/${doc.id}: ${hits.length} change(s) (${hits.slice(0, 3).map((h) => h.replace(`${label}/${doc.id}`, '')).join(', ')}${hits.length > 3 ? '…' : ''})`) }
      for (const sub of await doc.ref.listCollections()) if (!SKIP.has(sub.id)) await scan(sub, `${label}/${doc.id}/${sub.id}`)
    }
  }
  for (const col of await db.listCollections()) if (!SKIP.has(col.id)) await scan(col, col.id)

  const stats = { ...(k.stats ?? {}) }
  for (const [key, v] of Object.entries(d.stats ?? {})) if (typeof v === 'number') stats[key] = Number(stats[key] ?? 0) + v
  const merged = { stats, ...(!k.photoDataUrl && d.photoDataUrl ? { photoDataUrl: d.photoDataUrl } : {}), ...(k.number == null && d.number != null ? { number: d.number } : {}) }
  say(`${KEEP_NAME} stats after merge: ${JSON.stringify(stats)}`)
  say(`${apply ? 'SAVING' : 'PREVIEW'}: ${writes.length} document(s) to update, then remove ${DROP_NAME}`)
  if (apply) {
    for (let i = 0; i < writes.length; i += 400) { const b = db.batch(); writes.slice(i, i + 400).forEach(([ref, data]) => b.set(ref, data)); await b.commit() }
    await keepRef.set(merged, { merge: true })
    await dropRef.delete()
    say('Saved.')
  }
  flush()
}
main().catch((e) => { console.error(e); flush(); process.exit(1) })
