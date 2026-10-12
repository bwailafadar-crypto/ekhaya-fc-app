// READ-ONLY: checks that the figures in ekhaya-data.json (the club's official
// documents: league table, fixtures and results, cup results, squad, teams)
// are the same in the live app. Changes nothing.
//   node scripts/compare-data.cjs
// In GitHub Actions ("Compare documents with the app") the report also appears
// on the run page.
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')

const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
if (!fs.existsSync(keyFile)) { console.error('Firebase key not found. Run `npm run save-firebase-key` first.'); process.exit(1) }
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyFile, 'utf8'))) })
const db = getFirestore()
const doc = require(path.resolve('ekhaya-data.json'))

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
const show = (v) => (v == null || v === '' ? '(empty)' : Array.isArray(v) ? v.join('') : String(v))
const dateOf = (v) => (v && typeof v.toDate === 'function' ? v.toDate().toISOString() : v)
const sameTime = (a, b) => { const x = new Date(dateOf(a)).getTime(); const y = new Date(dateOf(b)).getTime(); return x === y }

/** Compares the fields the document fills in (blank fields in the document are skipped). */
function compare(rows, live, fields, label) {
  const problems = []
  let matching = 0
  for (const row of rows) {
    const cur = live.get(row.id)
    if (!cur) { problems.push(`${label(row)}: MISSING from the app`); continue }
    const diffs = []
    for (const field of fields) {
      const want = field.split('.').reduce((o, k) => o?.[k], row)
      if (want == null) continue
      const have = field.split('.').reduce((o, k) => o?.[k], cur)
      const ok = field === 'date' ? sameTime(want, have) : typeof want === 'number' ? Number(have) === want : same(want, have)
      if (!ok) diffs.push(`${field} document ${show(field === 'date' ? want : want)} / app ${show(field === 'date' ? dateOf(have) : have)}`)
    }
    if (diffs.length) problems.push(`${label(row)}: ${diffs.join('; ')}`)
    else matching++
  }
  return { matching, problems }
}

async function liveMap(name) {
  return new Map((await db.collection(name).get()).docs.map((d) => [d.id, d.data()]))
}

async function main() {
  const [standings, fixtures, players, teams] = await Promise.all(['standings', 'fixtures', 'players', 'teams'].map(liveMap))
  const sections = [
    ['League table (week 16)', doc.standings, standings, ['position', 'played', 'won', 'drawn', 'lost', 'goalsFor', 'goalsAgainst', 'goalDifference', 'points', 'form'], (r) => `${r.position}. ${r.team}`],
    ['League fixtures and results', doc.fixtures, fixtures, ['date', 'home', 'away', 'status', 'homeScore', 'awayScore', 'venue'], (r) => `${String(r.date).slice(0, 10)} ${r.home} v ${r.away}`],
    ['Airtel Top 8 results', doc.cupFixtures, fixtures, ['date', 'home', 'away', 'status', 'homeScore', 'awayScore', 'venue', 'round'], (r) => `${r.round}: ${r.home} v ${r.away}`],
    ['Squad', doc.players, players, ['name', 'number', 'position', 'dob', 'nationality'], (r) => `${r.name}${r.number == null ? '' : ` #${r.number}`}`],
    ['Teams', doc.teams, teams, ['name', 'shortName', 'homeGround'], (r) => r.name],
  ]
  const report = []
  let total = 0
  for (const [title, rows, live, fields, label] of sections) {
    const { matching, problems } = compare(rows ?? [], live, fields, label)
    total += problems.length
    report.push({ title, text: `${title}: ${matching} of ${(rows ?? []).length} match${problems.length ? `, ${problems.length} different` : ' - all the same'}`, problems })
  }
  // Results entered in the app that are not in the documents (newer matches).
  const known = new Set([...(doc.fixtures ?? []), ...(doc.cupFixtures ?? [])].map((f) => f.id))
  const extra = [...fixtures.entries()].filter(([id, f]) => !known.has(id) && !f.isTest).map(([, f]) => `${String(dateOf(f.date)).slice(0, 10)} ${f.home} v ${f.away} [${f.status}${f.status === 'finished' ? ` ${f.homeScore ?? 0}-${f.awayScore ?? 0}` : ''}]`)

  console.log('DOCUMENTS vs APP (read-only, nothing changed)\n')
  for (const section of report) {
    console.log(section.text)
    section.problems.forEach((p) => console.log(`   - ${p}`))
  }
  console.log(`\nIn the app but not in the documents: ${extra.length}`)
  extra.forEach((e) => console.log(`   - ${e}`))
  console.log(total ? `\n${total} difference(s) found.` : '\nEverything in the documents matches the app.')

  if (process.env.GITHUB_ACTIONS) {
    const esc = (s) => s.replace(/%/g, '%25').replace(/\r/g, '').replace(/\n/g, '%0A')
    for (const section of report) {
      const body = [section.text, ...section.problems.map((p) => `- ${p}`)].join('\n')
      console.log(`::${section.problems.length ? 'warning' : 'notice'} title=${section.title}::${esc(body.slice(0, 3800))}`)
    }
    console.log(`::notice title=In the app, not in the documents::${esc([`${extra.length} match(es)`, ...extra.map((e) => `- ${e}`)].join('\n').slice(0, 3800))}`)
    if (process.env.GITHUB_STEP_SUMMARY) {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, ['## Documents vs app', '', ...report.flatMap((s) => [`### ${s.text}`, ...s.problems.map((p) => `- ${p}`), '']), `### In the app, not in the documents: ${extra.length}`, ...extra.map((e) => `- ${e}`), ''].join('\n'))
    }
  }
}

main().catch((error) => { console.error('Compare failed:', error.message); process.exit(1) })
