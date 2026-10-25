// Puts every club's home ground into the app (Teams) and fills the stadium of
// Ekhaya's matches: home games at Mpira Stadium, away games at the stadium
// listed for that match (or the home team's ground). From data/venues-2026.json.
// Live matches are never touched.
//   node scripts/set-venues.cjs [--apply]
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const apply = process.argv.includes('--apply')
const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyFile, 'utf8'))) })
const db = getFirestore()
const lines = []
const say = (t) => { lines.push(t); if (!process.env.GITHUB_ACTIONS) console.log(t) }
const flush = () => { if (process.env.GITHUB_ACTIONS) for (let i = 0; i < lines.length; i += 4) console.log(`::notice::${lines.slice(i, i + 4).join(' || ')}`) }
const norm = (s) => String(s || '').toLowerCase().replace(/\bf\.?c\.?\b/g, '').replace(/[^a-z]/g, '')
const data = JSON.parse(fs.readFileSync(path.resolve('data/venues-2026.json'), 'utf8'))
const ALIAS = { mitundubaptist: 'Luanar Mitundu', luanar: 'Luanar Mitundu', civounited: 'Civil Service United', civo: 'Civil Service United', dedzadynamos: 'Goshen City Dedza Dynamos', bigbullets: 'FCB Nyasa Big Bullets', nyasabigbullets: 'FCB Nyasa Big Bullets', mafco: 'MAFCO F.C', moyale: 'Moyale Barracks', creck: 'Creck Sporting', crecksc: 'Creck Sporting', masters: 'Masters FC' }
const groundOf = (name) => { const n = norm(name); const key = Object.keys(data.homeGrounds).find((t) => norm(t) === n) || ALIAS[n] || Object.keys(data.homeGrounds).find((t) => norm(t).includes(n) || n.includes(norm(t))); return key ? data.homeGrounds[key] : null }

async function main() {
  const batch = db.batch()
  let changes = 0
  for (const doc of (await db.collection('teams').get()).docs) {
    const t = doc.data()
    const ground = groundOf(t.name) || groundOf(t.shortName)
    if (!ground) { say(`Team ${t.name}: no home ground known, left`); continue }
    if (t.homeGround === ground) continue
    say(`Team ${t.name}: ${t.homeGround || '(none)'} → ${ground}`)
    batch.update(doc.ref, { homeGround: ground, updatedAt: FieldValue.serverTimestamp() }); changes++
  }
  for (const doc of (await db.collection('fixtures').get()).docs) {
    const f = doc.data()
    if (f.isTest || f.status === 'live' || !/ekhaya/i.test(`${f.home} ${f.away}`)) continue
    const venue = data.matchVenues[doc.id] || (/ekhaya/i.test(f.home) ? data.homeGrounds['Ekhaya FC'] : groundOf(f.home))
    if (!venue || f.venue === venue) continue
    // Cup finals and neutral games keep their own stadium.
    if (/top 8|cup|final|charity/i.test(`${f.competition} ${f.round || ''} ${doc.id}`) && f.venue) continue
    say(`${String(f.date).slice(0, 10)} ${f.home} v ${f.away}: ${f.venue || '(none)'} → ${venue}`)
    batch.update(doc.ref, { venue, updatedAt: FieldValue.serverTimestamp() }); changes++
  }
  if (apply) { await batch.commit(); say(`SAVED ${changes} change(s).`) } else say(`PREVIEW: ${changes} change(s) would be saved.`)
  flush()
}
main().catch((e) => { console.error(e); process.exit(1) })
