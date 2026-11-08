// Read-only: prints each team's stored position and points from the live
// standings and the shared fan snapshot, to spot any mismatch. Changes nothing.
const os=require('node:os');const path=require('node:path');const fs=require('node:fs')
const {initializeApp,cert}=require('firebase-admin/app');const {getFirestore}=require('firebase-admin/firestore')
const kf=process.env.GOOGLE_APPLICATION_CREDENTIALS||path.join(os.homedir(),'ekhaya-keys','firebase-sa.json')
initializeApp({credential:cert(JSON.parse(fs.readFileSync(kf,'utf8')))});const db=getFirestore()
;(async()=>{
  const live=(await db.collection('standings').get()).docs.map(d=>({id:d.id,...d.data()}))
  live.sort((a,b)=>(a.position??0)-(b.position??0))
  console.log('::notice::LIVE standings: '+live.map(r=>`${r.position}.${r.team.split(' ')[0]}(${r.points})`).join(' '))
  const snap=(await db.doc('publicData/snapshot').get()).data()
  const sStand=snap?.standings
  if(Array.isArray(sStand)){sStand.sort((a,b)=>(a.position??0)-(b.position??0));console.log('::notice::SNAPSHOT standings: '+sStand.map(r=>`${r.position}.${r.team.split(' ')[0]}(${r.points})`).join(' '))}
  else console.log('::notice::snapshot standings not found at tried paths')
})().catch(e=>{console.log('::error::'+e.message);process.exit(1)})
