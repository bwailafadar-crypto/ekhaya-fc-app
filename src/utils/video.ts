// Club videos live on YouTube or Facebook (free hosting); the app plays them
// inside itself with the providers' own players.
export type VideoInfo = { provider: 'youtube' | 'facebook'; id: string; embed: string; thumb: string | null; portrait: boolean }

export const VIDEO_KINDS = ['Highlights', 'Goals', 'Interview', 'Training', 'Behind the scenes'] as const
export type VideoKind = (typeof VIDEO_KINDS)[number]

const YT_ID = /^[A-Za-z0-9_-]{11}$/

/** Understands YouTube (watch, youtu.be, shorts, live, embed) and Facebook (videos, watch, reel, fb.watch) links. */
export function parseVideo(raw: string): VideoInfo | null {
  let url: URL
  try { url = new URL(raw.trim()) } catch { return null }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  const host = url.hostname.replace(/^(www\.|m\.|mobile\.)/, '')
  if (host === 'youtu.be' || host === 'youtube.com' || host === 'music.youtube.com' || host === 'youtube-nocookie.com') {
    const parts = url.pathname.split('/').filter(Boolean)
    const id = host === 'youtu.be' ? parts[0]
      : url.searchParams.get('v') ?? (['shorts', 'live', 'embed'].includes(parts[0]) ? parts[1] : undefined)
    if (!id || !YT_ID.test(id)) return null
    return { provider: 'youtube', id, embed: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1`, thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, portrait: parts[0] === 'shorts' }
  }
  if (host === 'facebook.com' || host === 'fb.watch' || host === 'web.facebook.com') {
    const looksLikeVideo = host === 'fb.watch' || /\/(videos|reel|watch|share\/v|share\/r)\b/.test(url.pathname) || url.searchParams.has('v')
    if (!looksLikeVideo) return null
    const clean = `https://www.facebook.com${host === 'fb.watch' ? '' : url.pathname}${url.searchParams.get('v') ? `?v=${url.searchParams.get('v')}` : ''}`
    const href = host === 'fb.watch' ? url.toString() : clean
    return { provider: 'facebook', id: href, embed: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(href)}&show_text=false&autoplay=true`, thumb: null, portrait: /\/(reel|share\/r)\b/.test(url.pathname) }
  }
  return null
}
