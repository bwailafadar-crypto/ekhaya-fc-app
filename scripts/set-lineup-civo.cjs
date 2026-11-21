// Sets the men's starting XI + subs for Ekhaya FC v Civil Service United (today).
// node scripts/set-lineup-civo.cjs
const os=require('node:os'),path=require('node:path'),fs=require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const kf = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(),'ekhaya-keys','firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(kf,'utf8'))) })
const db = getFirestore()
const note=(t)=>console.log(process.env.GITHUB_ACTIONS?`::notice::${t}`:t)
const norm=(s)=>String(s||'').toLowerCase().replace(/[^a-z\s]/g,' ').replace(/\s+/g,' ').trim()
const WRITE = process.env.WRITE === '1'

const starting=['Clever Mkungula','Hermas Masinja','Samuel Rukura','Happy Mphepo','Charles Mafaiti','Moses Banda','Chimwemwe Chunga','Isaiah Nyirenda','John Mchema','Allen Chihana','Blessings Malinda']
const subs=['Joshua Waka','Hope Mustafa','Alick Lungu','Aubrey Simbi','John Banda','Joseph Saiwa','Kenneth Mwale','Hadji James','James Lumbe']
const FIXTURE='2026-11-21-ekhaya-fc-v-civo-united'
const FORMATION='4-3-3'

;(async()=>{
  const men=(await db.collection('players').get()).docs.filter(d=>(d.data().squad??'men')==='men')
  const find=(name)=>{
    const q=norm(name), qt=q.split(' ').filter(w=>w.length>2)
    let hit=men.find(d=>norm(d.data().name)===q)
    if(!hit) hit=men.find(d=>{const nt=norm(d.data().name).split(' '); return qt.every(w=>nt.includes(w))}) // all query words present (Kenneth Mwale -> Kenneth Maino Mwale)
    if(!hit){const ql=qt[qt.length-1], qf=qt[0]; hit=men.find(d=>{const nt=norm(d.data().name).split(' '); return nt.includes(ql)&&(nt.includes(qf)||nt[0]?.[0]===qf[0])})}
    return hit
  }
  const resolve=(list)=>list.map(n=>{const h=find(n); return {name:n, id:h?.id||null, matched:h?h.data().name:null}})
  const S=resolve(starting), B=resolve(subs)
  for(const r of S) note(`XI  ${r.name} -> ${r.matched||'*** NOT FOUND ***'}`)
  for(const r of B) note(`SUB ${r.name} -> ${r.matched||'*** NOT FOUND ***'}`)
  const missS=S.filter(r=>!r.id), missB=B.filter(r=>!r.id)
  note(`Matched XI: ${S.filter(r=>r.id).length}/11 | subs: ${B.filter(r=>r.id).length}/${subs.length}`)
  if(missS.length){note(`Cannot set XI: unmatched starters -> ${missS.map(r=>r.name).join(', ')}`); return}
  if(missB.length) note(`Unmatched subs (left out): ${missB.map(r=>r.name).join(', ')}`)
  if(!WRITE){note('DRY RUN (set WRITE=1 to save).'); return}
  const ref=db.doc(`fixtures/${FIXTURE}`)
  const snap=await ref.get()
  if(!snap.exists){note(`Fixture ${FIXTURE} not found`); return}
  await ref.set({ startingPlayerIds:S.map(r=>r.id), benchPlayerIds:B.filter(r=>r.id).map(r=>r.id), formation:FORMATION, lineupConfirmed:true, updatedAt:FieldValue.serverTimestamp() },{merge:true})
  note(`Lineup saved to ${FIXTURE}: XI 11, subs ${B.filter(r=>r.id).length}, formation ${FORMATION}, confirmed.`)
})().catch(e=>{console.log('::error::'+e.message);process.exit(1)})
