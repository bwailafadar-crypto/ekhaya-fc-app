// Renumbers the women's league standings to 1..N (their own league), preserving
// current order. node scripts/renumber-women-table.cjs   (WRITE=1 to save)
const os=require('node:os'),path=require('node:path'),fs=require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const kf = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(),'ekhaya-keys','firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(kf,'utf8'))) })
const db = getFirestore()
const note=(t)=>console.log(process.env.GITHUB_ACTIONS?`::notice::${t}`:t)
const WRITE=process.env.WRITE==='1'
;(async()=>{
  const rows=(await db.collection('standings').get()).docs.filter(d=>d.data().squad==='women')
  // Order by points, then goal difference, then current position (keeps existing tiebreaks).
  rows.sort((a,b)=>{const x=a.data(),y=b.data(); return (y.points??y.pts??0)-(x.points??x.pts??0) || (y.goalDifference??y.gd??0)-(x.goalDifference??x.gd??0) || (y.goalsFor??0)-(x.goalsFor??0) || (x.position??999)-(y.position??999)})
  note(`Women's teams: ${rows.length}`)
  const batch=db.batch()
  rows.forEach((d,i)=>{const pos=i+1; const was=d.data().position; note(`${pos}. ${d.data().team} (${d.data().pts??d.data().points} pts, GD ${d.data().gd}) [was ${was}]`); if(WRITE)batch.set(d.ref,{position:pos,updatedAt:FieldValue.serverTimestamp()},{merge:true})})
  if(WRITE){await batch.commit(); note('Saved: women now numbered 1..'+rows.length)} else note('DRY RUN (WRITE=1 to save)')
})().catch(e=>{console.log('::error::'+e.message);process.exit(1)})
