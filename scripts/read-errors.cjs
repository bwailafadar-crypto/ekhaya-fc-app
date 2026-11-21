// READ-ONLY: recent client errors real fans hit. node scripts/read-errors.cjs
const os=require('node:os'),path=require('node:path'),fs=require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const kf = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(),'ekhaya-keys','firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(kf,'utf8'))) })
const db = getFirestore()
const note=(t)=>console.log(process.env.GITHUB_ACTIONS?`::notice::${t}`:t)
;(async()=>{
  const snap = await db.collection('clientErrors').orderBy('createdAt','desc').limit(40).get().catch(async()=>await db.collection('clientErrors').limit(40).get())
  note(`clientErrors total pulled: ${snap.size}`)
  const byMsg = {}
  for(const d of snap.docs){const x=d.data(); const when=x.createdAt?.toDate?.().toISOString?.().slice(0,16)||'?'; const key=`${x.context}: ${(x.message||'').slice(0,90)}`; byMsg[key]=(byMsg[key]||0)+1; if(snap.size<=40) note(`${when} [${x.env}] b${x.build} ${x.path} | ${x.context}: ${(x.message||'').slice(0,120)} (${x.code})`)}
  note('--- grouped ---')
  for(const [k,n] of Object.entries(byMsg).sort((a,b)=>b[1]-a[1])) note(`${n}x ${k}`)
})().catch(e=>{console.log('::error::'+e.message);process.exit(1)})
