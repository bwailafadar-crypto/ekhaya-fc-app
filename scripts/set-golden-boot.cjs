// Saves the league Golden Boot list shown on the Top scorers page.
//   PLAYERS="Tonic Viyuyi|Blue Eagles|10; Ephraim Kondowe|FCB Nyasa Big Bullets|10" \
//   AS_OF=2026-10-26 SOURCE="Nyasa Times, 26 Oct 2026" node scripts/set-golden-boot.cjs [--apply]
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const apply = process.argv.includes('--apply')
const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyFile, 'utf8'))) })
const db = getFirestore()
const say = (text) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${text}` : text)
async function main() {
  const players = String(process.env.PLAYERS || '').split(';').map((l) => l.split('|').map((x) => x.trim())).filter((p) => p[0] && p[1] && /^\d+$/.test(p[2] || '')).map(([name, club, goals]) => ({ name, club, goals: Number(goals) })).sort((a, b) => b.goals - a.goals)
  const asOf = String(process.env.AS_OF || '').match(/^\d{4}-\d{2}-\d{2}$/) ? process.env.AS_OF : new Date().toISOString().slice(0, 10)
  if (players.length < 3) { say('Need at least 3 players as "name|club|goals; ...". Nothing saved.'); process.exit(1) }
  const before = (await db.collection('publicData').doc('topScorers').get()).data()
  say(`Golden Boot as of ${asOf}: ${players.map((p) => `${p.name} (${p.club}) ${p.goals}`).join(', ')}`)
  if (before?.players) say(`Was (as of ${before.asOf}): ${before.players.map((p) => `${p.name} ${p.goals}`).join(', ')}`)
  if (apply) { await db.collection('publicData').doc('topScorers').set({ asOf, source: String(process.env.SOURCE || '').slice(0, 200), players, updatedAt: FieldValue.serverTimestamp() }); say('Saved.') } else say('Preview only.')
}
main().catch((e) => { console.error(e); process.exit(1) })
