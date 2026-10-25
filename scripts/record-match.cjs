// Records an Ekhaya match from reports: the final score (if the match centre
// was not used) and the goalscorers (if the match has none yet).
//   MATCH="2026-11-01-mafco-v-ekhaya-fc" SCORE="0-2" \
//   GOALS="ekhaya|John Mchema|21|Blessings Malinda; ekhaya|Allen Chihana|70; opp|Pius Saka|62" \
//   node scripts/record-match.cjs [--apply]
// GOALS: side (ekhaya/opp) | scorer | minute (e.g. 45+2, or 1H/2H if only the half
// is known) | assist (optional) | pen (optional). Points/table are handled by
// add-results; player season stats are not changed here.
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
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '')

async function main() {
  const id = String(process.env.MATCH || '').trim()
  const ref = id ? db.collection('fixtures').doc(id) : null
  const snap = ref ? await ref.get() : null
  if (!snap || !snap.exists) {
    const list = (await db.collection('fixtures').get()).docs.map((d) => ({ id: d.id, ...d.data() })).filter((f) => !f.isTest && /ekhaya/i.test(`${f.home} ${f.away}`) && f.date >= new Date(Date.now() - 21 * 86400000).toISOString()).sort((a, b) => a.date.localeCompare(b.date))
    say(`No match "${id}". Recent/next Ekhaya match ids: ${list.slice(0, 8).map((f) => `${f.id} (${f.home} v ${f.away}, ${String(f.date).slice(0, 10)}, ${f.status})`).join(' | ')}`)
    process.exit(id ? 1 : 0)
  }
  const f = snap.data()
  const club = /ekhaya/i.test(f.home) ? f.home : f.away
  const opp = club === f.home ? f.away : f.home
  const update = {}
  const score = String(process.env.SCORE || '').match(/^(\d+)\s*[-–:]\s*(\d+)$/)
  if (score) {
    const [hs, as] = [Number(score[1]), Number(score[2])]
    if (f.status === 'finished') {
      if (f.homeScore !== hs || f.awayScore !== as) { say(`⚠ ${id} is already finished as ${f.homeScore}-${f.awayScore} but the report says ${hs}-${as}. Not changed: check it in the match centre.`); process.exit(1) }
      say(`${id}: already finished ${hs}-${as} (matches the report)`)
    } else if (new Date(f.date).getTime() > Date.now()) { say(`${id} has not been played yet (${f.date}). Not changed.`); process.exit(1) }
    else if (f.status === 'live') { say(`${id} is live in the match centre right now. Not changed.`); process.exit(1) }
    else { Object.assign(update, { status: 'finished', period: 'full-time', homeScore: hs, awayScore: as, statsApplied: false, statsSkipped: true, resultFromReports: true, finishedAt: FieldValue.serverTimestamp() }); say(`${id}: will be finished as ${f.home} ${hs}-${as} ${f.away}`) }
  }
  const finalHome = update.homeScore ?? f.homeScore
  const finalAway = update.awayScore ?? f.awayScore
  const players = (await db.collection('players').get()).docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p.team === 'senior')
  const findPlayer = (name) => players.find((p) => norm(p.name) === norm(name)) || players.find((p) => norm(p.name).endsWith(norm(String(name).split(' ').slice(-1)[0])) && norm(p.name)[0] === norm(name)[0])
  const existing = (await ref.collection('events').get()).docs.map((d) => d.data())
  const events = [...existing]
  const batch = db.batch()
  const lines = String(process.env.GOALS || '').split(';').map((l) => l.trim()).filter(Boolean)
  if (lines.length && existing.some((e) => e.kind === 'goal')) say(`${id}: already has goals in the app, scorers not added`)
  else if (lines.length) {
    const parsed = lines.map((line) => line.split('|').map((x) => x.trim()))
    const ek = parsed.filter((p) => /^ek/i.test(p[0])).length
    const clubScore = club === f.home ? finalHome : finalAway
    const oppScore = club === f.home ? finalAway : finalHome
    if (finalHome == null || ek > clubScore || parsed.length - ek > oppScore) { say(`${id}: more scorers than goals (${ek}-${parsed.length - ek} vs ${clubScore}-${oppScore}). Not saved.`); process.exit(1) }
    for (const [sideRaw, scorer, minuteRaw = '', assistName = '', pen = ''] of parsed) {
      const ours = /^ek/i.test(sideRaw)
      const half = minuteRaw.match(/^([12])h$/i)
      const m = minuteRaw.match(/^(\d{1,3})(?:\s*\+\s*(\d{1,2}))?/)
      const minute = half ? (half[1] === '1' ? 30 : 70) : m ? Number(m[1]) : 45
      const player = ours ? findPlayer(scorer) : null
      const assist = ours && assistName ? findPlayer(assistName) : null
      const event = {
        kind: 'goal', minute, team: ours ? club : opp, playerName: player?.name || scorer,
        ...(player ? { playerId: player.id } : {}), ...(assistName ? { assistPlayerName: assist?.name || assistName, ...(assist ? { assistPlayerId: assist.id } : {}) } : {}),
        ...(half || !m ? { minuteApprox: true } : {}), ...(m && m[2] ? { addedTime: Number(m[2]) } : {}), ...(/pen/i.test(pen) ? { penalty: true } : {}),
        source: 'match reports', createdAt: FieldValue.serverTimestamp(),
      }
      batch.set(ref.collection('events').doc(), event); events.push(event)
      say(`  goal ${minuteRaw || '?'} ${event.playerName}${player ? ' (squad)' : ''}${assistName ? `, assist ${event.assistPlayerName}` : ''} [${ours ? club : opp}]`)
    }
    update.scorersLoaded = true
  }
  const home = f.home
  update.goals = events.filter((e) => e.kind === 'goal').sort((a, b) => a.minute + (a.addedTime || 0) / 100 - (b.minute + (b.addedTime || 0) / 100)).map((e) => ({
    side: norm(e.team) === norm(home) ? 'home' : 'away', name: e.playerName || '', minute: e.minute,
    ...(e.playerId ? { playerId: e.playerId } : {}), ...(e.addedTime ? { added: e.addedTime } : {}), ...(e.minuteApprox ? { approx: true } : {}),
    ...(e.penalty ? { penalty: true } : {}), ...(e.assistPlayerName ? { assist: e.assistPlayerName } : {}), ...(e.assistPlayerId ? { assistId: e.assistPlayerId } : {}),
  }))
  batch.set(ref, { ...update, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
  if (apply) { await batch.commit(); say(`${id}: saved.`) } else say(`${id}: preview only, nothing saved.`)
}
main().catch((e) => { console.error(e); process.exit(1) })
