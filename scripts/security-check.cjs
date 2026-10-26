// Daily security check (run by .github/workflows/daily-security.yml):
//  1. backs up every collection to backup/ (kept 14 days as a private download in GitHub),
//  2. warns about new admin/superadmin accounts, a flood of sign-ups, blocked accounts,
//     and shop orders whose total is lower than the real price (a changed order),
//  3. exits with code 3 when something needs the superadmin's attention, so GitHub emails him.
//   node scripts/security-check.cjs [--no-backup]
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore')
const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyFile, 'utf8'))) })
const db = getFirestore()
const notes = []; const alerts = []
const note = (t) => notes.push(t); const alert = (t) => alerts.push(t)
const DAY = 86_400_000
const mask = (email) => String(email || '').replace(/^(.{2}).*(@.*)$/, '$1***$2')
const ms = (v) => (v instanceof Timestamp ? v.toMillis() : typeof v === 'object' && v && '_seconds' in v ? v._seconds * 1000 : typeof v === 'number' ? v : Date.parse(v || '') || 0)

async function backup() {
  const dir = path.resolve('backup'); fs.mkdirSync(dir, { recursive: true })
  let docs = 0
  const dump = async (col, prefix) => {
    const out = {}
    for (const d of (await col.get()).docs) {
      out[d.id] = d.data(); docs++
      for (const sub of await d.ref.listCollections()) await dump(sub, `${prefix}__${d.id}__${sub.id}`)
    }
    fs.writeFileSync(path.join(dir, `${prefix}.json`), JSON.stringify(out))
  }
  for (const col of await db.listCollections()) await dump(col, col.id)
  note(`Backup: ${docs} records saved`)
}

async function admins() {
  const users = await db.collection('users').get()
  const staff = users.docs.filter((d) => ['admin', 'superadmin'].includes(d.data().role)).map((d) => ({ id: d.id, role: d.data().role, email: d.data().email }))
  const stateRef = db.collection('securityState').doc('daily')
  const state = (await stateRef.get()).data() || {}
  const known = new Set(state.staffIds || [])
  const fresh = staff.filter((s) => !known.has(s.id))
  if (state.staffIds && fresh.length) alert(`NEW ${fresh.length === 1 ? 'ADMIN' : 'ADMINS'}: ${fresh.map((s) => `${s.role} ${mask(s.email)}`).join(', ')}. If you did not add them, remove them now in Admin → Fans.`)
  const gone = (state.staffIds || []).filter((id) => !staff.some((s) => s.id === id))
  if (gone.length) note(`${gone.length} admin account(s) no longer admin`)
  note(`Admins: ${staff.filter((s) => s.role === 'superadmin').length} superadmin, ${staff.filter((s) => s.role === 'admin').length} admin`)
  const now = Date.now()
  const newUsers = users.docs.filter((d) => ms(d.data().createdAt) > now - DAY).length
  note(`New fans in 24 h: ${newUsers} (total ${users.size})`)
  if (newUsers > 150) alert(`${newUsers} new accounts in 24 hours: much more than usual. Check Admin → Fans for fake sign-ups.`)
  const blocked = users.docs.filter((d) => d.data().disabled === true).length
  if (blocked) note(`Blocked accounts: ${blocked}`)
  await stateRef.set({ staffIds: staff.map((s) => s.id), checkedAt: FieldValue.serverTimestamp() }, { merge: true })
}

async function orders() {
  const [ordersSnap, settingsSnap] = await Promise.all([db.collection('shopOrders').get(), db.collection('shopSettings').doc('main').get()])
  const settings = { printPrice: 5000, deliveryPrice: 3000, freeDeliveryFrom: 60000, ...(settingsSnap.data() || {}) }
  const products = new Map([...(await db.collection('shopProducts').get()).docs, ...(await db.collection('shopProductsStaff').get()).docs].map((d) => [d.id, d.data()]))
  let checked = 0
  for (const d of ordersSnap.docs) {
    const o = d.data()
    if (o.status === 'cancelled' || ms(o.createdAt) < Date.now() - 7 * DAY) continue
    checked++
    let real = 0; let unknown = false
    for (const l of o.lines || []) {
      const p = products.get(l.productId)
      if (!p) { unknown = true; continue }
      const variants = Array.isArray(p.variants) ? p.variants : []
      const unit = variants.length > 1 ? Number((variants.find((v) => v.label === l.variant) || {}).price) : Number(variants[0] ? variants[0].price : p.price)
      real += ((unit || 0) + (l.printName || l.printNumber ? Number(settings.printPrice) || 0 : 0)) * Number(l.qty || 0)
    }
    const fee = o.delivery === 'delivery' && real < Number(settings.freeDeliveryFrom) ? Number(settings.deliveryPrice) || 0 : 0
    if (!unknown && Number(o.total) < real + fee) alert(`Order ${o.ref}: total MK ${o.total} is LOWER than the real price MK ${real + fee}. Do not mark it paid before checking.`)
  }
  note(`Shop orders checked (last 7 days): ${checked}`)
}

async function main() {
  if (!process.argv.includes('--no-backup')) await backup()
  await admins()
  await orders()
  const summary = [`## Ekhaya FC daily security check`, '', ...(alerts.length ? ['### ⚠ Needs your attention', ...alerts.map((a) => `- ${a}`), ''] : ['✅ Nothing suspicious found.', '']), ...notes.map((n) => `- ${n}`)].join('\n')
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n')
  for (const a of alerts) console.log(process.env.GITHUB_ACTIONS ? `::warning::${a}` : `WARNING ${a}`)
  console.log(process.env.GITHUB_ACTIONS ? `::notice::${notes.join(' · ')}` : notes.join('\n'))
  if (alerts.length) process.exit(3)
}
main().catch((e) => { console.error(e); process.exit(1) })
