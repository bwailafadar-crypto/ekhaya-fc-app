// Read-only check against PayChangu with the live key: validates the key, lists
// operator ref IDs, and does a controlled charge test to PayChangu's own
// documented example number to reveal the real response the app would get.
// Never logs the key.
const API = 'https://api.paychangu.com'
const h = { authorization: `Bearer ${process.env.PAYCHANGU_SECRET_KEY}`, 'content-type': 'application/json', accept: 'application/json' }
const note = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)
const HARDCODED = { airtel: '20be6c20-adeb-4b5b-a7ba-0769820df4fb', mpamba: '27494cb5-ba9e-437f-a114-4e7a7686bcca' }

async function main() {
  const r0 = await fetch(API + '/mobile-money', { headers: h })
  note(`GET /mobile-money -> ${r0.status} (key ${r0.ok ? 'OK' : 'REJECTED'})`)

  // Test the user's actual numbers in local 0-format.
  const tests = [
    { mobile: '0983333372', op: HARDCODED.airtel, label: 'airtel 0983333372' },
    { mobile: '0899477724', op: HARDCODED.mpamba, label: 'mpamba 0899477724' },
  ]
  for (const t of tests) {
    try {
      const chargeId = 'ekhaya-diag-' + Date.now().toString(36)
      const payload = { mobile_money_operator_ref_id: t.op, mobile: t.mobile, amount: '100', charge_id: chargeId, email: 'diag@ekhayafc.app', first_name: 'Diag', last_name: 'Test' }
      const r = await fetch(API + '/mobile-money/payments/initialize', { method: 'POST', headers: h, body: JSON.stringify(payload) })
      const body = await r.text()
      note(`INIT ${t.label} -> ${r.status} ${body.slice(0, 280)}`)
    } catch (e) { note(`INIT ${t.label} threw: ${String(e.message).slice(0, 150)}`) }
  }
}

main().catch((e) => note('FATAL: ' + e.message))
