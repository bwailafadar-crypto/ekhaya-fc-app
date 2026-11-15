// Reports the live shop catalogue so we can see what fans actually get:
// how many products are published, and which have problems (no price, no image).
//   node scripts/shop-report.cjs
const os = require('node:os'); const path = require('node:path'); const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')

const kf = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(kf, 'utf8'))) })
const db = getFirestore()
const note = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)
const warn = (t) => console.log(process.env.GITHUB_ACTIONS ? `::warning::${t}` : `! ${t}`)
const price = (p) => p.variants?.length ? Math.min(...p.variants.map((v) => Number(v.price) || 0)) : (Number(p.price) || 0)

;(async () => {
  const snap = await db.collection('shopProducts').get()
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  const published = all.filter((p) => p.active === true && price(p) > 0)
  note(`Shop: ${all.length} product(s) total; ${published.length} visible to fans (active + priced).`)

  if (published.length === 0) warn('Fans see an EMPTY shop. In Admin -> Shop, set a price and switch each product on (active).')
  published.forEach((p) => note(`  • ${p.name} — ${price(p)} MWK${p.images?.length ? '' : ' (NO IMAGE)'}${p.soldOut ? ' (sold out)' : ''}`))

  const activeNoPrice = all.filter((p) => p.active === true && !(price(p) > 0))
  const pricedOff = all.filter((p) => p.active !== true && price(p) > 0)
  if (activeNoPrice.length) warn(`${activeNoPrice.length} switched on but NO price (hidden from fans): ${activeNoPrice.map((p) => p.name).join(', ')}`)
  if (pricedOff.length) warn(`${pricedOff.length} priced but switched OFF (hidden from fans): ${pricedOff.map((p) => p.name).join(', ')}`)
  const noImage = published.filter((p) => !p.images?.length)
  if (noImage.length) warn(`${noImage.length} visible product(s) have no photo: ${noImage.map((p) => p.name).join(', ')}`)

  const settings = (await db.doc('shopSettings/main').get()).data()
  if (!settings) { warn('No shop settings found. Set them in Admin -> Shop.'); return }
  const show = (k) => settings[k] ? String(settings[k]) : 'MISSING'
  note('Shop settings:')
  ;['pickupPlace', 'whatsapp', 'airtelNumber', 'mpambaNumber', 'payName', 'fdhAccount', 'fdhAccountName', 'deliveryPrice', 'printPrice', 'payMode'].forEach((k) => note(`  ${k}: ${show(k)}`))
  const gaps = []
  if (!settings.whatsapp) gaps.push('WhatsApp number (needed so fans can send orders and get payment details)')
  if (!settings.mpambaNumber) gaps.push('TNM Mpamba number (fans who pick Mpamba see no number)')
  if (!settings.airtelNumber) gaps.push('Airtel Money number')
  if (gaps.length) warn(`Settings to complete: ${gaps.join('; ')}.`)
})().catch((error) => { console.error('✖', error.message); process.exit(1) })
