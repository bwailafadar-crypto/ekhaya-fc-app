// After a deploy: checks the live site really serves the new app (page, main
// script, offline worker and manifest all load). Retries for slow propagation.
//   node scripts/smoke-test.cjs [url]
const https = require('node:https')
const http = require('node:http')
const dns = require('node:dns')
dns.setDefaultResultOrder('ipv4first')

const BASE = (process.argv[2] || 'https://ekhaya-fc-app.web.app/').replace(/\/?$/, '/')
const get = (url) => new Promise((resolve, reject) => {
  (url.startsWith('http:') ? http : https).get(url, { family: 4, timeout: 20000, headers: { 'Cache-Control': 'no-cache' } }, (res) => {
    let body = ''
    res.on('data', (c) => { if (body.length < 400000) body += c })
    res.on('end', () => resolve({ status: res.statusCode, body, type: res.headers['content-type'] || '' }))
  }).on('error', reject).on('timeout', function () { this.destroy(new Error('timeout')) })
})

async function check() {
  const page = await get(BASE)
  if (page.status !== 200 || !page.body.includes('id="root"')) throw new Error(`page returned ${page.status}`)
  const script = /src="\.?\/?(assets\/index-[^"]+\.js)"/.exec(page.body)?.[1]
  if (!script) throw new Error('main script missing from page')
  const js = await get(BASE + script)
  if (js.status !== 200 || !/javascript/.test(js.type)) throw new Error(`main script returned ${js.status}`)
  for (const file of ['sw.js', 'manifest.webmanifest']) {
    const res = await get(BASE + file)
    if (res.status !== 200) throw new Error(`${file} returned ${res.status}`)
  }
  return script
}

;(async () => {
  for (let i = 1; i <= 5; i++) {
    try {
      const script = await check()
      console.log(`✔ Live site OK: ${BASE} (${script})`)
      return
    } catch (error) {
      console.log(`  attempt ${i}: ${error.message}`)
      await new Promise((r) => setTimeout(r, 6000 * i))
    }
  }
  console.error(`✖ Live site check failed: ${BASE}`)
  process.exit(1)
})()
