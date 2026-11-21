// Posts a 'Team news' story listing the confirmed starting XI. node scripts/post-xi-story.cjs
const os=require('node:os'),path=require('node:path'),fs=require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore')
const kf = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(),'ekhaya-keys','firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(kf,'utf8'))) })
const db = getFirestore()
const note=(t)=>console.log(process.env.GITHUB_ACTIONS?`::notice::${t}`:t)
const FIXTURE='2026-11-21-ekhaya-fc-v-civo-united'
const surname=(n)=>{const p=String(n||'').trim().split(/\s+/); return p[p.length-1]||n}
;(async()=>{
  const fx=await db.doc(`fixtures/${FIXTURE}`).get()
  if(!fx.exists){note('fixture not found');return}
  const f=fx.data()
  const ids=f.startingPlayerIds||[]
  if(ids.length!==11){note(`XI has ${ids.length} players, expected 11`);return}
  const players=(await db.collection('players').get()).docs
  const nameById=new Map(players.map(d=>[d.id,d.data().name]))
  const names=ids.map(id=>nameById.get(id)||id)
  const form=f.formation||'4-3-3'
  const lines=form.split('-').map(Number) // e.g. [4,3,3]
  const sur=names.map(surname)
  // group: GK, then by formation lines
  let i=1; const groups=[sur[0]]
  for(const n of lines){groups.push(sur.slice(i,i+n).join(', ')); i+=n}
  const opp=/ekhaya/i.test(f.home)?f.away:f.home
  const caption=`XI v ${opp} (${form}) — ${groups.join('; ')}`.slice(0,160)
  const ref=db.collection('stories').doc()
  await ref.set({ caption, label:'Team news', thumb:null, hasImage:false, path:`/live?match=${FIXTURE}&tab=lineups`, createdAt:FieldValue.serverTimestamp(), expiresAt:Timestamp.fromMillis(Date.now()+24*3600000), by:'admin' })
  note(`Posted story: ${caption}`)
})().catch(e=>{console.log('::error::'+e.message);process.exit(1)})
