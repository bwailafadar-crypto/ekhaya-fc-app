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

export function usePublishedNews() {
  const [state, setState] = useState<{ items: NewsItem[]; loading: boolean; error: string | null }>({
    items: [], loading: true, error: null,
  })

  useEffect(() => {
    let active = true
    let unsubscribeFallback: (() => void) | undefined
    let activeController: AbortController | undefined
    let requestInProgress = false
    let usingExternalNews = false

    async function loadExternalNews() {
      if (!active || requestInProgress) return
      requestInProgress = true
      const controller = new AbortController()
      activeController = controller
      const timeout = window.setTimeout(() => controller.abort(), 15000)

      try {
        const response = await fetch(WORDPRESS_NEWS_URL, {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error(`News source returned ${response.status}`)
        }

        const posts = (await response.json()) as WordPressPost[]
        if (!Array.isArray(posts)) {
          throw new Error('News source did not return an array')
        }

        const items = posts.map(mapWordPressPost)
        if (active) {
          usingExternalNews = true
          unsubscribeFallback?.()
          unsubscribeFallback = undefined
          setState({ items, loading: false, error: null })
        }
      } catch {
        if (!active) return
        usingExternalNews = false
        if (!unsubscribeFallback) {
          unsubscribeFallback = onSnapshot(
            query(collection(db, 'news'), where('status', '==', 'published')),
            (snapshot) => {
              if (!active || usingExternalNews) return
              const items = snapshot.docs.map((item) => ({ ...item.data() as DocumentData, id: item.id }) as NewsItem)
                .sort((left, right) => right.publishedDate.localeCompare(left.publishedDate))
              setState({ items, loading: false, error: null })
            },
            () => {
              if (!active || usingExternalNews) return
              unsubscribeFallback = undefined
              setState({ items: [], loading: false, error: 'News could not be loaded. Check your connection and try again.' })
            },
          )
        }
      } finally {
        window.clearTimeout(timeout)
        if (activeController === controller) activeController = undefined
        requestInProgress = false
      }
    }

    void loadExternalNews()
    const refreshTimer = window.setInterval(() => {
      void loadExternalNews()
    }, 60000)

    return () => {
      active = false
      activeController?.abort()
      unsubscribeFallback?.()
      window.clearInterval(refreshTimer)
    }
  }, [])

  return state
}