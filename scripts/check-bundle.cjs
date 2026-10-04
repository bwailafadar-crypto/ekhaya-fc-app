// Fails the build if the app grows past its size budget, so slow-loading
// changes are caught before fans on mobile data feel them.
//   npm run build && npm run check:bundle
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const BUDGET_KB = {
  appEntry: 60,        // index-*.js, gzipped: the app's own start-up code
  firstLoadTotal: 380, // every JS file needed to show Home, gzipped
  precacheTotal: 2600, // everything saved for offline use, raw
}
const dir = path.join(__dirname, '..', 'dist', 'assets')
if (!fs.existsSync(dir)) { console.error('No dist/ folder. Run npm run build first.'); process.exit(1) }
const gz = (file) => zlib.gzipSync(fs.readFileSync(path.join(dir, file))).length / 1024
const files = fs.readdirSync(dir)
const entry = files.find((f) => /^index-.*\.js$/.test(f))
const html = fs.readFileSync(path.join(__dirname, '..', 'dist', 'index.html'), 'utf8')
// Everything the page loads or preloads before it can show anything.
const firstLoad = [...new Set([...html.matchAll(/assets\/([^"']+\.js)/g)].map((m) => m[1]))].filter((f) => files.includes(f))
const sw = fs.existsSync(path.join(__dirname, '..', 'dist', 'sw.js')) ? fs.readFileSync(path.join(__dirname, '..', 'dist', 'sw.js'), 'utf8') : ''
const precacheKb = [...sw.matchAll(/url:"([^"]+)"/g)].map((m) => path.join(__dirname, '..', 'dist', m[1])).filter((f) => fs.existsSync(f)).reduce((sum, f) => sum + fs.statSync(f).size / 1024, 0)

const results = [
  ['App start-up code (gzip)', gz(entry), BUDGET_KB.appEntry],
  ['First load JS (gzip)', firstLoad.reduce((s, f) => s + gz(f), 0), BUDGET_KB.firstLoadTotal],
  ['Saved for offline (raw)', precacheKb, BUDGET_KB.precacheTotal],
]
let failed = false
for (const [label, kb, budget] of results) {
  const ok = kb <= budget
  if (!ok) failed = true
  console.log(`${ok ? '✔' : '✖'} ${label}: ${kb.toFixed(0)} KB (budget ${budget} KB)`)
}
if (!html.includes('id="root"')) { console.log('✖ index.html has no app root'); failed = true }
process.exit(failed ? 1 : 0)
