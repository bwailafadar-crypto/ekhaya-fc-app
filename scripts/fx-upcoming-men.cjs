const os=require('node:os'),path=require('node:path'),fs=require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS||path.join(os.homedir(),'ekhaya-keys','firebase-sa.json'),'utf8'))) })
const db=getFirestore()
const note=(t)=>console.log(process.env.GITHUB_ACTIONS?`::notice::${t}`:t)
const isLeague=(c)=>!/airtel|castel|\bcup\b|top\s?8/i.test(String(c||''))
;(async()=>{
  const fx=(await db.collection('fixtures').get()).docs.map(d=>({id:d.id,...d.data()}))
    .filter(f=>!f.isTest&&(f.squad||'men')==='men'&&f.status==='upcoming')
    .sort((a,b)=>Date.parse(a.date)-Date.parse(b.date))
  note(`upcoming men fixtures: ${fx.length}`)
  for(const f of fx.slice(0,6)){const d=new Date(f.date);const day=d.toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short',year:'numeric',timeZone:'Africa/Blantyre'});note(`${isLeague(f.competition)?'LEAGUE':'CUP '} | ${day} | ${f.home} v ${f.away} | comp=${f.competition} | ${f.id}`)}
})().catch(e=>{console.log('::error::'+e.message);process.exit(1)})
