const os=require('node:os');const path=require('node:path');const fs=require('node:fs')
const {initializeApp,cert}=require('firebase-admin/app');const {getFirestore}=require('firebase-admin/firestore')
const kf=process.env.GOOGLE_APPLICATION_CREDENTIALS||path.join(os.homedir(),'ekhaya-keys','firebase-sa.json')
initializeApp({credential:cert(JSON.parse(fs.readFileSync(kf,'utf8')))});const db=getFirestore()
;(async()=>{
  const d=(await db.collection('publicData').doc('teams').get()).data()||{}
  const bytes=JSON.stringify(d).length
  console.log('::notice::publicData/teams disabled='+(d.disabled||false)+' reason='+(d.reason||'-')+' bytes='+bytes+' teamsInDoc='+(Array.isArray(d.teams)?d.teams.length:'none'))
})().catch(e=>{console.log('::error::'+e.message);process.exit(1)})
