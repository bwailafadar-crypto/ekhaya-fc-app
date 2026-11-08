// Reads or sets Firebase App Check enforcement for a service, via the App Check
// REST API, using the service account. MODE=report prints current state;
// MODE=enforce / MODE=unenforce change it. SERVICE defaults to Firestore.
//   MODE=report node scripts/set-appcheck.cjs
//   MODE=enforce SERVICE=firestore.googleapis.com node scripts/set-appcheck.cjs
const os=require('node:os');const path=require('node:path');const fs=require('node:fs');const crypto=require('node:crypto')
const PROJECT='ekhaya-fc-app'
const SERVICE=process.env.SERVICE||'firestore.googleapis.com'
const MODE=(process.env.MODE||'report').toLowerCase()
const kf=process.env.GOOGLE_APPLICATION_CREDENTIALS||path.join(os.homedir(),'ekhaya-keys','firebase-sa.json')
const sa=JSON.parse(fs.readFileSync(kf,'utf8'))
const out=(t)=>console.log(process.env.GITHUB_ACTIONS?`::notice::${t}`:t)
async function token(){
  const now=Math.floor(Date.now()/1000)
  const b64=(o)=>Buffer.from(JSON.stringify(o)).toString('base64url')
  const unsigned=`${b64({alg:'RS256',typ:'JWT'})}.${b64({iss:sa.client_email,scope:'https://www.googleapis.com/auth/cloud-platform',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+600})}`
  const sig=crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key,'base64url')
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:`${unsigned}.${sig}`})})
  if(!r.ok)throw new Error(`sign-in failed (${r.status}) ${await r.text()}`)
  return (await r.json()).access_token
}
;(async()=>{
  const auth={authorization:`Bearer ${await token()}`}
  const base=`https://firebaseappcheck.googleapis.com/v1/projects/${PROJECT}/services/${SERVICE}`
  const cur=await fetch(base,{headers:auth})
  if(!cur.ok)throw new Error(`cannot read App Check config (${cur.status}): ${(await cur.text()).slice(0,200)}`)
  const now=await cur.json()
  out(`${SERVICE}: current enforcement = ${now.enforcementMode||'UNENFORCED (default)'}`)
  if(MODE==='report')return
  const target=MODE==='enforce'?'ENFORCED':'UNENFORCED'
  const patch=await fetch(`${base}?updateMask=enforcementMode`,{method:'PATCH',headers:{...auth,'content-type':'application/json'},body:JSON.stringify({enforcementMode:target})})
  if(!patch.ok)throw new Error(`could not set enforcement (${patch.status}): ${(await patch.text()).slice(0,200)}`)
  out(`${SERVICE}: enforcement is now = ${(await patch.json()).enforcementMode}`)
})().catch(e=>{console.log(`::error::${e.message}`);process.exit(1)})
