// Deletes shop products by id. IDS="polo-shirt-2026" node scripts/delete-product.cjs
const os=require('node:os');const path=require('node:path');const fs=require('node:fs')
const {initializeApp,cert}=require('firebase-admin/app');const {getFirestore}=require('firebase-admin/firestore')
const kf=process.env.GOOGLE_APPLICATION_CREDENTIALS||path.join(os.homedir(),'ekhaya-keys','firebase-sa.json')
initializeApp({credential:cert(JSON.parse(fs.readFileSync(kf,'utf8')))});const db=getFirestore()
const out=(t)=>console.log(process.env.GITHUB_ACTIONS?`::notice::${t}`:t)
const ids=String(process.env.IDS||'').split(/[ ,]+/).filter(Boolean)
;(async()=>{
  if(!ids.length){console.log('::error::Set IDS');process.exit(1)}
  for(const id of ids){
    const ref=db.collection('shopProducts').doc(id)
    const was=(await ref.get()).exists
    await ref.delete()
    out(`${was?'Deleted':'Not found'}: ${id}`)
  }
})().catch(e=>{console.log('::error::'+e.message);process.exit(1)})
