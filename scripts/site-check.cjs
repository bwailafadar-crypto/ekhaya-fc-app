// Robot check of the LIVE app (https://ekhaya-fc-app.web.app): a temporary
// test fan signs in, opens every fan page on a phone-sized screen and records
// crashes, error screens, console errors, blocked resources (security policy)
// and failed requests. Screenshots are saved. The test fan and everything it
// created are deleted at the end. Nothing else in the app is changed.
//   node scripts/site-check.cjs
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path'); const crypto = require('node:crypto')
const { initializeApp, cert } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { getFirestore, Timestamp } = require('firebase-admin/firestore')
const { chromium } = require('playwright')
const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyFile, 'utf8'))) })
const db = getFirestore(); const auth = getAuth()
const BASE = (process.env.SITE || 'https://ekhaya-fc-app.web.app').replace(/\/$/, '')

// App Check is enforced, so the robot mints a short-lived debug token, uses it,
// and deletes it at the end. Nothing is stored. (APP_ID from firebase config.)
const PROJECT = '655956402643' // project NUMBER (the App Check API wants the number, not the id)
const APP_ID = process.env.APPCHECK_APP_ID || '1:655956402643:web:509935744d655696964f26'
async function gcpToken() {
  const sa = JSON.parse(fs.readFileSync(keyFile, 'utf8'))
  const now = Math.floor(Date.now() / 1000)
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 600 })}`
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64url')
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }) })
  if (!r.ok) throw new Error(`gcp sign-in failed (${r.status})`)
  return (await r.json()).access_token
}
async function makeDebugToken() {
  const auth = `Bearer ${await gcpToken()}`
  const token = crypto.randomUUID()
  const url = `https://firebaseappcheck.googleapis.com/v1/projects/${PROJECT}/apps/${encodeURIComponent(APP_ID)}/debugTokens`
  const r = await fetch(url, { method: 'POST', headers: { authorization: auth, 'content-type': 'application/json' }, body: JSON.stringify({ displayName: `qa-robot ${new Date().toISOString().slice(0, 16)}`, token }) })
  if (!r.ok) throw new Error(`debug token create failed (${r.status})`)
  const body = await r.json()
  return { token: body.token || token, name: body.name, auth }
}
async function deleteDebugToken(name, auth) {
  if (!name) return
  await fetch(`https://firebaseappcheck.googleapis.com/v1/${name}`, { method: 'DELETE', headers: { authorization: auth } }).catch(() => undefined)
}
const OUT = path.resolve('site-check'); fs.mkdirSync(OUT, { recursive: true })
const problems = []; const notes = []
const say = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)

const PAGES = ['/', '/fixtures', '/results', '/table', '/live', '/squad', '/news', '/fanzone', '/community', '/competitions', '/membership', '/profile', '/more', '/tv', '/club', '/scorers', '/shop', '/shop/jersey-2026-gold', '/install']
const IGNORE = /requestStorageAccess|favicon|google-analytics|ERR_ABORTED|net::ERR_BLOCKED_BY_CLIENT|Failed to load resource: the server responded with a status of 400 \(\)|reCAPTCHA|recaptcha|AppCheck|appCheck|app-check|firebaseappcheck/i

async function main() {
  const email = `qa-robot-${Date.now()}@ekhaya-fc-app.test`
  const password = crypto.randomBytes(18).toString('base64url')
  const user = await auth.createUser({ email, password, emailVerified: true, displayName: 'Ekhaya QA check (automatic)' })
  const uid = user.uid
  // Profile dated in the past, so the superadmin does not get a "new fan joined" alert.
  const long = Timestamp.fromMillis(Date.parse('2020-01-01'))
  await db.collection('users').doc(uid).set({ role: 'fan', email, fullName: 'Ekhaya QA check (automatic)', phone: null, legacyFanDocId: null, legacyFanId: null, createdAt: long, updatedAt: long })
  let debug = { token: null, name: null, auth: null }
  try { debug = await makeDebugToken(); say('App Check debug token minted for this run') } catch (e) { notes.push(`App Check debug token unavailable: ${e.message.slice(0, 120)}`) }
  const browser = await chromium.launch()
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36 EkhayaQA' })
    if (debug.token) await ctx.addInitScript((t) => { self.FIREBASE_APPCHECK_DEBUG_TOKEN = t }, debug.token)
    await ctx.addInitScript(() => { try { localStorage.setItem('ekhaya-install-dismissed', '1') } catch {} ; document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP blocked ${e.violatedDirective}: ${e.blockedURI}`)) })
    const page = await ctx.newPage()
    let where = 'start'
    page.on('pageerror', (e) => problems.push(`${where}: crash: ${e.message.slice(0, 200)}`))
    page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.test(m.text())) problems.push(`${where}: console: ${m.text().slice(0, 200)}`) })
    page.on('response', async (r) => { if (r.status() === 403) { let body = ''; try { body = (await r.text()).slice(0, 160) } catch {} ; notes.push(`403 from ${r.url().split('?')[0].slice(0, 120)} ${body.replace(/\s+/g, ' ')}`) } })
    page.on('response', (r) => { const u = r.url(); if (r.status() >= 400 && !IGNORE.test(u) && (u.startsWith(BASE) || /googleapis|firebase|netlify|youtube|ytimg/.test(u))) problems.push(`${where}: HTTP ${r.status()} ${u.slice(0, 140)}`) })

    where = 'sign-in'
    await page.goto(`${BASE}/#/login`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => undefined)
    await page.fill('#login-email', email)
    await page.fill('#login-password', password)
    await page.locator('form button[type="submit"]').first().click()
    await page.waitForURL((u) => !String(u).includes('/login'), { timeout: 30000 }).catch(() => problems.push('sign-in: did not leave the sign-in page'))
    await page.waitForTimeout(3000)

    for (const p of PAGES) {
      where = p
      const t0 = Date.now()
      await page.goto(`${BASE}/#${p}`, { waitUntil: 'load', timeout: 60000 }).catch((e) => problems.push(`${p}: did not load (${e.message.slice(0, 80)})`))
      await page.waitForTimeout(4500)
      const text = await page.locator('body').innerText().catch(() => '')
      if (/Something went wrong|taking longer than usual/i.test(text)) problems.push(`${p}: shows an error screen: "${text.replace(/\s+/g, ' ').slice(0, 120)}"`)
      if (text.replace(/\s+/g, '').length < 40) problems.push(`${p}: page looks empty`)
      const counts = await page.evaluate(() => {
        const n = (sel) => document.querySelectorAll(sel).length
        return { matches: n('.match-card'), rows: n('table tbody tr'), cards: n('[class*="card"]'), products: n('.shop-card'), videos: n('.tv-card'), images: [...document.images].filter((i) => i.complete && i.naturalWidth > 0).length, brokenImages: [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.src && !i.src.startsWith('data:')).map((i) => i.src.slice(0, 80)) }
      }).catch(() => ({}))
      if (counts.brokenImages?.length) problems.push(`${p}: broken picture(s): ${counts.brokenImages.slice(0, 3).join(', ')}`)
      const main = (await page.locator('main').innerText().catch(() => text)).replace(/\s+/g, ' ').trim()
      notes.push(`${p} (${((Date.now() - t0) / 1000).toFixed(1)}s) "${main.slice(0, 70)}" matches ${counts.matches ?? 0}, table rows ${counts.rows ?? 0}, products ${counts.products ?? 0}, videos ${counts.videos ?? 0}, pictures ${counts.images ?? 0}`)
      await page.screenshot({ path: path.join(OUT, `${p.replace(/\W+/g, '_') || 'home'}.png`), fullPage: true }).catch(() => undefined)
    }
    // The match centre preview (form, head to head, season comparison).
    where = '/live (preview)'
    await page.goto(`${BASE}/#/live?tab=preview`, { waitUntil: 'load' }).catch(() => undefined); await page.waitForTimeout(4000)
    const pv = (await page.locator('.match-preview').innerText().catch(() => '')).replace(/\s+/g, ' ')
    if (!pv) problems.push('/live: the match preview did not show')
    else notes.push(`match centre preview: "${pv.slice(0, 260)}"`)
    await page.screenshot({ path: path.join(OUT, 'live_preview.png'), fullPage: true }).catch(() => undefined)
    // A video on Ekhaya TV opens inside the app.
    where = '/tv (play)'
    await page.goto(`${BASE}/#/tv`, { waitUntil: 'load' }).catch(() => undefined); await page.waitForTimeout(3000)
    const thumb = page.locator('.tv-thumb').first()
    if (await thumb.count()) { await thumb.click(); await page.waitForTimeout(3000); if (!(await page.locator('.video-player iframe').count())) problems.push('/tv: the video player did not open'); await page.screenshot({ path: path.join(OUT, 'tv_play.png') }) }
    else problems.push('/tv: no videos listed')
  } finally {
    await browser.close()
    await deleteDebugToken(debug.name, debug.auth)
    // Remove the test fan and anything it created.
    for (const col of ['users', 'activity', 'fanCards', 'deletionRequests', 'referrals']) await db.collection(col).doc(uid).delete().catch(() => undefined)
    for (const col of ['clientErrors', 'pushTokens', 'shopOrders']) { const s = await db.collection(col).where('uid', '==', uid).get(); for (const d of s.docs) await d.ref.delete() }
    await auth.deleteUser(uid).catch(() => undefined)
  }
  const unique = [...new Set(problems)]
  fs.writeFileSync(path.join(OUT, 'problems.txt'), unique.join('\n') || 'none')
  for (let i = 0; i < notes.length; i += 3) say(notes.slice(i, i + 3).join(' ||| '))
  say(unique.length ? `${unique.length} problem(s) found` : 'No problems found on any page')
  for (let i = 0; i < Math.min(unique.length, 40); i += 4) console.log(process.env.GITHUB_ACTIONS ? `::warning::${unique.slice(i, i + 4).join(' ||| ')}` : unique.slice(i, i + 4).join('\n'))
  if (unique.length) process.exitCode = 3
}
main().catch((e) => { console.error(e); process.exit(1) })
