import { ArrowLeft, ArrowUpRight, Newspaper, Share2 } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useToast } from '../components/ToastContext'
import { Badge, Card, EmptyState, PageHeader, Skeleton } from '../components/UI'
import { usePublishedNews } from '../hooks/usePublishedNews'
import type { NewsItem } from '../types'

function displayDate(value: string) {
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function News() {
  const { id } = useParams()
  const { items, loading, error } = usePublishedNews()
  const { showToast } = useToast()
  const article = id ? items.find((item) => item.id === id) : undefined

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
              {article.coverImage && <img className="news-article-cover" src={article.coverImage} alt={article.title} />}
              <div className="news-article-heading">
                <Badge variant="gold">{article.category}</Badge>
                <time dateTime={article.publishedDate}>{displayDate(article.publishedDate)}</time>
              </div>
              <h1>{article.title}</h1>
              <p className="news-article-summary">{article.summary}</p>
              <div className="news-article-body">{article.body}</div>
              <button className="news-share-button" type="button" onClick={() => void shareArticle(article)}><Share2 size={16} aria-hidden="true" /> Share article</button>
            </article>}
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
                {featured.coverImage && <img className="news-featured-cover" src={featured.coverImage} alt="" />}
                <div className="news-featured-copy"><div className="news-meta"><Badge variant="gold">{featured.category}</Badge><span>Featured</span><time>{displayDate(featured.publishedDate)}</time></div>
                  <h2>{featured.title}</h2><p>{featured.summary}</p><span className="news-read-link">Read story <ArrowUpRight size={15} /></span>
                </div>
              </Card>
            </Link>}
            <section className="news-list" aria-label="Published news">
              {otherArticles.map((item) => <Link className="news-list-link" key={item.id} to={`/news/${item.id}`}>
                <Card className="news-list-card">
                  {item.coverImage && <img className="news-list-cover" src={item.coverImage} alt="" />}
                  <div className="news-list-copy"><div className="news-meta"><Badge variant="gold">{item.category}</Badge><time>{displayDate(item.publishedDate)}</time></div><h2>{item.title}</h2><p>{item.summary}</p></div>
                  <ArrowUpRight className="news-list-arrow" size={17} aria-hidden="true" />
                </Card>
              </Link>)}
            </section>
          </>}
  </>
}