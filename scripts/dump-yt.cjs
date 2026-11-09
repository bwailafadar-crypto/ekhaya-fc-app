const os=require('node:os');const path=require('node:path');const fs=require('node:fs')
const {initializeApp,cert}=require('firebase-admin/app');const {getFirestore}=require('firebase-admin/firestore')
const kf=process.env.GOOGLE_APPLICATION_CREDENTIALS||path.join(os.homedir(),'ekhaya-keys','firebase-sa.json')
initializeApp({credential:cert(JSON.parse(fs.readFileSync(kf,'utf8')))});const db=getFirestore()
;(async()=>{
  const c=(await db.collection('tvConfig').doc('youtube').get()).data()||{}
  console.log('::notice::channel='+JSON.stringify(c.channel)+' channelId='+JSON.stringify(c.channelId)+' channelFor='+JSON.stringify(c.channelFor)+' channelTitle='+JSON.stringify(c.channelTitle)+' inFeed='+c.inFeed+' error='+JSON.stringify(c.error))
})().catch(e=>{console.log('::error::'+e.message);process.exit(1)})
