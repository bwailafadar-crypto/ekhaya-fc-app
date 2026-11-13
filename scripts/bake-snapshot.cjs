// Writes the shared fan data (fixtures, league table, teams) into the built
// site as static JSON files: dist/data/snapshot.json and dist/data/teams.json.
// Fans load these over the CDN with ZERO database reads, then the app quietly
// reconciles with the live Firestore snapshot (see src/data/publicSnapshot.ts),
// so the static file is a fast, read-free first paint and an offline fallback.
//
// Runs in the deploy after `npm run build`, before the hosting upload, so the
// JSON ships with the site. Firestore Timestamps are stored as {"__ts__": ms}
// markers and turned back into real Timestamps by the app, keeping the shape
// identical to the live path (the match clock and alerts call .toMillis()).
//   node scripts/bake-snapshot.cjs
const fs = require('node:fs')
const path = require('node:path')
const { collect, db, size } = require('./publish-snapshot.cjs')

// Deep-convert admin Timestamp objects to a JSON-safe marker.
function encode(value) {
  if (value && typeof value === 'object') {
    if (typeof value.toMillis === 'function') return { __ts__: value.toMillis() }
    if (Array.isArray(value)) return value.map(encode)
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = encode(v)
    return out
  }
  return value
}

async function bake() {
  const store = db()
  const { snapshot, teams } = await collect(store)
  const outDir = path.join(__dirname, '..', 'dist', 'data')
  fs.mkdirSync(outDir, { recursive: true })
  const stamp = Date.now().toString(36)
  const write = (name, payload) => {
    const doc = { ...encode(payload), hash: `static-${stamp}`, bytes: size(payload), source: 'static', bakedAt: Date.now() }
    fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(doc))
  }
  write('snapshot', snapshot)
  write('teams', teams)
  console.log(`Baked fan data: ${snapshot.fixtures.length} fixtures, ${snapshot.standings.length} table rows, ${teams.teams.length} teams.`)
}

if (require.main === module) {
  bake().catch((error) => { console.error('Bake failed:', error.message); process.exit(1) })
}

module.exports = { bake }
