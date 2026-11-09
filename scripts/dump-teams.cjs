const os=require('node:os');const path=require('node:path');const fs=require('node:fs')
const {initializeApp,cert}=require('firebase-admin/app');const {getFirestore}=require('firebase-admin/firestore')
const kf=process.env.GOOGLE_APPLICATION_CREDENTIALS||path.join(os.homedir(),'ekhaya-keys','firebase-sa.json')
initializeApp({credential:cert(JSON.parse(fs.readFileSync(kf,'utf8')))});const db=getFirestore()
;(async()=>{
  const t=(await db.collection('teams').get()).docs.map(d=>`${d.id}|${(d.data().name||'').slice(0,22)}|logo:${d.data().logoDataUrl?'Y':'-'}`)
  console.log('::notice::'+t.length+' teams ||| '+t.join(' ||| '))
})().catch(e=>{console.log('::error::'+e.message);process.exit(1)})
