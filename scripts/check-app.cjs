// FULL HEALTH CHECK of the live app. READ-ONLY: changes nothing.
// Uses the service account saved by `npm run save-firebase-key`.
//   node scripts/check-app.cjs
// Prints ✔ (fine), ⚠ (worth a look) or ✖ (broken) for each area, then a list of
// what to fix. Paste the output to Claude; emails are partly hidden.
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { getFirestore } = require('firebase-admin/firestore')

const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
if (!fs.existsSync(keyFile)) { console.error('Firebase key not found. Run `npm run save-firebase-key` first.'); process.exit(1) }
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyFile, 'utf8'))) })
const auth = getAuth()
const db = getFirestore()
const SITE = 'https://ekhaya-fc-app.web.app'
const official = require(path.resolve('ekhaya-data.json'))

const todo = []
const ok = (text) => console.log(`  ✔ ${text}`)
const warn = (text, fix) => { console.log(`  ⚠ ${text}`); if (fix) todo.push(`⚠ ${fix}`) }
const bad = (text, fix) => { console.log(`  ✖ ${text}`); if (fix) todo.push(`✖ ${fix}`) }
const head = (title) => console.log(`\n${title}`)
const hide = (email = '') => String(email).replace(/^(.{2}).*(@.*)$/, '$1***$2')
const ms = (value) => (value?.toMillis ? value.toMillis() : value ? new Date(value).getTime() : 0)
const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 60 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago` }
const DAY = 86400000
const safe = async (label, work) => { try { await work() } catch (error) { bad(`${label}: ${error.message}`) } }

async function site() {
  head('1. LIVE WEBSITE')
  const started = Date.now()
  const response = await fetch(`${SITE}/`, { headers: { 'Cache-Control': 'no-cache' } })
  const html = await response.text()
  const took = Date.now() - started
  response.ok ? ok(`${SITE} answers (${response.status}) in ${took} ms`) : bad(`${SITE} answered ${response.status}`, 'The website is not answering correctly. Re-run the Deploy workflow.')
  html.includes('only light') ? ok('White-and-gold lock is live (phones in dark mode stay light)') : warn('The dark-mode fix is not in the live page yet', 'Re-run Deploy so the dark-mode fix goes live.')
  const script = /src="(\/assets\/index-[^"]+\.js)"/.exec(html)?.[1]
  if (script) {
    const js = await fetch(`${SITE}${script}`)
    js.ok ? ok(`App code loads (${Math.round(Number(js.headers.get('content-length') || 0) / 1024) || '?'} KB start-up file)`) : bad('The app code file does not load', 'Re-run Deploy.')
  }
  const sw = await fetch(`${SITE}/sw.js`)
  sw.ok ? ok('Offline support (service worker) is published') : warn('No service worker found')
}

async function accounts() {
  head('2. SIGN-IN ACCOUNTS')
  let next
  const all = []
  do { const page = await auth.listUsers(1000, next); all.push(...page.users); next = page.pageToken } while (next)
  const profiles = new Map((await db.collection('users').get()).docs.map((doc) => [doc.id, doc.data()]))
  const count = (test) => all.filter(test).length
  ok(`${all.length} accounts (${count((u) => u.providerData.some((p) => p.providerId === 'password'))} email+password, ${count((u) => u.providerData.some((p) => p.providerId === 'google.com'))} Google)`)
  const recent = count((u) => u.metadata.lastSignInTime && Date.now() - new Date(u.metadata.lastSignInTime) < DAY)
  recent ? ok(`${recent} signed in during the last 24 hours`) : warn('Nobody has signed in during the last 24 hours', 'Nobody signed in for 24 hours: test signing in yourself.')
  const newToday = count((u) => Date.now() - new Date(u.metadata.creationTime) < DAY)
  ok(`${newToday} new account(s) in the last 24 hours`)
  const unverified = count((u) => !u.emailVerified)
  unverified ? warn(`${unverified} fan(s) have not confirmed their email (they can sign in, but cannot vote, predict or check in)`) : ok('Every fan has confirmed their email')
  const off = all.filter((u) => u.disabled)
  off.length ? bad(`${off.length} account(s) are switched off in Firebase: ${off.slice(0, 5).map((u) => hide(u.email)).join(', ')}`, 'Some accounts are switched off in Firebase → Authentication. Turn them back on if that was a mistake.') : ok('No accounts switched off')
  const blocked = [...profiles.values()].filter((p) => p.disabled)
  blocked.length ? warn(`${blocked.length} fan(s) blocked by the club in Admin → Fans`) : ok('No fans blocked by the club')
  const noProfile = count((u) => !profiles.has(u.uid))
  noProfile ? warn(`${noProfile} account(s) have no app profile yet (made automatically at their next sign-in)`) : ok('Every account has an app profile')
  const roles = [...profiles.values()].reduce((acc, p) => ({ ...acc, [p.role]: (acc[p.role] ?? 0) + 1 }), {})
  ok(`Roles: ${Object.entries(roles).map(([role, n]) => `${n} ${role}`).join(', ')}`)
  const legacy = await db.collection('fans').get()
  const emails = new Set(all.map((u) => (u.email ?? '').toLowerCase()))
  const notJoined = legacy.docs.filter((doc) => doc.get('email') && !emails.has(String(doc.get('email')).toLowerCase()))
  if (legacy.size) notJoined.length ? warn(`${notJoined.length} of ${legacy.size} old club members have no app account yet (e.g. ${notJoined.slice(0, 3).map((d) => hide(d.get('email'))).join(', ')})`, `${notJoined.length} old members must tap "Create account" once with the same email — tell them on WhatsApp.`) : ok('All old club members have app accounts')
}

async function errors() {
  head('3. ERRORS FROM FANS\' PHONES (last 7 days)')
  const since = new Date(Date.now() - 7 * DAY)
  const snap = await db.collection('clientErrors').where('createdAt', '>=', since).get()
  if (!snap.size) { ok('No errors reported'); return }
  const groups = new Map()
  snap.docs.forEach((doc) => {
    const e = doc.data()
    const key = `${e.context} | ${e.code || ''} ${String(e.message).slice(0, 120)}`
    const g = groups.get(key) ?? { n: 0, last: 0, path: e.path, build: e.build, agent: e.agent }
    g.n += 1; g.last = Math.max(g.last, ms(e.createdAt)); groups.set(key, g)
  })
  const sorted = [...groups.entries()].sort((a, b) => b[1].n - a[1].n)
  warn(`${snap.size} error report(s), ${groups.size} different problem(s):`, 'Errors from fans\' phones are listed in section 3 — send them to Claude.')
  sorted.slice(0, 12).forEach(([key, g]) => console.log(`      ${g.n}× ${key}\n         page ${g.path} · version ${g.build} · last ${ago(g.last)} · ${String(g.agent).slice(0, 60)}`))
}

async function data() {
  head('4. CLUB DATA')
  const fixtures = (await db.collection('fixtures').get()).docs.map((d) => ({ id: d.id, ...d.data() }))
  const real = fixtures.filter((f) => !f.isTest)
  ok(`${real.length} fixtures (${real.filter((f) => f.status === 'finished').length} played, ${real.filter((f) => f.status === 'upcoming').length} upcoming)`)
  const tests = fixtures.filter((f) => f.isTest)
  tests.length ? warn(`${tests.length} practice match(es) still saved (only admins see them)`, 'Delete leftover practice matches on the Live page.') : ok('No leftover practice matches')
  const live = real.filter((f) => f.status === 'live')
  live.forEach((f) => (f.editing ? warn(`${f.home} v ${f.away} is open in EDIT mode`, `Finish editing ${f.home} v ${f.away}: tap Save changes on the Live page.`) : Date.now() - ms(f.kickoffAt) > 4 * 3600000 ? bad(`${f.home} v ${f.away} is still LIVE (kick-off ${ago(ms(f.kickoffAt))})`, `${f.home} v ${f.away} was never ended: open Live and tap Full-time.`) : ok(`LIVE now: ${f.home} ${f.homeScore ?? 0}–${f.awayScore ?? 0} ${f.away}`)))
  const stale = real.filter((f) => f.status === 'upcoming' && Date.now() - ms(f.date) > 6 * 3600000)
  stale.length ? warn(`${stale.length} match(es) are in the past but still "upcoming": ${stale.slice(0, 4).map((f) => `${f.home} v ${f.away} (${String(f.date).slice(0, 10)})`).join('; ')}`, 'Past matches still marked upcoming: enter their results (Admin → Fixtures) or play them on Live.') : ok('Every past match has a result')
  const next = real.filter((f) => f.status === 'upcoming' && ms(f.date) > Date.now()).sort((a, b) => ms(a.date) - ms(b.date))[0]
  next ? ok(`Next match: ${next.home} v ${next.away}, ${new Date(next.date).toLocaleString('en-GB', { timeZone: 'Africa/Blantyre' })} CAT${next.lineupConfirmed ? ' (XI confirmed)' : ''}`) : warn('No upcoming fixture', 'No upcoming fixture: add the next matches.')

  const standings = (await db.collection('standings').get()).docs.map((d) => ({ id: d.id, ...d.data() }))
  const mismatch = official.standings.filter((row) => { const live = standings.find((s) => s.id === row.id); return !live || live.points !== row.points || live.played !== row.played })
  mismatch.length ? warn(`League table differs from the official one for ${mismatch.length} team(s) (e.g. ${mismatch.slice(0, 3).map((r) => r.team).join(', ')})`, 'Run Actions → Update league table → mode "apply" to load the official table.') : ok(`League table matches the official table (${standings.length} teams)`)
  const ek = standings.find((s) => s.id === 'ekhaya-fc')
  const nth = (n) => `${n}${[11, 12, 13].includes(n % 100) ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
  if (ek) ok(`Ekhaya FC: ${nth(ek.position)}, ${ek.points} pts from ${ek.played} games`)

  const players = (await db.collection('players').get()).docs.map((d) => d.data())
  const miss = (test) => players.filter(test).length
  const gaps = [`${miss((p) => !p.photoDataUrl)} photos`, `${miss((p) => !p.position)} positions`, `${miss((p) => p.number == null)} numbers`, `${miss((p) => !p.dob)} birthdays`]
  miss((p) => !p.photoDataUrl || !p.position || p.number == null) ? warn(`Squad of ${players.length}: missing ${gaps.join(', ')}`, 'Fill in the squad in Admin → Players → Squad sheet (photos, positions, numbers).') : ok(`Squad of ${players.length} is complete`)
  const teams = (await db.collection('teams').get()).docs.map((d) => d.data())
  const noLogo = teams.filter((t) => !t.logoDataUrl).length
  noLogo ? warn(`${noLogo} of ${teams.length} teams have no logo (initials are shown)`) : ok('Every team has a logo')
  const news = (await db.collection('news').get()).docs.map((d) => d.data())
  ok(`${news.filter((n) => n.status === 'published').length} published news article(s) in the app, ${news.filter((n) => n.status !== 'published').length} draft(s)`)
}

async function shared() {
  head('5. FAN DATA SPEED (shared snapshot)')
  const snap = await db.collection('publicData').doc('snapshot').get()
  if (!snap.exists) { warn('The shared fan snapshot does not exist (fans read slower, more data)', 'Run Deploy (it rebuilds the shared snapshot).'); return }
  const age = Date.now() - ms(snap.get('updatedAt'))
  const size = Buffer.byteLength(JSON.stringify(snap.data()))
  ok(`Snapshot updated ${ago(Date.now() - age)}, ${Math.round(size / 1024)} KB`)
  size > 800000 ? warn('Snapshot is close to the 1 MB limit') : ok('Snapshot size is fine')
}

async function features() {
  head('6. FEATURES')
  const flags = await db.collection('appConfig').doc('flags').get()
  const off = Object.entries(flags.get('flags') ?? {}).filter(([, on]) => on === false).map(([name]) => name)
  off.length ? warn(`Switched off in App health: ${off.join(', ')}`) : ok('All feature switches on')
  if (flags.get('notice')) ok(`Club notice showing: "${flags.get('notice')}"`)
  const github = await db.collection('adminConfig').doc('github').get()
  github.get('token') ? ok('Push alerts are set up (GitHub key saved)') : bad('Push alerts are NOT set up (no GitHub key)', 'Save the GitHub key in Admin → Fan Zone → Push alerts, or fans get no goal alerts.')
  const tokens = await db.collection('pushTokens').get()
  const follows = tokens.docs.reduce((n, d) => n + (d.get('follows')?.length ?? 0), 0)
  ok(`${tokens.size} phone(s) receive alerts${follows ? `, ${follows} player follow(s)` : ''}`)
  const now = new Date()
  const stories = await db.collection('stories').where('expiresAt', '>', now).get()
  ok(`${stories.size} story/stories showing on Home now`)
  const old = await db.collection('stories').where('expiresAt', '<=', now).get()
  if (old.size > 20) warn(`${old.size} expired stories are still stored (fans never download them)`)
  const videos = await db.collection('videos').get()
  videos.size ? ok(`${videos.size} video(s) on Ekhaya TV`) : warn('Ekhaya TV has no videos yet', 'Add videos on Ekhaya TV → Add video (paste Facebook/YouTube links).')
  const photos = await db.collection('matchPhotos').get()
  ok(`${photos.size} match photo(s) in galleries`)
  const club = await db.collection('clubInfo').doc('history').get()
  club.get('story') ? ok('Club story is written') : warn('Club & honours page has no story yet', 'Write the club story: More → Club & honours → Edit.')
  const board = await db.collection('leaderboard').doc('fans').get()
  board.exists ? ok(`Fan points board: ${board.get('totalFans') ?? 0} fans, updated ${ago(ms(board.get('updatedAt')))}`) : warn('Fan points have never been calculated', 'Tap Admin → Fan Zone → Recalculate leaderboard once.')
  const tiers = await db.collection('membershipTiers').get()
  const pending = await db.collection('memberships').where('status', '==', 'pending').get()
  ok(`${tiers.size} membership tier(s), ${pending.size} pending request(s)`)
  if (pending.size) todo.push(`⚠ ${pending.size} membership request(s) waiting in Admin → Membership requests.`)
}

async function main() {
  console.log(`EKHAYA FC APP — HEALTH CHECK  (${new Date().toLocaleString('en-GB', { timeZone: 'Africa/Blantyre' })} CAT)`)
  await safe('Website check failed', site)
  await safe('Accounts check failed', accounts)
  await safe('Error log check failed', errors)
  await safe('Data check failed', data)
  await safe('Snapshot check failed', shared)
  await safe('Feature check failed', features)
  console.log(`\nTO DO (${todo.length})`)
  console.log(todo.length ? todo.map((item) => `  ${item}`).join('\n') : '  Nothing — everything looks healthy. ✔')
}

main().then(() => process.exit(0)).catch((error) => { console.error('Check failed:', error.message); process.exit(1) })
