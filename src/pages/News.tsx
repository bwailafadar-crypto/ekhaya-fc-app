import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowUpRight, ChevronLeft, ChevronRight, Newspaper, Share2, X } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useToast } from '../components/ToastContext'
import { Badge, Card, EmptyState, PageHeader, Skeleton } from '../components/UI'
import { usePublishedNews } from '../hooks/usePublishedNews'
import { useNewsPhotos } from '../hooks/useNewsPhotos'
import NewsCoverImage from '../components/NewsCoverImage'
import type { NewsBodyBlock, NewsItem, NewsPhoto } from '../types'

function LazyPhoto({ photo, caption, alt, onOpen }: { photo: NewsPhoto; caption?: string; alt?: string; onOpen: () => void }) {
  const [loaded, setLoaded] = useState(false)
  return <button className="news-photo-open" type="button" onClick={onOpen} aria-label={`Open photo: ${caption || alt || 'full screen view'}`}>
    {!loaded && <span className="news-image-placeholder" aria-hidden="true" />}
    <img src={photo.dataUrl} alt={alt ?? caption ?? ''} loading="lazy" decoding="async" onLoad={() => setLoaded(true)} />
    {caption && <span className="news-photo-caption">{caption}</span>}
  </button>
}

function NewsPhotoViewer({ photos, initialIndex, onClose }: { photos: NewsPhoto[]; initialIndex: number; onClose: () => void }) {
  const [index, setIndex] = useState(initialIndex)
  const touchStart = useRef<number | null>(null)
  const photo = photos[index]

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowLeft') setIndex((current) => (current - 1 + photos.length) % photos.length)
      if (event.key === 'ArrowRight') setIndex((current) => (current + 1) % photos.length)
    }
    const oldOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = oldOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose, photos.length])

  if (!photo) return null
  const move = (direction: -1 | 1) => setIndex((current) => (current + direction + photos.length) % photos.length)

  return <div className="news-photo-viewer" role="dialog" aria-modal="true" aria-label="Photo viewer" onClick={(event) => { if (event.target === event.currentTarget) onClose() }} onTouchStart={(event) => { touchStart.current = event.changedTouches[0].clientX }} onTouchEnd={(event) => {
    if (touchStart.current === null) return
    const distance = event.changedTouches[0].clientX - touchStart.current
    if (Math.abs(distance) > 45) move(distance > 0 ? -1 : 1)
    touchStart.current = null
  }}>
    <button className="news-viewer-close" type="button" onClick={onClose} aria-label="Close photo"><X size={21} /></button>
    {photos.length > 1 && <button className="news-viewer-arrow news-viewer-previous" type="button" onClick={() => move(-1)} aria-label="Previous photo"><ChevronLeft size={27} /></button>}
    <figure className="news-viewer-figure"><img src={photo.dataUrl} alt={photo.caption || ''} /><figcaption>{photo.caption} <span>{index + 1} / {photos.length}</span></figcaption></figure>
    {photos.length > 1 && <button className="news-viewer-arrow news-viewer-next" type="button" onClick={() => move(1)} aria-label="Next photo"><ChevronRight size={27} /></button>}
  </div>
}

function displayDate(value: string) {
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function News() {
  const { id } = useParams()
  const { items, loading, error } = usePublishedNews()
  const { showToast } = useToast()
  const article = id ? items.find((item) => item.id === id) : undefined
  const photoState = useNewsPhotos(article?.id)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const photos = photoState.items.filter((photo) => !article?.photoIds || article.photoIds.includes(photo.id))
  const coverPhoto = photos.find((photo) => photo.id === article?.coverPhotoId)
  const legacyCover = !coverPhoto && article?.coverImage ? { id: 'legacy-cover', dataUrl: article.coverImage, caption: '', order: -1 } : null
  const viewablePhotos = [...(coverPhoto ? [coverPhoto] : legacyCover ? [legacyCover] : []), ...photos.filter((photo) => photo.id !== coverPhoto?.id)]
  const galleryPhotos = photos.filter((photo) => photo.id !== article?.coverPhotoId)

  async function shareArticle(item: NewsItem) {
    const url = window.location.href
    try {
      if (navigator.share) {
        await navigator.share({ title: item.title, text: item.summary, url })
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url)
        showToast('Article link copied.')
      } else {
        showToast('Sharing is not available on this device.', 'error')
      }
    } catch (reason) {
      if (reason instanceof Error && reason.name === 'AbortError') return
      showToast('Could not share this article.', 'error')
    }
  }

  if (id) {
    return <>
      <Link className="news-back-link" to="/news"><ArrowLeft size={15} aria-hidden="true" /> All news</Link>
      {loading ? <div className="loading-list"><Skeleton /><Skeleton /></div>
        : error ? <p className="live-error" role="alert">{error}</p>
          : !article ? <Card><EmptyState icon={Newspaper} title="Article unavailable" description="This article may be a draft or has been removed." /></Card>
            : <article className="news-article">
              {(coverPhoto || legacyCover) && <LazyPhoto photo={coverPhoto ?? legacyCover!} alt={article.title} onOpen={() => setViewerIndex(Math.max(0, viewablePhotos.findIndex((photo) => photo.id === (coverPhoto ?? legacyCover)?.id)))} />}
              <div className="news-article-heading">
                <Badge variant="gold">{article.category}</Badge>
                <time dateTime={article.publishedDate}>{displayDate(article.publishedDate)}</time>
              </div>
              <h1>{article.title}</h1>
              <p className="news-article-summary">{article.summary}</p>
              {photoState.error && <p className="live-error" role="alert">{photoState.error}</p>}
              <div className="news-article-body">{(article.bodyBlocks?.length ? article.bodyBlocks : article.body ? [{ id: 'legacy-body', type: 'paragraph', text: article.body } as NewsBodyBlock] : []).map((block) => block.type === 'paragraph'
                ? <p key={block.id}>{block.text}</p>
                : (() => {
                    const photo = photos.find((item) => item.id === block.photoId)
                    if (!photo) return null
                    const photoIndex = viewablePhotos.findIndex((item) => item.id === photo.id)
                    return <LazyPhoto key={block.id} photo={photo} caption={block.caption || undefined} onOpen={() => setViewerIndex(Math.max(0, photoIndex))} />
                  })())}</div>
              {galleryPhotos.length > 0 && <section className="news-article-gallery" aria-label="Photo gallery"><h2>Gallery</h2><div>{galleryPhotos.map((photo) => <LazyPhoto key={photo.id} photo={photo} caption={photo.caption || undefined} onOpen={() => setViewerIndex(Math.max(0, viewablePhotos.findIndex((item) => item.id === photo.id)))} />)}</div></section>}
              <button className="news-share-button" type="button" onClick={() => void shareArticle(article)}><Share2 size={16} aria-hidden="true" /> Share article</button>
            </article>}
      {viewerIndex !== null && <NewsPhotoViewer photos={viewablePhotos} initialIndex={viewerIndex} onClose={() => setViewerIndex(null)} />}
    </>
  }

  const featured = items.find((item) => item.featured)
  const otherArticles = items.filter((item) => item.id !== featured?.id)

  return <>
    <PageHeader eyebrow="From Ekhaya FC" title="News" description="Stories, updates and news from around the club." />
    {loading ? <div className="loading-list"><Skeleton /><Skeleton /><Skeleton /></div>
      : error ? <p className="live-error" role="alert">{error}</p>
        : !items.length ? <Card><EmptyState icon={Newspaper} title="No news yet" description="Club updates will appear here." /></Card>
          : <>
            {featured && <Link className="news-featured-link" to={`/news/${featured.id}`}>
              <Card className="news-featured-card">
                <NewsCoverImage article={featured} className="news-featured-cover" alt="" />
                <div className="news-featured-copy"><div className="news-meta"><Badge variant="gold">{featured.category}</Badge><span>Featured</span><time>{displayDate(featured.publishedDate)}</time></div>
                  <h2>{featured.title}</h2><p>{featured.summary}</p><span className="news-read-link">Read story <ArrowUpRight size={15} /></span>
                </div>
              </Card>
            </Link>}
            <section className="news-list" aria-label="Published news">
              {otherArticles.map((item) => <Link className="news-list-link" key={item.id} to={`/news/${item.id}`}>
                <Card className="news-list-card">
                  <NewsCoverImage article={item} className="news-list-cover" alt="" />
                  <div className="news-list-copy"><div className="news-meta"><Badge variant="gold">{item.category}</Badge><time>{displayDate(item.publishedDate)}</time></div><h2>{item.title}</h2><p>{item.summary}</p></div>
                  <ArrowUpRight className="news-list-arrow" size={17} aria-hidden="true" />
                </Card>
              </Link>)}
            </section>
          </>}
  </>
}