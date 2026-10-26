// Finds or creates the Netlify payment site and stores its two secret
// settings (PayChangu key, Firebase key). Prints id and url for the next steps.
const fs = require('node:fs')
const API = 'https://api.netlify.com/api/v1'
const TOKEN = process.env.TOKEN
const h = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }
const out = (k, v) => fs.appendFileSync(process.env.GITHUB_OUTPUT || '/dev/null', `${k}=${v}\n`)
async function call(method, path, body) {
  const r = await fetch(API + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined })
  const text = await r.text()
  if (!r.ok) throw new Error(`${method} ${path.split('?')[0]} → ${r.status} ${text.slice(0, 200)}`)
  return text ? JSON.parse(text) : null
}
async function main() {
  const names = ['ekhaya-pay', 'ekhaya-fc-pay', 'ekhayafc-pay']
  const sites = await call('GET', '/sites?filter=all&per_page=100')
  let site = sites.find((s) => names.includes(s.name))
  if (!site) {
    for (const name of names) {
      try { site = await call('POST', '/sites', { name }); break } catch (e) { if (!/422|taken|unique/i.test(e.message)) throw e }
    }
  }
  if (!site) throw new Error('Could not create the payment site (all names taken).')
  const url = (site.ssl_url || site.url || `https://${site.name}.netlify.app`).replace(/\/$/, '')
  console.log(`::notice::Payment site: ${site.name} (${url})`)
  const account = site.account_id || site.account_slug
  const vars = [
    { key: 'PAYCHANGU_SECRET_KEY', value: process.env.PAYCHANGU_SECRET_KEY.trim() },
    { key: 'FIREBASE_SERVICE_ACCOUNT_JSON', value: JSON.stringify(JSON.parse(process.env.FIREBASE_SA)) },
    ...(process.env.PAYCHANGU_WEBHOOK_SECRET ? [{ key: 'PAYCHANGU_WEBHOOK_SECRET', value: process.env.PAYCHANGU_WEBHOOK_SECRET.trim() }] : []),
  ]
  const existing = await call('GET', `/accounts/${account}/env?site_id=${site.id}`).catch(() => [])
  for (const v of vars) {
    const body = { key: v.key, values: [{ value: v.value, context: 'all' }] }
    if (existing.some((e) => e.key === v.key)) await call('PUT', `/accounts/${account}/env/${v.key}?site_id=${site.id}`, body)
    else await call('POST', `/accounts/${account}/env?site_id=${site.id}`, [body])
    console.log(`::notice::Saved ${v.key} on the payment site`)
  }
  out('id', site.id); out('url', url)
}
main().catch((e) => { console.error(`::error::${e.message}`); process.exit(1) })
