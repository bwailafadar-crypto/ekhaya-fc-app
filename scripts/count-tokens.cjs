// READ-ONLY: how many devices can receive a push, by platform + prefs.
const os=require('node:os'),path=require('node:path'),fs=require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const kf = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(),'ekhaya-keys','firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(kf,'utf8'))) })
const db = getFirestore()
const note=(t)=>console.log(process.env.GITHUB_ACTIONS?`::notice::${t}`:t)
;(async()=>{
  const snap=await db.collection('pushTokens').get()
  note(`TOTAL push devices (reachable by broadcast): ${snap.size}`)
  const plat={}, uids=new Set(); let matchOn=0,newsOn=0
  for(const d of snap.docs){const x=d.data(); plat[x.platform||'?']=(plat[x.platform||'?']||0)+1; if(x.uid)uids.add(x.uid); if(x.prefs?.match)matchOn++; if(x.prefs?.news)newsOn++}
  note(`By platform: ${JSON.stringify(plat)}`)
  note(`Unique fans: ${uids.size} | match-alerts on: ${matchOn} | news-alerts on: ${newsOn}`)
  const users=await db.collection('users').count().get().catch(()=>null)
  if(users)note(`Registered user accounts total: ${users.data().count}`)
})().catch(e=>{console.log('::error::'+e.message);process.exit(1)})
