// Overwrites the men's league standings with the official table. node scripts/set-mens-table.cjs (WRITE=1)
const os=require('node:os'),path=require('node:path'),fs=require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app'); const { getFirestore, FieldValue } = require('firebase-admin/firestore')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS||path.join(os.homedir(),'ekhaya-keys','firebase-sa.json'),'utf8'))) })
const db=getFirestore(); const note=(t)=>console.log(process.env.GITHUB_ACTIONS?`::notice::${t}`:t)
const WRITE=process.env.WRITE==='1'
// form given latest-first; app stores oldest-first -> reverse.
const rev=(s)=>s.split('').reverse()
// id: [pos, P, W, D, L, GF, GA, PTS, formLatestFirst]
const T={
 'big-bullets':[1,19,12,6,1,28,8,42,'WWWWW'],
 'mighty-wanderers':[2,19,11,6,2,32,12,39,'WDWWL'],
 'silver-strikers':[3,20,11,6,3,28,13,39,'WDWLL'],
 'blue-eagles':[4,20,11,2,7,31,24,35,'DLWLW'],
 'chitipa-united':[5,20,8,4,8,14,20,28,'LDLWD'],
 'ekhaya-fc':[6,20,6,8,6,19,16,26,'DLWDW'],
 'masters-fc':[7,19,7,5,7,21,19,26,'LDWLD'],
 'mitundu-baptist':[8,19,6,8,5,17,16,26,'DWDDD'],
 'red-lions':[9,20,6,7,7,15,17,25,'WLLDD'],
 'moyale-barracks':[10,20,6,7,7,20,23,25,'WDLLW'],
 'civo-united':[11,20,6,5,9,11,17,23,'DDLDL'],
 'dedza-dynamos':[12,20,4,8,8,13,25,20,'LLDDW'],
 'mafco':[13,20,5,4,11,14,24,19,'WWLLL'],
 'karonga-united':[14,19,4,6,9,17,29,18,'LDLWD'],
 'kamuzu-barracks':[15,19,4,5,10,17,25,17,'WDDLL'],
 'creck-sporting':[16,20,4,5,11,14,23,17,'LDWLW'],
}
;(async()=>{
  const batch=db.batch(); let n=0
  for(const [id,[pos,P,W,D,L,GF,GA,PTS,form]] of Object.entries(T)){
    const ref=db.doc(`standings/${id}`); const snap=await ref.get()
    if(!snap.exists){note(`MISSING standings doc: ${id}`);continue}
    const prev=snap.data().position ?? pos
    const data={ position:pos, previousPosition:prev, played:P, won:W, drawn:D, lost:L, goalsFor:GF, goalsAgainst:GA, goalDifference:GF-GA, points:PTS, form:rev(form), updatedAt:FieldValue.serverTimestamp() }
    note(`${pos}. ${snap.data().team}: P${P} ${W}-${D}-${L} ${GF}:${GA} GD${GF-GA} ${PTS}pts`)
    if(WRITE) batch.set(ref,data,{merge:true}); n++
  }
  if(WRITE){await batch.commit(); note(`Saved ${n} men's rows.`)} else note('DRY RUN (WRITE=1 to save)')
})().catch(e=>{console.log('::error::'+e.message);process.exit(1)})
