// Overwrites the men's league standings with the official table. node scripts/set-mens-table.cjs (WRITE=1)
// Source: Super League of Malawi official LOG TABLE — Week 21, Sat 28-11-2026.
// Form is NOT in the source graphic, so it is left untouched (existing value preserved).
const os=require('node:os'),path=require('node:path'),fs=require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app'); const { getFirestore, FieldValue } = require('firebase-admin/firestore')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS||path.join(os.homedir(),'ekhaya-keys','firebase-sa.json'),'utf8'))) })
const db=getFirestore(); const note=(t)=>console.log(process.env.GITHUB_ACTIONS?`::notice::${t}`:t)
const WRITE=process.env.WRITE==='1'
// id: [pos, P, W, D, L, GF, GA, PTS]
const T={
 'big-bullets':[1,20,13,6,1,30,9,45],
 'mighty-wanderers':[2,20,11,6,3,33,14,39],
 'silver-strikers':[3,20,11,6,3,28,13,39],
 'blue-eagles':[4,21,11,2,8,31,25,35],
 'mitundu-baptist':[5,21,7,9,5,20,17,30],
 'red-lions':[6,21,7,7,7,18,18,28],
 'chitipa-united':[7,20,8,4,8,14,20,28],
 'ekhaya-fc':[8,20,6,8,6,19,16,26],
 'masters-fc':[9,20,7,5,8,22,21,26],
 'moyale-barracks':[10,20,6,7,7,20,23,25],
 'civo-united':[11,21,6,6,9,12,18,24],
 'creck-sporting':[12,21,5,5,11,15,23,20],
 'dedza-dynamos':[13,20,4,8,8,13,25,20],
 'mafco':[14,20,5,4,11,14,24,19],
 'karonga-united':[15,21,4,7,10,18,32,19],
 'kamuzu-barracks':[16,20,4,6,10,17,25,18],
}
;(async()=>{
  const batch=db.batch(); let n=0
  for(const [id,[pos,P,W,D,L,GF,GA,PTS]] of Object.entries(T)){
    const ref=db.doc(`standings/${id}`); const snap=await ref.get()
    if(!snap.exists){note(`MISSING standings doc: ${id}`);continue}
    const prev=snap.data().position ?? pos
    const data={ position:pos, previousPosition:prev, played:P, won:W, drawn:D, lost:L, goalsFor:GF, goalsAgainst:GA, goalDifference:GF-GA, points:PTS, updatedAt:FieldValue.serverTimestamp() }
    note(`${pos}. ${snap.data().team}: P${P} ${W}-${D}-${L} ${GF}:${GA} GD${GF-GA} ${PTS}pts`)
    if(WRITE) batch.set(ref,data,{merge:true}); n++
  }
  if(WRITE){await batch.commit(); note(`Saved ${n} men's rows.`)} else note('DRY RUN (WRITE=1 to save)')
})().catch(e=>{console.log('::error::'+e.message);process.exit(1)})
