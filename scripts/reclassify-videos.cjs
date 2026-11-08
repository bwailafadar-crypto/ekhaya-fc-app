// One-time: re-sorts every existing Ekhaya TV video into Men's or Women's by its
// title, using the same rule as the YouTube sync. Run after changing the rule.
const os=require('node:os');const path=require('node:path');const fs=require('node:fs')
const {initializeApp,cert}=require('firebase-admin/app');const {getFirestore}=require('firebase-admin/firestore')
const kf=process.env.GOOGLE_APPLICATION_CREDENTIALS||path.join(os.homedir(),'ekhaya-keys','firebase-sa.json')
initializeApp({credential:cert(JSON.parse(fs.readFileSync(kf,'utf8')))});const db=getFirestore()
const apply=process.argv.includes('--apply')
const out=(t)=>console.log(process.env.GITHUB_ACTIONS?`::notice::${t}`:t)
function guessTeam(title){return /wome|lad(?:y|ies)|girls?|female|queens?|\bw\.?f\.?c\b/i.test(String(title))?'women':'men'}
;(async()=>{
  const v=(await db.collection('videos').get()).docs
  let moved=0
  const batch=db.batch()
  for(const d of v){const t=d.data();const want=guessTeam(t.title);if((t.team||'men')!==want){moved++;out(`${apply?'✔':'•'} → ${want}: ${String(t.title).slice(0,70)}`);if(apply)batch.set(d.ref,{team:want},{merge:true})}}
  if(apply&&moved)await batch.commit()
  out(`${apply?'Done.':'Preview only.'} ${moved} video(s) ${apply?'moved':'would move'}; ${v.length} total.`)
})().catch(e=>{console.log(`::error::${e.message}`);process.exit(1)})
