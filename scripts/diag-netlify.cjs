// Read-only: find the field controlling the pay site's access protection.
const API = 'https://api.netlify.com/api/v1'
const h = { authorization: `Bearer ${process.env.TOKEN}` }
const note = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)
async function get(path) {
  const r = await fetch(API + path, { headers: h }); const t = await r.text()
  if (!r.ok) throw new Error(`${path} -> ${r.status} ${t.slice(0, 120)}`)
  return t ? JSON.parse(t) : null
}
;(async () => {
  const sites = await get('/sites?filter=all&per_page=100')
  const site = sites.find((s) => ['ekhaya-pay', 'ekhaya-fc-pay', 'ekhayafc-pay'].includes(s.name))
  note(`SITE ${site.name} id=${site.id} account=${site.account_id || site.account_slug}`)
  // Show every field whose name hints at access/protection.
  for (const [k, v] of Object.entries(site)) {
    if (/access|sso|protect|password|visitor|private|auth|manag/i.test(k)) note(`site.${k} = ${JSON.stringify(v).slice(0, 160)}`)
  }
  // Account-level protection default.
  try {
    const acct = await get(`/accounts`)
    acct.slice(0, 3).forEach((a) => note(`account ${a.slug}: type=${a.type_name} roles_ability=${JSON.stringify(a.capabilities?.sso || a.capabilities?.password_protection || 'n/a').slice(0, 80)}`))
  } catch (e) { note('accounts: ' + e.message) }
})().catch((e) => { console.log('::error::' + e.message); process.exit(1) })
