// READ-ONLY: lists each finished Ekhaya league match with its goal events and
// whether its result was counted in player stats. Changes nothing.
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyFile, 'utf8'))) })
const db = getFirestore()
const say = (text) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${text}` : text)
async function main() {
  const fixtures = (await db.collection('fixtures').get()).docs.map((d) => ({ id: d.id, ...d.data() })).filter((f) => !f.isTest && f.status === 'finished' && /ekhaya/i.test(`${f.home} ${f.away}`)).sort((a, b) => String(a.date).localeCompare(String(b.date)))
  const lines = []
  for (const f of fixtures) {
    const events = (await db.collection('fixtures').doc(f.id).collection('events').get()).docs.map((d) => d.data())
    const goals = events.filter((e) => e.kind === 'goal').sort((a, b) => a.minute - b.minute).map((e) => `${e.minute}' ${e.playerName || '?'}${e.playerId ? '#' : ''}${e.assistPlayerName ? ` (a ${e.assistPlayerName})` : ''} [${/ekhaya/i.test(e.team) ? 'EK' : 'OPP'}]`)
    lines.push(`${String(f.date).slice(0, 10)} ${f.id} ${f.home} ${f.homeScore}-${f.awayScore} ${f.away} | statsApplied=${Boolean(f.statsApplied)} lineup=${(f.startingPlayerIds || []).length} events=${events.length} | goals: ${goals.join('; ') || '-'}`)
  }
  // annotations are limited to 10 per step: print in groups of 3
  for (let i = 0; i < lines.length; i += 2) say(lines.slice(i, i + 2).join(' || '))
  const players = (await db.collection('players').get()).docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p.team === 'senior')
  say('PLAYERS ' + players.map((p) => `${p.id}=${p.name}:${p.stats?.goals ?? 0}g/${p.stats?.assists ?? 0}a`).join(', ').slice(0, 3500))
}
main().catch((e) => { console.error(e); process.exit(1) })
