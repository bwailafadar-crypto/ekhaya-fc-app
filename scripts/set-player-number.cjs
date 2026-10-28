// Sets players' shirt numbers in the live squad.
//   NUMBERS="Mchema=30; Maino=37" node scripts/set-player-number.cjs [--apply]
// Each name is matched against the player's full name (one player must match).
// Refuses a number another senior-team player already wears.
const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const apply = process.argv.includes('--apply')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'))) })
const db = getFirestore()
const out = (t) => console.log(`::notice::${t}`)
;(async () => {
  const wanted = String(process.env.NUMBERS || '').split(/[;,]/).map((p) => p.split('=').map((x) => x.trim())).filter(([n, v]) => n && v)
  if (!wanted.length) throw new Error('Set NUMBERS like "Mchema=30; Maino=37"')
  const players = (await db.collection('players').get()).docs.map((d) => ({ id: d.id, ref: d.ref, ...d.data() }))
  let bad = 0
  for (const [name, value] of wanted) {
    const number = Number(value)
    if (!Number.isInteger(number) || number < 1 || number > 99) { out(`✖ ${name}: "${value}" is not a shirt number`); bad++; continue }
    const found = players.filter((p) => String(p.name || '').toLowerCase().includes(name.toLowerCase()))
    if (found.length !== 1) { out(`✖ ${name}: ${found.length} players match (${found.map((p) => p.name).join(', ') || 'none'})`); bad++; continue }
    const p = found[0]
    const clash = players.find((o) => o.id !== p.id && Number(o.number) === number && (o.team || 'senior') === (p.team || 'senior'))
    if (clash) { out(`✖ ${p.name}: number ${number} is already worn by ${clash.name}`); bad++; continue }
    out(`${apply ? '✔' : '•'} ${p.name}: ${p.number ?? 'no number'} → ${number}`)
    if (apply) await p.ref.update({ number, updatedAt: new Date() })
  }
  if (!apply) out('Preview only. Nothing changed.')
  if (bad) process.exit(1)
})().catch((e) => { console.log(`::error::${e.message}`); process.exit(1) })
