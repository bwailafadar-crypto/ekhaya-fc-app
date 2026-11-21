// Tags all men's squad players team:'senior' so the live match sees them.
const os=require('node:os'),path=require('node:path'),fs=require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const kf = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(),'ekhaya-keys','firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(kf,'utf8'))) })
const db = getFirestore()
const note=(t)=>console.log(process.env.GITHUB_ACTIONS?`::notice::${t}`:t)
;(async()=>{
  const men=(await db.collection('players').get()).docs.filter(d=>(d.data().squad??'men')==='men')
  const batch=db.batch(); let n=0
  for(const d of men){ if(d.data().team!=='senior'){ batch.set(d.ref,{team:'senior',updatedAt:FieldValue.serverTimestamp()},{merge:true}); n++ } }
  await batch.commit()
  note(`Tagged ${n} men's players team:'senior' (total men ${men.length}). Live sub form will now show them.`)
})().catch(e=>{console.log('::error::'+e.message);process.exit(1)})
