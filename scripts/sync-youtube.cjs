// Ekhaya TV ← the club's YouTube channel. Adds new uploads to the videos list
// (title, link, type guessed from the title, upload date) and notes when the
// channel is live. The channel is set in the app (Ekhaya TV → YouTube channel),
// stored in tvConfig/youtube. Videos the club removed in the app stay removed.
//   node scripts/sync-youtube.cjs
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')
const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore')
const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(os.homedir(), 'ekhaya-keys', 'firebase-sa.json')
initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyFile, 'utf8'))) })
const db = getFirestore()
const say = (t) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${t}` : t)
// A real browser user-agent + consent cookie: YouTube serves a 404/consent page
// to unusual clients, which used to poison the channel name with "Error 404".
const UA = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36', 'accept-language': 'en-US,en;q=0.9', 'cookie': 'CONSENT=YES+1' }
const grab = async (url) => { const r = await fetch(url, { headers: UA }); return { status: r.status, text: await r.text() } }
const feedUrl = (id) => `https://www.youtube.com/feeds/videos.xml?channel_id=${id}`
const validFeed = (t) => typeof t === 'string' && t.includes('<feed') && /<yt:channelId>|<entry>/.test(t)

// Fallback when the RSS feed is unavailable: read recent uploads from the
// channel's own /videos page (ytInitialData), newest first.
function parseChannelVideos(html) {
  const title = decode((html.match(/<title>([^<]*)<\/title>/)?.[1] || '').replace(/\s*-\s*YouTube\s*$/, '').trim()) || ''
  const videos = []
  const seen = new Set()
  const push = (id, text) => { if (id && text && !seen.has(id)) { seen.add(id); videos.push({ id, title: decode(String(text)).trim() }) } }
  const json = html.match(/ytInitialData\s*=\s*(\{.+?\})\s*;\s*<\/script>/s)?.[1]
  if (json) {
    try {
      const walk = (n) => {
        if (!n || typeof n !== 'object') return
        if (n.videoId && n.title) push(n.videoId, n.title.runs?.[0]?.text || n.title.simpleText)
        for (const k in n) walk(n[k])
      }
      walk(JSON.parse(json))
    } catch { /* fall through to regex */ }
  }
  if (!videos.length) {
    const re = /"videoId":"([\w-]{11})"[\s\S]{0,400}?"(?:text|simpleText)":"([^"]{3,120})"/g
    let m
    while ((m = re.exec(html)) && videos.length < 30) push(m[1], m[2])
  }
  return { title, videos: videos.slice(0, 30) }
}

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
// Women's team videos say so in the title; everything else is Men's. The check
// is deliberately loose (matches "wome", so WOMEN / WOMEN'S / the common typo
// "WOME'S" all count), plus ladies / girls / queens / female / WFC.
function guessTeam(title) {
  return /wome|lad(?:y|ies)|girls?|female|queens?|\bw\.?f\.?c\b/i.test(String(title)) ? 'women' : 'men'
}
function guessKind(title) {
  if (/\bgoals?\b|golo/i.test(title)) return 'Goals'
  if (/interview|press|speaks|coach|reaction|post.?match/i.test(title)) return 'Interview'
  if (/training|practice|session/i.test(title)) return 'Training'
  if (/behind|bts|vlog|matchday|dressing/i.test(title)) return 'Behind the scenes'
  return 'Highlights'
}

async function resolveChannelId(input) {
  const direct = String(input).match(/(UC[\w-]{22})/)
  if (direct) return direct[1]
  const handle = String(input).match(/@[\w.-]+/)?.[0]
  const url = handle ? `https://www.youtube.com/${handle}` : String(input).startsWith('http') ? String(input) : `https://www.youtube.com/@${String(input).replace(/^@/, '')}`
  const { status, text: html } = await grab(url)
  const id = html.match(/"(?:channelId|externalId|browseId)":"(UC[\w-]{22})"/)?.[1] || html.match(/youtube\.com\/channel\/(UC[\w-]{22})/)?.[1] || html.match(/<meta itemprop="identifier" content="(UC[\w-]{22})"/)?.[1]
  if (!id) throw new Error(`Could not find the YouTube channel at ${url} (http ${status})`)
  return id
}

async function main() {
  const cfgRef = db.collection('tvConfig').doc('youtube')
  // A channel given to the job (first connection) is saved first.
  if (process.env.CHANNEL && process.env.CHANNEL.trim()) await cfgRef.set({ channel: process.env.CHANNEL.trim(), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
  const cfg = (await cfgRef.get()).data() ?? {}
  if (!cfg.channel) { say('No YouTube channel set yet (Ekhaya TV → YouTube channel). Nothing to do.'); return }
  let channelId = cfg.channelId && cfg.channelFor === cfg.channel ? cfg.channelId : await resolveChannelId(cfg.channel)
  let fr = await grab(feedUrl(channelId))
  if (!validFeed(fr.text)) {
    // The cached id may be stale, or the first fetch hit a consent/404 page.
    // Re-resolve the handle fresh and try once more before giving up.
    say(`Feed not valid for ${channelId} (http ${fr.status}); re-resolving ${cfg.channel}…`)
    try { const fresh = await resolveChannelId(cfg.channel); if (fresh) { channelId = fresh; fr = await grab(feedUrl(channelId)) } } catch (e) { say(`Re-resolve failed: ${e.message}`) }
  }
  let channelTitle
  let entries
  if (validFeed(fr.text)) {
    const feed = fr.text
    channelTitle = decode(feed.match(/<title>([^<]*)<\/title>/)?.[1] ?? '') || cfg.channelTitle || 'Ekhaya FC'
    entries = [...feed.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => ({
      id: m[1].match(/<yt:videoId>([\w-]{11})<\/yt:videoId>/)?.[1],
      title: decode(m[1].match(/<title>([^<]*)<\/title>/)?.[1] ?? '').trim(),
      published: m[1].match(/<published>([^<]+)<\/published>/)?.[1],
      shorts: /\/shorts\//.test(m[1]),
    })).filter((e) => e.id && e.title)
  } else {
    // RSS is 404 for this channel — read the channel page instead.
    const page = await grab(`https://www.youtube.com/channel/${channelId}/videos`)
    const scraped = parseChannelVideos(page.text)
    if (!scraped.videos.length) {
      await cfgRef.set({ error: `Could not read the channel right now (feed ${fr.status}, page ${page.status}). It will try again next hour.`, lastSync: FieldValue.serverTimestamp() }, { merge: true })
      say(`Could not read the channel (feed ${fr.status}, page ${page.status}); kept previous videos and name.`)
      return
    }
    channelTitle = scraped.title || cfg.channelTitle || 'Ekhaya FC'
    // No upload dates on the page: keep the page order (newest first).
    const t0 = Date.now()
    entries = scraped.videos.map((v, i) => ({ id: v.id, title: v.title, published: new Date(t0 - i * 60000).toISOString(), shorts: false }))
    say(`RSS unavailable — read ${entries.length} videos from the channel page.`)
  }

  const hidden = new Set(Array.isArray(cfg.hidden) ? cfg.hidden : [])
  const existing = await db.collection('videos').get()
  const have = new Set(existing.docs.map((d) => String(d.data().url || '').match(/(?:v=|youtu\.be\/|shorts\/|live\/)([\w-]{11})/)?.[1]).filter(Boolean))
  const batch = db.batch()
  let added = 0
  for (const e of entries) {
    if (have.has(e.id) || hidden.has(e.id)) continue
    batch.set(db.collection('videos').doc(`yt-${e.id}`), { title: e.title.slice(0, 120), url: e.shorts ? `https://www.youtube.com/shorts/${e.id}` : `https://www.youtube.com/watch?v=${e.id}`, kind: guessKind(e.title), team: guessTeam(e.title), createdAt: e.published ? Timestamp.fromDate(new Date(e.published)) : FieldValue.serverTimestamp(), by: 'youtube', source: 'youtube' })
    added++
    say(`New: ${e.title}`)
  }

  // Live now? The channel's /live page points to the live video when there is one.
  let live = null
  try {
    const html = await (await fetch(`https://www.youtube.com/channel/${channelId}/live`, { headers: UA })).text()
    const id = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/)?.[1]
    if (id && /"isLiveNow":true|"isLive":true/.test(html)) live = { id, title: decode(html.match(/<meta name="title" content="([^"]*)"/)?.[1] ?? 'Live now').slice(0, 120) }
  } catch { /* not live */ }

  batch.set(cfgRef, { channelId, channelFor: cfg.channel, channelTitle, lastSync: FieldValue.serverTimestamp(), lastAdded: added, inFeed: entries.length, live, error: FieldValue.delete() }, { merge: true })
  await batch.commit()
  say(`${channelTitle || channelId}: ${entries.length} recent videos, ${added} new added${live ? ` · LIVE NOW: ${live.title}` : ''}.`)
}
main().catch(async (e) => {
  console.error(e)
  await db.collection('tvConfig').doc('youtube').set({ error: String(e.message || e).slice(0, 200), lastSync: FieldValue.serverTimestamp() }, { merge: true }).catch(() => undefined)
  process.exit(1)
})
