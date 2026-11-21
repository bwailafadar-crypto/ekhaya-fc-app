// Adds one substitution event. Env: OFF, ON, MIN. node scripts/add-sub.cjs
const os=require('node:os'),path=require('node:path'),fs=require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const kf = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(),'ekhaya-keys','firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(kf,'utf8'))) })
const db = getFirestore()
const note=(t)=>console.log(process.env.GITHUB_ACTIONS?`::notice::${t}`:t)
const norm=(s)=>String(s||'').toLowerCase().replace(/[^a-z\s]/g,' ').replace(/\s+/g,' ').trim()
const FIX='2026-11-21-ekhaya-fc-v-civo-united'
const OFF=process.env.OFF, ON=process.env.ON, MIN=Number(process.env.MIN)
;(async()=>{
  const f=(await db.doc(`fixtures/${FIX}`).get()).data()
  const team=/ekhaya/i.test(f.home)?f.home:f.away
  const men=(await db.collection('players').get()).docs.filter(d=>(d.data().squad??'men')==='men')
  const find=(q)=>{const n=norm(q),t=n.split(' ').filter(w=>w.length>2); let h=men.find(d=>norm(d.data().name)===n); if(!h)h=men.find(d=>{const nt=norm(d.data().name).split(' ');return t.every(w=>nt.includes(w))}); return h}
  const off=find(OFF), on=find(ON)
  if(!off){note(`OFF not found: ${OFF}`);return}
  if(!on){note(`ON not found: ${ON}`);return}
  await db.collection('fixtures').doc(FIX).collection('events').add({ kind:'substitution', team, minute:MIN, subbedOutPlayerId:off.id, subbedOutPlayerName:off.data().name, subbedInPlayerId:on.id, subbedInPlayerName:on.data().name, createdAt:FieldValue.serverTimestamp() })
  note(`SUB ${MIN}': OFF ${off.data().name} -> ON ${on.data().name} (${team})`)
})().catch(e=>{console.log('::error::'+e.message);process.exit(1)})
