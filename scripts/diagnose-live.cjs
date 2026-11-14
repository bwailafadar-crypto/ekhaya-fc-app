// Loads the live app in a headless browser and reports JavaScript console
// errors, uncaught exceptions and failed network requests on first load.
//   node scripts/diagnose-live.cjs [url]
const { chromium } = require('playwright')

const BASE = (process.argv[2] || 'https://ekhaya-fc-app.web.app/').replace(/\/?$/, '/')
const note = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)
const warn = (t) => console.log(process.env.GITHUB_ACTIONS ? `::warning::${t}` : `! ${t}`)

// Noise we don't treat as app errors (extensions, third-party, offline pings).
const IGNORE = [/favicon/i, /chrome-extension/i, /ERR_INTERNET_DISCONNECTED/i]
const ignorable = (t) => IGNORE.some((re) => re.test(t))

;(async () => {
  const browser = await chromium.launch()
  const errors = []
  const failed = []
  const routes = ['', '#/', '#/fanzone', '#/fixtures', '#/squad', '#/women', '#/shop']

  for (const route of routes) {
    const page = await browser.newPage()
    page.on('console', (msg) => { if (msg.type() === 'error' && !ignorable(msg.text())) errors.push(`[${route || '/'}] ${msg.text()}`) })
    page.on('pageerror', (err) => errors.push(`[${route || '/'}] ${err.message}`))
    page.on('requestfailed', (req) => { const t = `${req.url()} (${req.failure()?.errorText})`; if (!ignorable(t)) failed.push(`[${route || '/'}] ${t}`) })
    try {
      await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 45000 })
      await page.waitForTimeout(2500)
      const title = await page.title()
      note(`Loaded ${route || '/'} — title "${title}"`)
    } catch (error) {
      warn(`Could not load ${route || '/'}: ${error.message}`)
    }
    await page.close()
  }

  await browser.close()

  const uniqueErrors = [...new Set(errors)]
  const uniqueFailed = [...new Set(failed)]
  if (uniqueErrors.length) { warn(`${uniqueErrors.length} console/runtime error(s):`); uniqueErrors.forEach((e) => warn(e)) }
  else note('No console or runtime errors on the checked routes.')
  if (uniqueFailed.length) { warn(`${uniqueFailed.length} failed request(s):`); uniqueFailed.forEach((e) => warn(e)) }

  process.exit(uniqueErrors.length ? 1 : 0)
})().catch((error) => { console.error('✖', error.message); process.exit(2) })
