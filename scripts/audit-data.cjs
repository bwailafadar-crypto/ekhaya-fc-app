// READ-ONLY check of the live database: lists anything that looks like test
// or demo data, and placeholders still to fill in. Changes nothing.
// Uses the service account saved by `npm run save-firebase-key`.
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')

const keyFile = path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
if (!fs.existsSync(keyFile)) {
  console.error('Run `npm run save-firebase-key` first.')
  process.exit(1)
}
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyFile, 'utf8'))) })
const db = getFirestore()

const realIds = new Set(require(path.resolve('ekhaya-data.json')).fixtures.map((f) => f.id))
const line = (s = '') => console.log(s)

async function main() {
  const fixtures = (await db.collection('fixtures').get()).docs.map((d) => ({ id: d.id, ...d.data() }))
  const tests = fixtures.filter((f) => f.isTest)
  const extra = fixtures.filter((f) => !f.isTest && !realIds.has(f.id))
  const live = fixtures.filter((f) => f.status === 'live')
  line(`FIXTURES: ${fixtures.length} total, ${fixtures.length - tests.length - extra.length} from the real fixture list`)
  line(`  Test matches (${tests.length}):`)
  tests.forEach((f) => line(`    - ${f.id}: ${f.home} vs ${f.away} [${f.status}] ${f.homeScore ?? ''}-${f.awayScore ?? ''}`))
  line(`  Not in the real fixture list (${extra.length}):`)
  extra.forEach((f) => line(`    - ${f.id}: ${f.home} vs ${f.away} [${f.status}] ${f.date ?? ''}`))
  line(`  Currently LIVE (${live.length}):`)
  live.forEach((f) => line(`    - ${f.id}: ${f.home} vs ${f.away} ${f.homeScore ?? 0}-${f.awayScore ?? 0}`))
  const playedNoScore = fixtures.filter((f) => !f.isTest && f.status === 'upcoming' && f.date && new Date(f.date) < new Date())
  line(`  Past date but still "upcoming" - result not entered (${playedNoScore.length}):`)
  playedNoScore.forEach((f) => line(`    - ${f.id}: ${f.home} vs ${f.away} (${String(f.date).slice(0, 10)})`))

  const news = (await db.collection('news').get()).docs.map((d) => ({ id: d.id, ...d.data() }))
  line()
  line(`NEWS: ${news.length} articles`)
  news.forEach((n) => line(`    - ${n.id}: "${n.title}" [${n.status ?? 'no status'}]`))

  const players = (await db.collection('players').get()).docs.map((d) => d.data())
  const missing = (field) => players.filter((p) => !p[field]).length
  line()
  line(`PLAYERS: ${players.length} — missing position: ${missing('position')}, missing date of birth: ${missing('dob')}, missing photo: ${missing('photoDataUrl')}, missing number: ${players.filter((p) => p.number == null).length}`)

  const tiers = (await db.collection('membershipTiers').get()).docs.map((d) => ({ id: d.id, ...d.data() }))
  line()
  line(`MEMBERSHIP TIERS: ${tiers.length}`)
  const placeholderPrices = { basic: 5000, silver: 10000, gold: 20000, premium: 50000 }
  tiers.forEach((t) => line(`    - ${t.name}: MWK ${t.priceMWK}${placeholderPrices[t.id] === Number(t.priceMWK) ? '  <- still the placeholder price' : ''}`))

  const memberships = (await db.collection('memberships').get()).docs.map((d) => d.data())
  line()
  line(`MEMBERSHIP REQUESTS: ${memberships.length} (${memberships.filter((m) => m.status === 'pending').length} pending)`)
  memberships.forEach((m) => line(`    - ${m.fullName} <${m.email}> ${m.tierId} [${m.status}]`))

  const teams = (await db.collection('teams').get()).docs.map((d) => d.data())
  line()
  line(`TEAMS: ${teams.length} — without a logo: ${teams.filter((t) => !t.logoDataUrl).map((t) => t.name).join(', ') || 'none'}`)
}

main().catch((error) => { console.error('Check failed:', error.message); process.exit(1) })
