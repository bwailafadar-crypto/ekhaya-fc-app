// Makes the Netlify payment site publicly reachable by turning OFF Netlify's
// SSO login gate for this site (the account defaults it ON for every site).
// The payment endpoints keep their own Firebase sign-in checks, so the API is
// not unprotected — it just stops redirecting the app to a Netlify login page.
const API = 'https://api.netlify.com/api/v1'
const h = { authorization: `Bearer ${process.env.TOKEN}`, 'content-type': 'application/json' }
const note = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)
async function call(method, path, body) {
  const r = await fetch(API + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined })
  const t = await r.text()
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${t.slice(0, 160)}`)
  return t ? JSON.parse(t) : null
}
;(async () => {
  const sites = await call('GET', '/sites?filter=all&per_page=100')
  const site = sites.find((s) => ['ekhaya-pay', 'ekhaya-fc-pay', 'ekhayafc-pay'].includes(s.name))
  if (!site) throw new Error('Pay site not found')
  note(`Before: sso_login=${site.sso_login} context=${site.sso_login_context}`)
  const updated = await call('PATCH', `/sites/${site.id}`, { sso_login: false, sso_login_context: 'none' })
  note(`After:  sso_login=${updated.sso_login} context=${updated.sso_login_context}`)
})().catch((e) => { console.log('::error::' + e.message); process.exit(1) })
