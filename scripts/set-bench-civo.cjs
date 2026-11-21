// Sets the 9 subs for the Civil Service match (XI/formation untouched). node scripts/set-bench-civo.cjs
const os=require('node:os'),path=require('node:path'),fs=require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const kf = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(),'ekhaya-keys','firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(kf,'utf8'))) })
const db = getFirestore()
const note=(t)=>console.log(process.env.GITHUB_ACTIONS?`::notice::${t}`:t)
const norm=(s)=>String(s||'').toLowerCase().replace(/[^a-z\s]/g,' ').replace(/\s+/g,' ').trim()
const subs=['Joshua Waka','Hope Mustafa','Alick Lungu','Aubrey Simbi','John Banda','Joseph Saiwa','Kenneth Mwale','Hadji James','James Lumbe']
;(async()=>{
  const men=(await db.collection('players').get()).docs.filter(d=>(d.data().squad??'men')==='men')
  const find=(name)=>{const q=norm(name),qt=q.split(' ').filter(w=>w.length>2); let h=men.find(d=>norm(d.data().name)===q); if(!h)h=men.find(d=>{const nt=norm(d.data().name).split(' ');return qt.every(w=>nt.includes(w))}); if(!h){const ql=qt[qt.length-1],qf=qt[0];h=men.find(d=>{const nt=norm(d.data().name).split(' ');return nt.includes(ql)&&(nt.includes(qf)||nt[0]?.[0]===qf[0])})} return h}
  const res=subs.map(n=>{const h=find(n);return{n,id:h?.id||null,m:h?h.data().name:null}})
  for(const r of res) note(`${r.n} -> ${r.m||'NOT FOUND'}`)
  const miss=res.filter(r=>!r.id)
  if(miss.length){note(`Missing: ${miss.map(r=>r.n).join(', ')} — aborting`);return}
  const f=(await db.doc('fixtures/2026-11-21-ekhaya-fc-v-civo-united').get()).data()
  const xi=new Set(f.startingPlayerIds||[])
  const bench=res.map(r=>r.id).filter(id=>!xi.has(id))
  await db.doc('fixtures/2026-11-21-ekhaya-fc-v-civo-united').set({benchPlayerIds:bench,updatedAt:FieldValue.serverTimestamp()},{merge:true})
  note(`Bench set to ${bench.length} subs (XI & formation unchanged).`)
})().catch(e=>{console.log('::error::'+e.message);process.exit(1)})
