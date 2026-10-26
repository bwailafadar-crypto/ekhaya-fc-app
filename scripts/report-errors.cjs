// Read-only: the errors fans' phones reported (clientErrors, as in Admin → App
// health), grouped by message and page, newest first. Nothing is changed.
//   DAYS=14 node scripts/report-errors.cjs
const os = require('node:os'); const path = require('node:path'); const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, Timestamp } = require('firebase-admin/firestore')
const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyFile, 'utf8'))) })
const db = getFirestore()
const days = Number(process.env.DAYS || 14)
const out = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t.replace(/\n/g, ' ')}` : t)
async function main() {
  const since = Timestamp.fromMillis(Date.now() - days * 86400000)
  const snap = await db.collection('clientErrors').where('createdAt', '>', since).get()
  const groups = new Map()
  for (const d of snap.docs) {
    const e = d.data()
    const key = `${e.context} | ${String(e.message).replace(/[0-9a-f]{8,}|\d{3,}/gi, '#').slice(0, 140)}`
    const g = groups.get(key) || { n: 0, paths: new Set(), builds: new Set(), envs: new Set(), agents: new Set(), last: 0, code: e.code, stack: e.stack }
    g.n++; g.paths.add(e.path); g.builds.add(e.build); g.envs.add(e.env); g.agents.add(/EkhayaFCApp/.test(e.agent) ? 'APK' : /Android/.test(e.agent) ? 'Android web' : /iPhone/.test(e.agent) ? 'iPhone' : 'Computer')
    g.last = Math.max(g.last, e.createdAt?.toMillis?.() ?? 0)
    groups.set(key, g)
  }
  out(`${snap.size} errors in the last ${days} days, ${groups.size} kinds`)
  const lines = [...groups.entries()].sort((a, b) => b[1].last - a[1].last).map(([k, g]) => `${g.n}× ${k} [code ${g.code}] pages: ${[...g.paths].slice(0, 4).join(', ')} · builds: ${[...g.builds].slice(-3).join(', ')} · ${[...g.agents].join('/')} · last ${new Date(g.last).toISOString().slice(0, 16)} · stack: ${String(g.stack || '').split('\n').slice(0, 2).join(' / ').slice(0, 160)}`)
  for (let i = 0; i < lines.length; i += 2) out(lines.slice(i, i + 2).join(' ||| '))
}
main().catch((e) => { console.error(e); process.exit(1) })
