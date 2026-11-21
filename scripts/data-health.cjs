// READ-ONLY: freshness of news, standings, fixtures, public snapshot.
const os=require('node:os'),path=require('node:path'),fs=require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const kf = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(),'ekhaya-keys','firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(kf,'utf8'))) })
const db = getFirestore()
const note=(t)=>console.log(process.env.GITHUB_ACTIONS?`::notice::${t}`:t)
const iso=(t)=>t?.toDate?.().toISOString?.().slice(0,16)||'?'
;(async()=>{
  const news=await db.collection('news').orderBy('createdAt','desc').limit(5).get().catch(e=>({docs:[],err:e.message}))
  note(`NEWS: ${news.docs?.length??0} recent`)
  for(const d of (news.docs||[])){const x=d.data();note(`  [${x.status}] "${(x.title||'').slice(0,50)}" created ${iso(x.createdAt)} updated ${iso(x.updatedAt)}`)}
  const st=await db.collection('standings').get().catch(e=>({docs:[]}))
  note(`STANDINGS docs: ${st.docs.length}`)
  let newest=null; for(const d of st.docs){const u=d.data().updatedAt; if(u&&(!newest||u.toMillis()>newest.toMillis()))newest=u}
  note(`  standings newest update: ${iso(newest)}`)
  const pub=await db.collection('publicData').get().catch(e=>({docs:[]}))
  note(`publicData docs: ${pub.docs.length}`)
  for(const d of pub.docs)note(`  publicData/${d.id} updated ${iso(d.data().updatedAt)} (${JSON.stringify(Object.keys(d.data())).slice(0,80)})`)
  // appConfig flags
  const flags=await db.doc('appConfig/flags').get().catch(e=>null)
  if(flags&&flags.exists)note(`appConfig/flags keys: ${JSON.stringify(flags.data().flags||{})}`.slice(0,300))
})().catch(e=>{console.log('::error::'+e.message);process.exit(1)})
