// Read-only: lists every Ekhaya TV video's title and current team. Changes nothing.
const os=require('node:os');const path=require('node:path');const fs=require('node:fs')
const {initializeApp,cert}=require('firebase-admin/app');const {getFirestore}=require('firebase-admin/firestore')
const kf=process.env.GOOGLE_APPLICATION_CREDENTIALS||path.join(os.homedir(),'ekhaya-keys','firebase-sa.json')
initializeApp({credential:cert(JSON.parse(fs.readFileSync(kf,'utf8')))});const db=getFirestore()
;(async()=>{
  const v=(await db.collection('videos').get()).docs.map(d=>({id:d.id,...d.data()}))
  console.log('::notice::'+v.length+' videos total')
  for(const r of v) console.log('::notice::['+(r.team||'men')+'] '+String(r.title||'').slice(0,90))
})().catch(e=>{console.log('::error::'+e.message);process.exit(1)})
