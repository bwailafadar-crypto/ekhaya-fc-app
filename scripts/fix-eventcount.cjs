// Resyncs fixture.eventCount to the real number of events so End match works.
const os=require('node:os'),path=require('node:path'),fs=require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app'); const { getFirestore, FieldValue } = require('firebase-admin/firestore')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS||path.join(os.homedir(),'ekhaya-keys','firebase-sa.json'),'utf8'))) })
const db=getFirestore(); const note=(t)=>console.log(process.env.GITHUB_ACTIONS?`::notice::${t}`:t)
const FIX='2026-11-21-ekhaya-fc-v-civo-united'
;(async()=>{
  const evs=await db.collection('fixtures').doc(FIX).collection('events').get()
  const f=(await db.doc(`fixtures/${FIX}`).get()).data()
  note(`eventCount was ${f.eventCount}; real events = ${evs.size}`)
  await db.doc(`fixtures/${FIX}`).set({ eventCount: evs.size, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
  note(`eventCount set to ${evs.size}. End match will work now.`)
})().catch(e=>{console.log('::error::'+e.message);process.exit(1)})
