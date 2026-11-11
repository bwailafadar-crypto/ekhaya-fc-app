const os=require('node:os');const path=require('node:path');const fs=require('node:fs')
const {initializeApp,cert}=require('firebase-admin/app');const {getFirestore}=require('firebase-admin/firestore')
const kf=process.env.GOOGLE_APPLICATION_CREDENTIALS||path.join(os.homedir(),'ekhaya-keys','firebase-sa.json')
initializeApp({credential:cert(JSON.parse(fs.readFileSync(kf,'utf8')))});const db=getFirestore()
;(async()=>{
  for(const id of ['tracksuit-2026','polo-shirt-2026']){
    const d=(await db.collection('shopProducts').doc(id).get()).data()||{}
    console.log('::notice::'+id+' price='+d.price+' variants='+JSON.stringify(d.variants)+' personalisable='+d.personalisable+' group='+JSON.stringify(d.group)+' cat='+d.category)
  }
})().catch(e=>{console.log('::error::'+e.message);process.exit(1)})
