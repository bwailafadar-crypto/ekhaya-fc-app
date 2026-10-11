import { collection, onSnapshot, query, where, type DocumentData } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { db } from '../firebase'
import type { NewsItem } from '../types'

const WORDPRESS_NEWS_URL = (import.meta.env.VITE_NEWS_URL ?? 'https://ekhayafc.com/wp-json/wp/v2/posts?per_page=10&_embed=true').trim() || 'https://ekhayafc.com/wp-json/wp/v2/posts?per_page=10&_embed=true'

type WordPressPost = {
  id: number
  date: string
  title?: { rendered?: string }
  excerpt?: { rendered?: string }
  content?: { rendered?: string }
  _embedded?: {
    'wp:featuredmedia'?: Array<{
      source_url?: string
      media_details?: {
        sizes?: Record<string, { source_url?: string }>
      }
    }>
  }
}

function stripHtml(value: string) {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#038;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function getFeaturedImage(post: WordPressPost) {
  const media = post._embedded?.['wp:featuredmedia']?.[0]
  if (!media) return ''
  return media.source_url ?? media.media_details?.sizes?.large?.source_url ?? media.media_details?.sizes?.full?.source_url ?? ''
}

function mapWordPressPost(post: WordPressPost, index: number): NewsItem {
  const title = stripHtml(post.title?.rendered ?? 'Untitled post')
  const summary = stripHtml(post.excerpt?.rendered ?? '')
  const body = stripHtml(post.content?.rendered ?? '')

  return {
    id: String(post.id),
    title,
    category: 'Club',
    summary: summary || body.slice(0, 220),
    body: body || summary,
    coverImage: getFeaturedImage(post),
    publishedDate: (post.date ?? '').slice(0, 10),
    featured: index === 0,
    status: 'published',
  }
}

// The club website is checked every 10 minutes (not every minute) to save fans' data.
const WEBSITE_REFRESH_MS = 10 * 60 * 1000

type SourceState = { items: NewsItem[]; done: boolean; failed: boolean }
const EMPTY: SourceState = { items: [], done: false, failed: false }

/**
 * Club news for fans: articles published in the app (Admin → News) and posts
 * from the club website, together, newest first. If one source is down the
 * other still shows; app articles are never hidden by the website.
 */
export function usePublishedNews() {
  const [app, setApp] = useState<SourceState>(EMPTY)
  const [website, setWebsite] = useState<SourceState>(EMPTY)

  useEffect(() => onSnapshot(
    query(collection(db, 'news'), where('status', '==', 'published')),
    (snapshot) => setApp({ items: snapshot.docs.map((item) => ({ ...item.data() as DocumentData, id: item.id }) as NewsItem), done: true, failed: false }),
    () => setApp({ items: [], done: true, failed: true }),
  ), [])

  useEffect(() => {
    let active = true
    let controller: AbortController | undefined
    async function load() {
      controller?.abort()
      const current = new AbortController()
      controller = current
      const timeout = window.setTimeout(() => current.abort(), 15000)
      try {
        const response = await fetch(WORDPRESS_NEWS_URL, { headers: { Accept: 'application/json' }, signal: current.signal })
        if (!response.ok) throw new Error(`News source returned ${response.status}`)
        const posts = (await response.json()) as WordPressPost[]
        if (!Array.isArray(posts)) throw new Error('News source did not return an array')
        if (active) setWebsite({ items: posts.map(mapWordPressPost).map((item) => ({ ...item, featured: false })), done: true, failed: false })
      } catch {
        // Keep the last good website posts if a refresh fails.
        if (active) setWebsite((prev) => ({ items: prev.items, done: true, failed: !prev.items.length }))
      } finally {
        window.clearTimeout(timeout)
      }
    }
    void load()
    const timer = window.setInterval(() => void load(), WEBSITE_REFRESH_MS)
    return () => { active = false; controller?.abort(); window.clearInterval(timer) }
  }, [])

  const items = [...app.items, ...website.items.filter((post) => !app.items.some((item) => item.id === post.id))]
    .sort((left, right) => String(right.publishedDate ?? '').localeCompare(String(left.publishedDate ?? '')))
  // Featured: the newest app article marked featured, otherwise the newest article.
  const featuredId = (items.find((item) => item.featured) ?? items[0])?.id
  const merged = items.map((item) => ({ ...item, featured: item.id === featuredId }))
  const loading = !app.done && !website.done
  const error = app.failed && website.failed ? 'News could not be loaded. Check your connection and try again.' : null
  return { items: merged, loading: loading && !merged.length, error }
}
