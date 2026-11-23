const os=require('node:os'),path=require('node:path'),fs=require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS||path.join(os.homedir(),'ekhaya-keys','firebase-sa.json'),'utf8'))) })
const db=getFirestore()
const note=(t)=>console.log(process.env.GITHUB_ACTIONS?`::notice::${t}`:t)
const WRITE=process.env.WRITE==='1'
const ID='2026-11-28-masters-fc-v-ekhaya-fc'
;(async()=>{
  const ref=db.doc(`fixtures/${ID}`); const s=await ref.get()
  if(!s.exists){note('fixture not found');return}
  const f=s.data()
  const oldDate=String(f.date||'')
  if(!oldDate.startsWith('2026-11-28')){note(`unexpected date ${oldDate} — aborting`);return}
  const newDate=oldDate.replace('2026-11-28','2026-11-29') // keep the time + zone
  note(`${f.home} v ${f.away}: ${oldDate} -> ${newDate}`)
  if(!WRITE){note('DRY RUN (WRITE=1 to save)');return}
  const patch={date:newDate,updatedAt:FieldValue.serverTimestamp()}
  if(f.kickoffAt){patch.kickoffAt=FieldValue.delete()} // scheduled only; recomputed from date
  await ref.set(patch,{merge:true})
  note('Saved. Match is now Sunday 29 Nov.')
})().catch(e=>{console.log('::error::'+e.message);process.exit(1)})
