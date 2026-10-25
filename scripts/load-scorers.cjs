// Puts goalscorers from data/scorers-2026.json into Ekhaya's finished matches
// (as goal events, like the match centre writes them), fixes missing names,
// and saves the league Golden Boot list to publicData/topScorers.
// Matches that already have goal events are left alone.
//   node scripts/load-scorers.cjs          -> preview only
//   node scripts/load-scorers.cjs --apply  -> save
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
const say = (text) => { lines.push(text); if (!process.env.GITHUB_ACTIONS) console.log(text) }
const flush = () => { if (!process.env.GITHUB_ACTIONS) return; for (let i = 0; i < lines.length; i += 3) console.log(`::notice::${lines.slice(i, i + 3).join(' || ')}`) }
const data = JSON.parse(fs.readFileSync(path.resolve('data/scorers-2026.json'), 'utf8'))
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '')

async function main() {
  const players = (await db.collection('players').get()).docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p.team === 'senior')
  const findPlayer = (name) => players.find((p) => norm(p.name) === norm(name)) || players.find((p) => norm(p.name).endsWith(norm(name.split(' ').slice(-1)[0])) && norm(p.name).startsWith(norm(name)[0]))
  const batch = db.batch()
  let writes = 0
  const buildGoals = (events, f) => events.filter((e) => e.kind === 'goal').sort((x, y) => x.minute + (x.addedTime || 0) / 100 - (y.minute + (y.addedTime || 0) / 100)).map((e) => ({
    side: norm(e.team) === norm(f.home) ? 'home' : 'away', name: e.playerName || '', minute: e.minute,
    ...(e.playerId ? { playerId: e.playerId } : {}), ...(e.addedTime ? { added: e.addedTime } : {}), ...(e.minuteApprox ? { approx: true } : {}),
    ...(e.penalty ? { penalty: true } : {}), ...(e.assistPlayerName ? { assist: e.assistPlayerName } : {}), ...(e.assistPlayerId ? { assistId: e.assistPlayerId } : {}),
  }))
  const all = (await db.collection('fixtures').get()).docs.filter((d) => { const f = d.data(); return !f.isTest && f.status === 'finished' && /ekhaya/i.test(`${f.home} ${f.away}`) })
  for (const docSnap of all) {
    const id = docSnap.id
    const ref = docSnap.ref
    const f = docSnap.data()
    const eventDocs = (await ref.collection('events').get()).docs
    const events = eventDocs.map((d) => ({ ...d.data(), __ref: d.ref }))
    const club = /ekhaya/i.test(f.home) ? f.home : f.away
    const opp = club === f.home ? f.away : f.home
    const planned = data.matches[id]
    const existingGoals = events.filter((e) => e.kind === 'goal')
    if (planned && existingGoals.length) say(`${id}: already has ${existingGoals.length} goal(s) in the app, kept`)
    if (planned && !existingGoals.length) {
      const ekGoals = planned.filter((g) => g.side === 'ekhaya').length
      const clubScore = club === f.home ? f.homeScore : f.awayScore
      const oppScore = club === f.home ? f.awayScore : f.homeScore
      if (ekGoals > clubScore || planned.length - ekGoals > oppScore) { say(`${id}: more scorers than goals, skipped`); continue }
      const parts = []
      for (const g of planned) {
        const team = g.side === 'ekhaya' ? club : opp
        const player = g.side === 'ekhaya' ? findPlayer(g.player) : null
        const assist = g.assist && g.side === 'ekhaya' ? findPlayer(g.assist) : null
        if (g.side === 'ekhaya' && !player) say(`  ! ${g.player} not found in the squad (name saved without a link)`)
        const event = {
          kind: 'goal', minute: g.minute, team, playerName: player?.name || g.player,
          ...(player ? { playerId: player.id } : {}),
          ...(g.assist ? { assistPlayerName: assist?.name || g.assist, ...(assist ? { assistPlayerId: assist.id } : {}) } : {}),
          ...(g.minuteApprox ? { minuteApprox: true } : {}), ...(g.penalty ? { penalty: true } : {}), ...(g.added ? { addedTime: g.added } : {}),
          source: 'match reports', createdAt: FieldValue.serverTimestamp(),
        }
        batch.set(ref.collection('events').doc(), event); writes++
        events.push(event)
        parts.push(`${g.minuteApprox ? '~' : ''}${g.minute}${g.added ? '+' + g.added : ''}' ${event.playerName}${player ? '#' : ''}${g.assist ? ` (a ${event.assistPlayerName}${assist ? '#' : ''})` : ''}${g.penalty ? ' pen' : ''} [${g.side === 'ekhaya' ? 'EK' : 'OPP'}]`)
      }
      say(`${id} ${f.home} ${f.homeScore}-${f.awayScore} ${f.away}: ${parts.join('; ')}${ekGoals < clubScore ? ` (+${clubScore - ekGoals} Ekhaya goal(s) unknown)` : ''}`)
    }
    for (const fix of (data.fixNames || {})[id] || []) {
      const target = events.find((e) => e.kind === 'goal' && !e.playerName && !/ekhaya/i.test(e.team) && Math.abs(e.minute - fix.minute) <= 2)
      if (target && target.__ref) { batch.update(target.__ref, { playerName: fix.player }); target.playerName = fix.player; writes++; say(`${id}: opponent goal ${target.minute}' named ${fix.player}`) }
      else say(`${id}: no unnamed opponent goal near ${fix.minute}' (nothing changed)`)
    }
    const goals = buildGoals(events, f)
    batch.update(ref, { goals, ...(planned ? { scorersLoaded: true } : {}), updatedAt: FieldValue.serverTimestamp() }); writes++
  }
  batch.set(db.collection('publicData').doc('topScorers'), { ...data.goldenBoot, updatedAt: FieldValue.serverTimestamp() })
  writes++
  say(`Golden Boot list (${data.goldenBoot.players.length} players, as of ${data.goldenBoot.asOf})`)
  say(`Unknown scorers: ${data.unknown.join(' | ')}`)
  if (apply) { await batch.commit(); say(`SAVED ${writes} change(s).`) } else say(`PREVIEW only: ${writes} change(s) would be saved.`)
  flush()
}
main().catch((e) => { console.error(e); process.exit(1) })
