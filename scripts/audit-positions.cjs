// READ-ONLY: compares each men's player's stored position to the intended one
// from the FDH sheet. node scripts/audit-positions.cjs
const os = require('node:os'); const path = require('node:path'); const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const kf = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(kf, 'utf8'))) })
const db = getFirestore()
const note = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()
// intended enum per player (sheet-derived; Rukura corrected to DEF per the club)
const intended = {"amos sande":"GK","clever mkungula":"GK","joshua waka":"GK","lucky tizola":"GK","charles mafaiti":"DEF","happy mphepo":"DEF","fanizo mwansambo":"DEF","mudrick salomu":"DEF","andrew lameck":"DEF","josephy mcdonald":"DEF","joseph saiwa":"DEF","aubrey simbi":"DEF","hermas masinja":"DEF","alick lungu":"DEF","samuel rukura":"DEF","vincent salawira":"MID","moses banda":"MID","hadji james":"MID","isaiah nyirenda":"MID","blessings malinda":"MID","limbani kutambe":"MID","alfred chizinga":"MID","levison mnyenyembe":"FWD","james lumbe":"FWD","wongani kaponya":"FWD","gift magola":"FWD","allen chihana":"FWD","george mateyo":"FWD","chimwemwe chunga":"FWD","james stambuli":"FWD","gift chunga":"FWD","davie juao":"FWD"}
;(async () => {
  const men = (await db.collection('players').get()).docs.filter((d) => (d.data().squad ?? 'men') === 'men')
  let mism = 0
  for (const d of men) {
    const n = norm(d.data().name), cur = d.data().position || '(none)', want = intended[n]
    if (want && cur !== want) { note(`MISMATCH ${d.data().name}: stored ${cur} -> should be ${want}`); mism++ }
    else if (!want) note(`NOT ON SHEET ${d.data().name}: stored ${cur} (left as-is)`)
  }
  note(mism ? `${mism} position mismatches found.` : 'All sheet players have the intended position.')
})().catch((e) => { console.log('::error::' + e.message); process.exit(1) })
