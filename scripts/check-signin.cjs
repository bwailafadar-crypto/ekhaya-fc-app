// Finds out why fans cannot sign in. READ-ONLY unless you ask for a reset link.
// Uses the service account saved by `npm run save-firebase-key`.
//   node scripts/check-signin.cjs                 -> summary of every account (emails hidden)
//   node scripts/check-signin.cjs fan@email.com   -> everything about one fan
//   node scripts/check-signin.cjs fan@email.com --reset-link
//        -> also makes a password reset link you can send the fan on WhatsApp
const os = require('node:os')
require('node:dns').setDefaultResultOrder('ipv4first')
const path = require('node:path')
const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { getFirestore } = require('firebase-admin/firestore')

const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
if (!fs.existsSync(keyFile)) { console.error('Firebase key not found. Run `npm run save-firebase-key` first.'); process.exit(1) }
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyFile, 'utf8'))) })
const auth = getAuth()
const db = getFirestore()

const hide = (email = '') => email.replace(/^(.{2}).*(@.*)$/, '$1***$2')
const providers = (user) => user.providerData.map((p) => (p.providerId === 'password' ? 'email+password' : p.providerId === 'google.com' ? 'Google' : p.providerId)).join(' + ') || 'none'
const when = (text) => (text ? new Date(text).toLocaleString() : 'never')

async function oneFan(email, wantLink) {
  const clean = email.trim().toLowerCase()
  console.log(`\nChecking ${clean}\n`)
  let user
  try { user = await auth.getUserByEmail(clean) } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error
    const legacy = await db.collection('fans').where('email', '==', clean).limit(1).get()
    console.log('✖ NO APP ACCOUNT with this email.')
    console.log(legacy.empty ? '  Not on the old member list either.' : `  But they ARE on the old member list (Fan ID ${legacy.docs[0].get('fanId') ?? '—'}).`)
    console.log('  → The fan must tap "Create account" in the app, using exactly this email.')
    console.log('    (Check the spelling with them: a typo in the email is the most common cause.)')
    return
  }
  const profile = await db.collection('users').doc(user.uid).get()
  console.log(`✔ App account found (created ${when(user.metadata.creationTime)})`)
  console.log(`  Signs in with: ${providers(user)}`)
  console.log(`  Last sign-in:  ${when(user.metadata.lastSignInTime)}`)
  console.log(`  Email confirmed: ${user.emailVerified ? 'yes' : 'NO (they can sign in, but cannot vote/predict until they confirm)'}`)
  console.log(`  Account switched off in Firebase: ${user.disabled ? 'YES ✖' : 'no'}`)
  console.log(`  App profile: ${profile.exists ? `yes (role ${profile.get('role')}${profile.get('disabled') ? ', BLOCKED by the club ✖' : ''})` : 'MISSING (created automatically at next sign-in)'}`)
  console.log('\nWhat to do:')
  if (user.disabled) console.log('  • The account is switched off in Firebase → Authentication. Turn it back on there.')
  else if (profile.get('disabled')) console.log('  • The club blocked this fan (Admin → Fans → Unblock) if that was a mistake.')
  else if (!user.providerData.some((p) => p.providerId === 'password')) console.log('  • This fan joined with Google, so there is no password. Tap "Continue with Google" or send a reset link to set a password.')
  else console.log('  • The account is fine, so the password is wrong. Send the fan a reset link (run again with --reset-link) or ask them to tap "Forgot password?".')
  if (wantLink) {
    const link = await auth.generatePasswordResetLink(clean)
    console.log('\nPassword reset link (send ONLY to this fan; it works once and expires in about an hour):\n')
    console.log(link)
  }
}

async function summary() {
  let next
  const all = []
  do { const page = await auth.listUsers(1000, next); all.push(...page.users); next = page.pageToken } while (next)
  const profiles = new Set((await db.collection('users').select().get()).docs.map((doc) => doc.id))
  const count = (test) => all.filter(test).length
  const day = 24 * 3600 * 1000
  console.log(`\nApp accounts: ${all.length}`)
  console.log(`  email + password: ${count((u) => u.providerData.some((p) => p.providerId === 'password'))}`)
  console.log(`  Google:           ${count((u) => u.providerData.some((p) => p.providerId === 'google.com'))}`)
  console.log(`  email not confirmed yet: ${count((u) => !u.emailVerified)}`)
  console.log(`  switched off in Firebase: ${count((u) => u.disabled)}`)
  console.log(`  signed in during the last 24 hours: ${count((u) => u.metadata.lastSignInTime && Date.now() - new Date(u.metadata.lastSignInTime) < day)}`)
  console.log(`  without an app profile: ${count((u) => !profiles.has(u.uid))}`)
  const legacy = await db.collection('fans').get()
  const emails = new Set(all.map((u) => (u.email ?? '').toLowerCase()))
  const notJoined = legacy.docs.filter((doc) => doc.get('email') && !emails.has(String(doc.get('email')).toLowerCase()))
  console.log(`\nOld member list: ${legacy.size} members, ${notJoined.length} of them have NOT created an app account yet.`)
  if (notJoined.length) console.log(`  e.g. ${notJoined.slice(0, 5).map((doc) => hide(doc.get('email'))).join(', ')}${notJoined.length > 5 ? ', …' : ''}`)
  console.log('  → These fans must tap "Create account" once (same email). Their membership links automatically.')
  console.log('\nTo check one fan: node scripts/check-signin.cjs their@email.com')
}

const email = process.argv.slice(2).find((arg) => arg.includes('@'))
;(email ? oneFan(email, process.argv.includes('--reset-link')) : summary())
  .then(() => process.exit(0))
  .catch((error) => { console.error('✖', error.message); process.exit(1) })
