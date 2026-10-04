// Loads the cup results in ekhaya-data.json (cupFixtures) into the live app:
// creates or corrects each cup match and its goal list. Cup matches never
// change the league table or player season stats.
//   node scripts/sync-cups.cjs          -> preview only
//   node scripts/sync-cups.cjs --apply  -> save
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')

const apply = process.argv.includes('--apply')
const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
if (!fs.existsSync(keyFile)) { console.error('Firebase key not found. Run `npm run save-firebase-key` first.'); process.exit(1) }
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyFile, 'utf8'))) })
const db = getFirestore()
const cups = require(path.resolve('ekhaya-data.json')).cupFixtures || []

const FIELDS = ['competition', 'season', 'round', 'date', 'home', 'away', 'venue', 'status', 'homeScore', 'awayScore', 'note']

async function main() {
  console.log(apply ? 'SAVING cup results:' : 'PREVIEW - cup results (nothing is changed):')
  let changed = 0
  for (const match of cups) {
    const ref = db.collection('fixtures').doc(match.id)
    const snap = await ref.get()
    const cur = snap.exists ? snap.data() : null
    const diff = FIELDS.filter((k) => (match[k] ?? null) !== (cur?.[k] ?? null))
    const events = await ref.collection('events').get()
    const goalsOk = events.size === match.goals.length
    const label = `${match.round}: ${match.home} ${match.homeScore}-${match.awayScore} ${match.away} (${match.date.slice(0, 10)})`
    if (cur && !diff.length && goalsOk) { console.log(`  ✔ ${label} - already correct`); continue }
    changed++
    console.log(`  ${cur ? '~ update' : '+ add'} ${label}${cur && diff.length ? ` [${diff.join(', ')}]` : ''}${!goalsOk ? ` · ${match.goals.length} goal(s)` : ''}`)
    match.goals.forEach((g) => console.log(`      ⚽ ${g.minute}' ${g.playerName} (${g.team})${g.text ? ' ' + g.text : ''}`))
    if (!apply) continue
    const data = Object.fromEntries(FIELDS.map((k) => [k, match[k] ?? null]))
    // statsApplied: the league table and season stats are never touched by cup matches.
    await ref.set({ ...data, eventCount: match.goals.length, statsApplied: true, statsSkipped: true, statsAppliedChanges: { standings: [], players: {} }, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    await db.recursiveDelete(ref.collection('events'))
    const batch = db.batch()
    match.goals.forEach((g, i) => batch.set(ref.collection('events').doc(`goal-${i + 1}`), {
      kind: 'goal', minute: g.minute, team: g.team, playerName: g.playerName,
      ...(g.playerId ? { playerId: g.playerId } : {}), ...(g.text ? { text: g.text } : {}),
      createdAt: FieldValue.serverTimestamp(),
    }))
    await batch.commit()
  }
  if (apply && changed) await require('./publish-snapshot.cjs').publishSnapshot()
  console.log(changed ? (apply ? `\nDone: ${changed} cup match(es) saved.` : `\n${changed} change(s) found. Run again with mode "apply" to save them.`) : '\nEverything is already up to date.')
}

main().catch((error) => { console.error('Cup sync failed:', error.message); process.exit(1) })
