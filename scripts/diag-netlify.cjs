// Read-only: inspects the Netlify payment site's state so we can see why its
// functions aren't being served (password protection, deploy state, functions).
const API = 'https://api.netlify.com/api/v1'
const TOKEN = process.env.TOKEN
const h = { authorization: `Bearer ${TOKEN}` }
const note = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)
async function get(path) {
  const r = await fetch(API + path, { headers: h })
  const t = await r.text()
  if (!r.ok) throw new Error(`${path} -> ${r.status} ${t.slice(0, 120)}`)
  return t ? JSON.parse(t) : null
}
;(async () => {
  const sites = await get('/sites?filter=all&per_page=100')
  const site = sites.find((s) => ['ekhaya-pay', 'ekhaya-fc-pay', 'ekhayafc-pay'].includes(s.name))
  if (!site) { note('No pay site found'); return }
  note(`SITE: ${site.name} id=${site.id} ssl_url=${site.ssl_url}`)
  note(`PASSWORD set: ${Boolean(site.password)} | ssl: ${site.ssl} | force_ssl: ${site.force_ssl}`)
  note(`published_deploy: state=${site.published_deploy?.state} branch=${site.published_deploy?.branch} fns=${JSON.stringify(site.published_deploy?.available_functions || site.published_deploy?.functions || 'n/a').slice(0, 200)}`)
  const deploys = await get(`/sites/${site.id}/deploys?per_page=3`)
  deploys.forEach((d, i) => note(`deploy[${i}]: state=${d.state} fns=${(d.available_functions || []).map((f) => f.n || f.name || f).join(',').slice(0, 150) || 'none'} msg=${(d.title || '').slice(0, 60)}`))
})().catch((e) => { console.log('::error::' + e.message); process.exit(1) })
