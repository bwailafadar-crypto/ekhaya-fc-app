// Direct Firebase Hosting deploy (no firebase-tools needed).
// Uses the service account in ~/ekhaya-keys/firebase-sa.json, forces IPv4 and
// retries every network call, so a flaky connection doesn't break the upload.
//
//   npm run deploy:direct            -> build + upload + go live
//   npm run deploy:direct -- --dry-run   -> just list what would be uploaded
const dns = require('node:dns')
dns.setDefaultResultOrder('ipv4first')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const zlib = require('node:zlib')
const crypto = require('node:crypto')
const { spawnSync } = require('node:child_process')

const SITE = 'ekhaya-fc-app'
const ROOT = path.join(__dirname, '..')
const DIST = path.join(ROOT, 'dist')
const KEY_FILE = path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
const API = 'https://firebasehosting.googleapis.com/v1beta1'
const DRY = process.argv.includes('--dry-run')
const SKIP_BUILD = process.argv.includes('--skip-build')

const step = (msg) => console.log(`▶ ${msg}`)
const fail = (msg) => { console.error(`✖ ${msg}`); process.exit(1) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function withRetry(label, fn, tries = 10) {
  for (let i = 1; ; i++) {
    try { return await fn() } catch (err) {
      if (i >= tries || err.fatal) throw new Error(`${label}: ${err.message}`)
      console.log(`  ...${label} failed (${err.message}), retrying ${i}/${tries - 1}`)
      await sleep(Math.min(2000 * i, 15000))
    }
  }
}

const https = require('node:https')

// Plain https (IPv4 only, no shared keep-alive connections) is more forgiving
// on unstable networks than fetch.
function call(url, { method = 'GET', token, json, body, headers = {} } = {}) {
  const payload = json ? Buffer.from(JSON.stringify(json)) : body ? Buffer.from(body) : null
  const u = new URL(url)
  return new Promise((resolve, reject) => {
    const req = https.request({
      method, hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, family: 4, agent: false, timeout: 90000,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(json ? { 'Content-Type': 'application/json' } : {}),
        ...(payload ? { 'Content-Length': payload.length } : {}),
        Connection: 'close',
        ...headers,
      },
    }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(text ? JSON.parse(text) : {}) } catch { resolve({}) }
          return
        }
        const err = new Error(`HTTP ${res.statusCode} ${text.slice(0, 300)}`)
        if ([400, 401, 403, 404].includes(res.statusCode)) err.fatal = true
        reject(err)
      })
      res.on('error', reject)
    })
    req.on('timeout', () => req.destroy(new Error('timed out')))
    req.on('error', (e) => reject(new Error(e.code || e.message)))
    if (payload) req.write(payload)
    req.end()
  })
}

async function getToken(sa) {
  const now = Math.floor(Date.now() / 1000)
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/firebase',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64url')
  const res = await call('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }).toString(),
  })
  return res.access_token
}

function listFiles(dir, base = dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    const rel = '/' + path.relative(base, full).split(path.sep).join('/')
    if (rel.startsWith('/downloads/') || rel === '/downloads') continue
    if (entry.isDirectory()) out.push(...listFiles(full, base))
    else out.push({ rel, full })
  }
  return out
}

function hostingConfig() {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase.json'), 'utf8')).hosting
  return {
    rewrites: (cfg.rewrites || []).map((r) => ({ glob: r.source, path: r.destination })),
    headers: (cfg.headers || []).map((h) => ({
      glob: h.source,
      headers: Object.fromEntries(h.headers.map((x) => [x.key, x.value])),
    })),
  }
}

async function main() {
  if (!SKIP_BUILD && !DRY) {
    step('Building the app')
    const b = spawnSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit' })
    if (b.status !== 0) fail('Build failed')
  }
  if (!fs.existsSync(DIST)) fail('No dist folder. Run npm run build first.')

  step('Preparing files')
  const files = listFiles(DIST).map((f) => {
    const gz = zlib.gzipSync(fs.readFileSync(f.full), { level: 9 })
    return { ...f, gz, hash: crypto.createHash('sha256').update(gz).digest('hex') }
  })
  console.log(`  ${files.length} files`)
  if (DRY) {
    files.forEach((f) => console.log(`  ${f.rel}`))
    console.log(JSON.stringify(hostingConfig(), null, 2))
    return
  }

  if (!fs.existsSync(KEY_FILE)) fail(`Key not found: ${KEY_FILE}. Run: npm run save-firebase-key`)
  let sa
  try {
    sa = JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'))
    if (!sa.client_email || !sa.private_key) throw new Error('missing fields')
  } catch {
    // Never print the key itself, even partly.
    fail('The Firebase key is incomplete or not valid JSON. Copy the whole firebase-sa.json file (it starts with { and ends with }) and save it again.')
  }

  step('Signing in to Google')
  const token = await withRetry('Sign-in', () => getToken(sa))

  if (!process.argv.includes('--skip-rules')) {
    // Publish firestore.rules first, so the new app never runs against old rules.
    // A rules mistake stops the deploy here, before the website changes.
    step('Publishing database rules')
    const RULES_API = `https://firebaserules.googleapis.com/v1/projects/${SITE}`
    const content = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8')
    let ruleset
    try {
      ruleset = await withRetry('Upload rules', () =>
        call(`${RULES_API}/rulesets`, { method: 'POST', token, json: { source: { files: [{ name: 'firestore.rules', content }] } } }))
    } catch (err) {
      fail(`Database rules were not accepted: ${err.message}`)
    }
    await withRetry('Release rules', () =>
      call(`${RULES_API}/releases/cloud.firestore`, {
        method: 'PATCH', token,
        json: { release: { name: `projects/${SITE}/releases/cloud.firestore`, rulesetName: ruleset.name } },
      }))
    console.log('  rules are live')
  }

  step('Creating a new version')
  const version = await withRetry('Create version', () =>
    call(`${API}/sites/${SITE}/versions`, { method: 'POST', token, json: { config: hostingConfig() } }))

  step('Checking which files need uploading')
  const pop = await withRetry('Populate files', () =>
    call(`${API}/${version.name}:populateFiles`, {
      method: 'POST', token, json: { files: Object.fromEntries(files.map((f) => [f.rel, f.hash])) },
    }))
  const needed = new Set(pop.uploadRequiredHashes || [])
  const toUpload = files.filter((f) => needed.has(f.hash))
  console.log(`  ${toUpload.length} new or changed, ${files.length - toUpload.length} already on the server`)

  step('Uploading')
  let done = 0
  const queue = [...toUpload]
  await Promise.all(Array.from({ length: 1 }, async () => {
    while (queue.length) {
      const f = queue.shift()
      await withRetry(`Upload ${f.rel}`, () =>
        call(`${pop.uploadUrl}/${f.hash}`, {
          method: 'POST', token, body: f.gz, headers: { 'Content-Type': 'application/octet-stream' },
        }))
      done++
      console.log(`  \u2714 ${f.rel} (${done}/${toUpload.length})`)
    }
  }))

  step('Finalising')
  await withRetry('Finalise', () =>
    call(`${API}/${version.name}?update_mask=status`, { method: 'PATCH', token, json: { status: 'FINALIZED' } }))

  step('Going live')
  await withRetry('Release', () =>
    call(`${API}/sites/${SITE}/releases?versionName=${encodeURIComponent(version.name)}`, { method: 'POST', token, json: {} }))

  console.log(`✔ Deploy complete! https://${SITE}.web.app`)
}

main().catch((err) => fail(`${err.message}\n  Tip: run it again; files already sent are skipped. If it keeps failing, switch to your phone hotspot and retry.`))
