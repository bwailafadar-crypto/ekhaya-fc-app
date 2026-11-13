// Read-only check against PayChangu with the live key: validates the key and
// lists the real mobile-money operator ref IDs, so we can compare them to the
// ones hardcoded in the app. Never logs the key.
const API = 'https://api.paychangu.com'
const h = { authorization: `Bearer ${process.env.PAYCHANGU_SECRET_KEY}`, 'content-type': 'application/json', accept: 'application/json' }
const note = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)
const HARDCODED = { airtel: '20be6c20-adeb-4b5b-a7ba-0769820df4fb', mpamba: '27494cb5-ba9e-437f-a114-4e7a7686bcca' }

async function tryGet(path) {
  try {
    const r = await fetch(API + path, { headers: h })
    const t = await r.text()
    return { ok: r.ok, status: r.status, body: t }
  } catch (e) { return { ok: false, status: 0, body: String(e.message) } }
}
;(async () => {
  for (const path of ['/mobile-money', '/mobile-money/operators', '/mobile_money']) {
    const res = await tryGet(path)
    note(`GET ${path} -> ${res.status} ${res.body.slice(0, 300)}`)
    if (res.ok) {
      try {
        const j = JSON.parse(res.body)
        const ops = j.data || j.operators || j
        if (Array.isArray(ops)) ops.forEach((o) => note(`  operator: name=${o.name || o.short_code} ref_id=${o.ref_id || o.id}`))
      } catch { /* non-json */ }
    }
  }
  note(`HARDCODED in app: airtel=${HARDCODED.airtel} mpamba=${HARDCODED.mpamba}`)
})().catch((e) => { console.log('::error::' + e.message); process.exit(1) })
