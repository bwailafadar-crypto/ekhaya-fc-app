// Puts the live site back to an earlier release (one click from GitHub Actions →
// "Roll back the app"). STEPS=1 means the release before the current one.
// The database rules are not changed; the next push to master goes live as normal.
const crypto = require('node:crypto')
const SITE = 'ekhaya-fc-app'
const API = 'https://firebasehosting.googleapis.com/v1beta1'
const sa = JSON.parse(require('node:fs').readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'))
const steps = Math.max(1, Math.min(10, Number(process.env.STEPS || 1)))

async function token() {
  const now = Math.floor(Date.now() / 1000)
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 600 })}`
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64url')
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }) })
  if (!r.ok) throw new Error(`sign-in failed (${r.status})`)
  return (await r.json()).access_token
}

;(async () => {
  const auth = { authorization: `Bearer ${await token()}` }
  const r = await fetch(`${API}/sites/${SITE}/releases?pageSize=50`, { headers: auth })
  if (!r.ok) throw new Error(`could not list releases (${r.status})`)
  const releases = ((await r.json()).releases || []).filter((x) => x.type !== 'SITE_DISABLE' && x.version?.name)
  // Distinct versions, newest first (an earlier rollback re-uses an old version).
  const versions = []
  for (const x of releases) if (!versions.some((v) => v.name === x.version.name)) versions.push({ name: x.version.name, at: x.releaseTime })
  const target = versions[steps]
  if (!target) throw new Error(`there are only ${versions.length} releases to go back to`)
  console.log(`Current: ${versions[0].name.split('/').pop()} (${versions[0].at})`)
  console.log(`Going back to: ${target.name.split('/').pop()} (${target.at})`)
  const go = await fetch(`${API}/sites/${SITE}/releases?versionName=${encodeURIComponent(target.name)}`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ message: `Rollback ${steps} step(s)` }) })
  if (!go.ok) throw new Error(`rollback failed (${go.status})`)
  console.log(`::notice::Live site rolled back to the release from ${target.at}`)
})().catch((e) => { console.log(`::error::${e.message}`); process.exit(1) })
