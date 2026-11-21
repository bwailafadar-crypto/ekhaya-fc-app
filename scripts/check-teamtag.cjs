const os=require('node:os'),path=require('node:path'),fs=require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const kf = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(),'ekhaya-keys','firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(kf,'utf8'))) })
const db = getFirestore()
const note=(t)=>console.log(process.env.GITHUB_ACTIONS?`::notice::${t}`:t)
;(async()=>{
  const f=(await db.doc('fixtures/2026-11-21-ekhaya-fc-v-civo-united').get()).data()
  const players=(await db.collection('players').get()).docs
  const byId=new Map(players.map(d=>[d.id,d.data()]))
  const ids=[...(f.startingPlayerIds||[]),...(f.benchPlayerIds||[])]
  let senior=0,notSenior=0
  for(const id of ids){const p=byId.get(id); if(!p){note(`MISSING player doc: ${id}`);continue} const t=p.team??'(unset)'; if(t==='senior')senior++; else {notSenior++; note(`NOT senior: ${p.name} team=${t} squad=${p.squad??'(unset)'}`)}}
  note(`Lineup players team==='senior': ${senior} | NOT senior: ${notSenior} (of ${ids.length})`)
  // all men's players team tag distribution
  const men=players.filter(d=>(d.data().squad??'men')==='men')
  const dist={}; men.forEach(d=>{const t=d.data().team??'(unset)';dist[t]=(dist[t]||0)+1})
  note(`All men's players by team tag: ${JSON.stringify(dist)}`)
})().catch(e=>{console.log('::error::'+e.message);process.exit(1)})
