// Marks players injured or fit by name. NAMES="Kumwembe=in; Chizinga=in" where
// in/injured = injured, out/fit = fit. Each name matches one player's full name.
const os=require('node:os');const path=require('node:path');const fs=require('node:fs')
const {initializeApp,cert}=require('firebase-admin/app');const {getFirestore}=require('firebase-admin/firestore')
const apply=process.argv.includes('--apply')
const kf=process.env.GOOGLE_APPLICATION_CREDENTIALS||path.join(os.homedir(),'ekhaya-keys','firebase-sa.json')
initializeApp({credential:cert(JSON.parse(fs.readFileSync(kf,'utf8')))});const db=getFirestore()
const out=(t)=>console.log(process.env.GITHUB_ACTIONS?`::notice::${t}`:t)
;(async()=>{
  const want=String(process.env.NAMES||'').split(/[;,]/).map(p=>p.split('=').map(x=>x.trim())).filter(([n])=>n)
  if(!want.length)throw new Error('Set NAMES like "Kumwembe=in; Chizinga=in"')
  const players=(await db.collection('players').get()).docs.map(d=>({id:d.id,ref:d.ref,...d.data()}))
  let bad=0
  for(const [name,stateRaw] of want){
    const injured=/^(in|injured|hurt|yes|true)$/i.test(stateRaw||'in')
    const found=players.filter(p=>String(p.name||'').toLowerCase().includes(name.toLowerCase()))
    if(found.length!==1){out(`✖ ${name}: ${found.length} players match (${found.map(p=>p.name).join(', ')||'none'})`);bad++;continue}
    const p=found[0]
    out(`${apply?'✔':'•'} ${p.name}: ${injured?'INJURED':'fit'}`)
    if(apply)await p.ref.update({injured, updatedAt:new Date()})
  }
  if(!apply)out('Preview only. Add --apply to save.')
  if(bad)process.exit(1)
})().catch(e=>{console.log('::error::'+e.message);process.exit(1)})
