// Turns on Firebase Auth "email enumeration protection" (improved email
// privacy), so attackers cannot discover which emails have accounts: sign-in
// and reset return the same generic result whether or not the email exists.
// The app already shows one generic "email or password is incorrect" message,
// so fans see no difference. Uses the admin SDK (service account).
const os = require('node:os'); const path = require('node:path'); const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyFile, 'utf8'))) })
const out = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)
;(async () => {
  const mgr = getAuth().projectConfigManager()
  const before = await mgr.getProjectConfig()
  out(`Email enumeration protection was: ${before.emailPrivacyConfig?.enableImprovedEmailPrivacy ? 'ON' : 'OFF'}`)
  await mgr.updateProjectConfig({ emailPrivacyConfig: { enableImprovedEmailPrivacy: true } })
  const after = await mgr.getProjectConfig()
  out(`Email enumeration protection is now: ${after.emailPrivacyConfig?.enableImprovedEmailPrivacy ? 'ON ✔' : 'STILL OFF'}`)
})().catch((e) => { console.log(`::error::${e.message}`); process.exit(1) })
