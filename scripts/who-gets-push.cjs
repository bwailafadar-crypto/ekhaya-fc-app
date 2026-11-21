// READ-ONLY: which fans a broadcast reaches (push token -> their profile name).
const os=require('node:os'),path=require('node:path'),fs=require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const kf = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(),'ekhaya-keys','firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(kf,'utf8'))) })
const db = getFirestore()
const note=(t)=>console.log(process.env.GITHUB_ACTIONS?`::notice::${t}`:t)
const iso=(t)=>t?.toDate?.().toISOString?.().slice(0,16)||'?'
;(async()=>{
  const tokens=(await db.collection('pushTokens').get()).docs
  const byUid={}
  for(const d of tokens){const x=d.data(); const u=x.uid||'?'; (byUid[u]=byUid[u]||[]).push(x)}
  note(`Fans reachable by broadcast: ${Object.keys(byUid).length} (${tokens.length} devices)`)
  let i=0
  for(const [uid,devs] of Object.entries(byUid)){
    i++
    const prof=await db.doc(`users/${uid}`).get().catch(()=>null)
    const name=prof&&prof.exists?(prof.data().fullName||'(no name)'):'(no profile)'
    const plats=devs.map(d=>d.platform||'?').join(', ')
    const seen=devs.map(d=>iso(d.updatedAt)).sort().slice(-1)[0]
    note(`${i}. ${name} — ${plats} — last active ${seen}`)
  }
})().catch(e=>{console.log('::error::'+e.message);process.exit(1)})
