import { useState, type ChangeEvent, type FormEvent } from 'react'
import { arrayRemove, arrayUnion, collection, doc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore'
import { ArrowDown, ArrowUp, Heading, ImagePlus, Plus, Trash2, Wand2 } from 'lucide-react'
import { db } from '../firebase'
import { useToast } from './ToastContext'
import { Button, Card, Skeleton } from './UI'
import { useFirestoreCollection } from '../hooks/useFirestoreCollection'
import { useNewsPhotos } from '../hooks/useNewsPhotos'
import { compressImage } from '../utils/compressImage'
import { parseArticleText } from '../utils/articleText'
import type { NewsBodyBlock, NewsCategory, NewsItem, NewsPhoto, NewsStatus } from '../types'
import { logAction } from '../utils/audit'

const MAX_GALLERY_PHOTOS = 12
const PHOTO_MAX_BYTES = 149 * 1024
const PHOTO_MAX_DIMENSION = 1280

function blockId() {
  return `block-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function articleBlocks(article: NewsItem | undefined): NewsBodyBlock[] {
  if (article?.bodyBlocks?.length) return article.bodyBlocks
  return article?.body ? [{ id: blockId(), type: 'paragraph', text: article.body }] : []
}

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : 'Could not save this change. Check your connection and try again.'
}

export default function NewsArticleEditor() {
  const { showToast } = useToast()
  const news = useFirestoreCollection<NewsItem>('news')
  const [selectedId, setSelectedId] = useState('')
  const selected = news.items.find((article) => article.id === selectedId)
  const photoState = useNewsPhotos(selected?.id)
  const allPhotos = photoState.items
  const coverPhoto = allPhotos.find((photo) => photo.id === selected?.coverPhotoId)
  const galleryPhotos = allPhotos.filter((photo) => photo.id !== selected?.coverPhotoId).slice(0, MAX_GALLERY_PHOTOS)
  const coverPreview = coverPhoto?.dataUrl || selected?.coverImage || ''
  const [blocks, setBlocks] = useState<NewsBodyBlock[]>([])
  const [captionDrafts, setCaptionDrafts] = useState<Record<string, string>>({})
  const [pasteText, setPasteText] = useState('')
  const [pasteOpen, setPasteOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState<{ complete: number; total: number; detail: string } | null>(null)

  function selectArticle(id: string) {
    setSelectedId(id)
    setBlocks(articleBlocks(news.items.find((article) => article.id === id)))
    setCaptionDrafts({})
  }

  async function uploadPhotos(event: ChangeEvent<HTMLInputElement>, target: 'cover' | 'gallery') {
    const input = event.currentTarget
    const files = Array.from(input.files ?? [])
    input.value = ''
    if (!files.length) return
    const articleId = selected?.id ?? selectedId
    if (!articleId) {
      showToast('Save the article before uploading photos.', 'error')
      return
    }
    if (target === 'gallery' && galleryPhotos.length + files.length > MAX_GALLERY_PHOTOS) {
      showToast(`The gallery can contain up to ${MAX_GALLERY_PHOTOS} photos.`, 'error')
      return
    }
    if (target === 'cover' && files.length > 1) {
      showToast('Choose one cover photo.', 'error')
      return
    }

    let completed = 0
    setProgress({ complete: 0, total: files.length, detail: 'Preparing photos...' })
    try {
      for (const [index, file] of files.entries()) {
        setProgress({ complete: completed, total: files.length, detail: `Compressing ${index + 1} of ${files.length}: ${file.name}` })
        const dataUrl = await compressImage(file, { maxDimension: PHOTO_MAX_DIMENSION, maxBytes: PHOTO_MAX_BYTES })
        const photoRef = doc(collection(db, 'news', articleId, 'photos'))
        const order = target === 'cover' ? -1 : Math.max(-1, ...galleryPhotos.map((photo) => photo.order)) + 1 + index
        const batch = writeBatch(db)
        batch.set(photoRef, { dataUrl, caption: '', order })
        batch.update(doc(db, 'news', articleId), {
          photoIds: arrayUnion(photoRef.id),
          ...(target === 'cover' ? { coverPhotoId: photoRef.id, coverImage: '' } : {}),
          updatedAt: serverTimestamp(),
        })
        await batch.commit()
        completed += 1
        setProgress({ complete: completed, total: files.length, detail: `Saved ${completed} of ${files.length} photos` })
      }
      showToast(target === 'cover' ? 'Cover photo saved.' : `${completed} gallery photo${completed === 1 ? '' : 's'} saved.`)
    } catch (error) {
      showToast(messageFrom(error), 'error')
    } finally {
      setProgress(null)
    }
  }

  async function saveArticle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    const form = new FormData(event.currentTarget)
    const articleId = selected?.id ?? (selectedId || doc(collection(db, 'news')).id)
    const isExistingArticle = Boolean(selected?.id || selectedId)
    const paragraphText = blocks.filter((block) => block.type === 'paragraph').map((block) => block.text).join('\n\n')
    try {
      await setDoc(doc(db, 'news', articleId), {
        title: String(form.get('title') ?? '').trim(),
        category: String(form.get('category') ?? 'Club') as NewsCategory,
        summary: String(form.get('summary') ?? '').trim(),
        body: paragraphText,
        bodyBlocks: blocks,
        publishedDate: String(form.get('publishedDate') ?? ''),
        featured: form.get('featured') === 'on',
        status: String(form.get('status') ?? 'draft') as NewsStatus,
        ...(!isExistingArticle ? { photoIds: [] } : {}),
        updatedAt: serverTimestamp(),
        ...(!isExistingArticle ? { createdAt: serverTimestamp() } : {}),
      }, { merge: true })
      setSelectedId(articleId)
      showToast(isExistingArticle ? 'News article updated.' : 'News article created. You can now add photos.')
    } catch (error) {
      showToast(messageFrom(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function deleteArticle() {
    if (!selected || !window.confirm(`Delete "${selected.title}" and its photo records?`)) return
    try {
      const batch = writeBatch(db)
      allPhotos.forEach((photo) => batch.delete(doc(db, 'news', selected.id, 'photos', photo.id)))
      batch.delete(doc(db, 'news', selected.id))
      await batch.commit()
      void logAction('Deleted a news article', selected.title)
      setSelectedId('')
      setBlocks([])
      showToast('News article deleted.')
    } catch (error) {
      showToast(messageFrom(error), 'error')
    }
  }

  async function updatePhotoCaption(photo: NewsPhoto) {
    const caption = captionDrafts[photo.id]
    if (caption === undefined || caption === photo.caption || !selected) return
    try {
      await updateDoc(doc(db, 'news', selected.id, 'photos', photo.id), { caption })
      setCaptionDrafts((current) => { const next = { ...current }; delete next[photo.id]; return next })
    } catch (error) {
      showToast(messageFrom(error), 'error')
    }
  }

  async function movePhoto(photo: NewsPhoto, offset: -1 | 1) {
    if (!selected) return
    const index = galleryPhotos.findIndex((item) => item.id === photo.id)
    const neighbor = galleryPhotos[index + offset]
    if (!neighbor) return
    const batch = writeBatch(db)
    batch.update(doc(db, 'news', selected.id, 'photos', photo.id), { order: neighbor.order })
    batch.update(doc(db, 'news', selected.id, 'photos', neighbor.id), { order: photo.order })
    try {
      await batch.commit()
    } catch (error) {
      showToast(messageFrom(error), 'error')
    }
  }

  async function removePhoto(photo: NewsPhoto) {
    if (!selected || !window.confirm('Delete this photo?')) return
    try {
      const remainingBlocks = blocks.filter((block) => block.type !== 'photo' || block.photoId !== photo.id)
      const batch = writeBatch(db)
      batch.delete(doc(db, 'news', selected.id, 'photos', photo.id))
      batch.update(doc(db, 'news', selected.id), {
        photoIds: arrayRemove(photo.id),
        bodyBlocks: remainingBlocks,
        ...(selected.coverPhotoId === photo.id ? { coverPhotoId: '', coverImage: '' } : {}),
      })
      await batch.commit()
      setBlocks(remainingBlocks)
      showToast('Photo deleted.')
    } catch (error) {
      showToast(messageFrom(error), 'error')
    }
  }

  function updateBlock(id: string, update: Partial<NewsBodyBlock>) {
    setBlocks((current) => current.map((block) => block.id === id ? { ...block, ...update } as NewsBodyBlock : block))
  }

  function moveBlock(index: number, offset: -1 | 1) {
    const nextIndex = index + offset
    if (nextIndex < 0 || nextIndex >= blocks.length) return
    setBlocks((current) => {
      const reordered = [...current]
      ;[reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]]
      return reordered
    })
  }

  return <Card className="admin-card">
    <div className="admin-card-heading"><h2>News article</h2><select aria-label="Choose news article" value={selectedId} onChange={(event) => selectArticle(event.target.value)}><option value="">Create an article</option>{news.items.map((article) => <option key={article.id} value={article.id}>{article.title || 'Untitled article'} · {article.status || 'draft'}</option>)}</select></div>
    {news.loading ? <div className="loading-list"><Skeleton /><Skeleton /></div>
      : news.error ? <p className="live-error" role="alert">News could not be loaded: {news.error}</p>
        : <form className="admin-form" key={selected?.id ?? 'new-news'} onSubmit={(event) => void saveArticle(event)}>
          <label className="admin-field"><span>Title</span><input name="title" required defaultValue={selected?.title ?? ''} /></label>
          <div className="admin-form-grid">
            <label className="admin-field"><span>Category</span><select name="category" defaultValue={selected?.category ?? 'Club'}>{(['Match', 'Club', 'Transfer', 'Community'] as const).map((category) => <option key={category}>{category}</option>)}</select></label>
            <label className="admin-field"><span>Published date</span><input name="publishedDate" type="date" required defaultValue={selected?.publishedDate ?? new Date().toISOString().slice(0, 10)} /></label>
            <label className="admin-field"><span>Status</span><select name="status" defaultValue={selected?.status ?? 'draft'}><option value="draft">Draft</option><option value="published">Published</option></select></label>
          </div>
          <label className="admin-field"><span>Summary</span><textarea className="news-editor-textarea" name="summary" rows={3} maxLength={280} required defaultValue={selected?.summary ?? ''} /></label>
          <section className="news-block-editor" aria-label="Article body blocks">
            <div className="news-editor-section-heading"><h3>Article body</h3><div className="admin-actions"><Button type="button" variant="secondary" icon={<Wand2 size={15} />} onClick={() => setPasteOpen((open) => !open)}>Paste full article</Button><Button type="button" variant="secondary" icon={<Plus size={15} />} onClick={() => setBlocks((current) => [...current, { id: blockId(), type: 'paragraph', text: '' }])}>Paragraph</Button><Button type="button" variant="secondary" icon={<Heading size={15} />} onClick={() => setBlocks((current) => [...current, { id: blockId(), type: 'heading', text: '' }])}>Heading</Button><Button type="button" variant="secondary" icon={<ImagePlus size={15} />} disabled={!galleryPhotos.length} onClick={() => setBlocks((current) => [...current, { id: blockId(), type: 'photo', photoId: galleryPhotos[0].id, caption: '' }])}>Photo</Button></div></div>
            {pasteOpen && <div className="news-paste-box">
              <p className="news-editor-help">Paste the whole article below and tap <strong>Format into article</strong>. It splits the text into paragraphs, turns ALL-CAPS section titles into headings, and tidies up symbols. Photos you already added stay in place.</p>
              <textarea className="news-editor-textarea" rows={6} value={pasteText} placeholder="Paste the article text here…" onChange={(event) => setPasteText(event.target.value)} aria-label="Paste full article" />
              <div className="admin-actions">
                <Button type="button" variant="primary" icon={<Wand2 size={15} />} disabled={!pasteText.trim()} onClick={() => {
                  const parsed = parseArticleText(pasteText)
                  if (!parsed.length) { showToast('No text found to format.', 'error'); return }
                  setBlocks((current) => [...parsed, ...current.filter((block) => block.type === 'photo')])
                  setPasteText(''); setPasteOpen(false)
                  showToast(`Formatted into ${parsed.length} block${parsed.length === 1 ? '' : 's'}. Check it over, then save.`, 'success')
                }}>Format into article</Button>
                <Button type="button" variant="secondary" onClick={() => { setPasteText(''); setPasteOpen(false) }}>Cancel</Button>
              </div>
            </div>}
            {!blocks.length && <p className="news-editor-help">Add paragraphs and photos to build the article, or use <strong>Paste full article</strong> to format a whole story at once.</p>}
            {blocks.map((block, index) => <div className="news-body-block" key={block.id}>
              <div className="news-body-block-heading"><strong>{block.type === 'paragraph' ? 'Paragraph' : block.type === 'heading' ? 'Heading' : 'Photo'}</strong><div><button type="button" aria-label="Move block up" disabled={index === 0} onClick={() => moveBlock(index, -1)}><ArrowUp size={15} /></button><button type="button" aria-label="Move block down" disabled={index === blocks.length - 1} onClick={() => moveBlock(index, 1)}><ArrowDown size={15} /></button><button type="button" aria-label="Delete block" onClick={() => setBlocks((current) => current.filter((item) => item.id !== block.id))}><Trash2 size={15} /></button></div></div>
              {block.type === 'heading'
                ? <input className="news-block-heading-input" value={block.text} placeholder="Section heading" onChange={(event) => updateBlock(block.id, { text: event.target.value })} aria-label={`Heading ${index + 1}`} />
                : block.type === 'paragraph'
                ? <textarea className="news-editor-textarea" rows={4} value={block.text} onChange={(event) => updateBlock(block.id, { text: event.target.value })} aria-label={`Paragraph ${index + 1}`} />
                : <><select className="news-block-photo-select" value={block.photoId} onChange={(event) => updateBlock(block.id, { photoId: event.target.value })} aria-label="Choose article photo">{galleryPhotos.map((photo) => <option key={photo.id} value={photo.id}>{photo.caption || `Photo ${photo.order + 1}`}</option>)}</select><input className="news-block-caption" aria-label="Optional photo caption" placeholder="Optional caption" value={block.caption ?? ''} onChange={(event) => updateBlock(block.id, { caption: event.target.value })} />{galleryPhotos.find((photo) => photo.id === block.photoId) && <img className="news-admin-cover-preview" src={galleryPhotos.find((photo) => photo.id === block.photoId)?.dataUrl} alt="Selected article photo" />}</>}
            </div>)}
          </section>
          <section className="news-photo-admin" aria-label="Article photos">
            <div className="news-editor-section-heading"><div><h3>Cover photo</h3><p className="news-editor-help">Stored separately from the article text.</p></div><div className="news-photo-upload-actions"><label className="admin-upload"><input type="file" accept="image/*" disabled={Boolean(progress) || !selected} onChange={(event) => void uploadPhotos(event, 'cover')} />{coverPreview ? 'Choose cover' : 'Choose photo'}</label><label className="admin-upload"><input type="file" accept="image/*" capture="environment" disabled={Boolean(progress) || !selected} onChange={(event) => void uploadPhotos(event, 'cover')} />Use camera</label></div></div>
            {coverPreview && <div className="news-photo-cover-preview"><img className="news-admin-cover-preview" src={coverPreview} alt="Article cover preview" />{coverPhoto && <Button type="button" variant="danger" onClick={() => void removePhoto(coverPhoto)}>Delete cover</Button>}</div>}
            <div className="news-editor-section-heading"><div><h3>Photo gallery <small>{galleryPhotos.length}/{MAX_GALLERY_PHOTOS}</small></h3><p className="news-editor-help">Each image is reduced to at most 1280px and under 150KB.</p></div><div className="news-photo-upload-actions"><label className="admin-upload"><input type="file" accept="image/*" multiple disabled={Boolean(progress) || !selected || galleryPhotos.length >= MAX_GALLERY_PHOTOS} onChange={(event) => void uploadPhotos(event, 'gallery')} />Choose from gallery</label><label className="admin-upload"><input type="file" accept="image/*" capture="environment" disabled={Boolean(progress) || !selected || galleryPhotos.length >= MAX_GALLERY_PHOTOS} onChange={(event) => void uploadPhotos(event, 'gallery')} />Use camera</label></div></div>
            {progress && <div className="news-upload-progress" role="status"><span>{progress.detail}</span><progress max={progress.total} value={progress.complete} /></div>}
            {photoState.loading ? <Skeleton className="news-photos-skeleton" /> : photoState.error ? <p className="live-error" role="alert">{photoState.error}</p> : galleryPhotos.map((photo, index) => <div className="news-photo-admin-row" key={photo.id}>
              <img src={photo.dataUrl} alt={photo.caption || `Gallery photo ${index + 1}`} loading="lazy" />
              <input className="news-block-caption" aria-label={`Caption for photo ${index + 1}`} placeholder="Photo caption" value={captionDrafts[photo.id] ?? photo.caption} onChange={(event) => setCaptionDrafts((current) => ({ ...current, [photo.id]: event.target.value }))} onBlur={() => void updatePhotoCaption(photo)} />
              <div className="news-photo-actions"><button type="button" aria-label="Move photo up" disabled={index === 0} onClick={() => void movePhoto(photo, -1)}><ArrowUp size={15} /></button><button type="button" aria-label="Move photo down" disabled={index === galleryPhotos.length - 1} onClick={() => void movePhoto(photo, 1)}><ArrowDown size={15} /></button><button type="button" aria-label="Delete photo" onClick={() => void removePhoto(photo)}><Trash2 size={15} /></button></div>
            </div>)}
          </section>
          <label className="membership-active-field"><input type="checkbox" name="featured" defaultChecked={selected?.featured ?? false} /><span>Featured article</span></label>
          <div className="admin-actions"><Button type="submit" disabled={saving || Boolean(progress)}>{saving ? 'Saving...' : selectedId ? 'Save article' : 'Create article'}</Button>{selected && <Button type="button" variant="danger" disabled={photoState.loading || Boolean(photoState.error)} onClick={() => void deleteArticle()}>Delete article</Button>}</div>
        </form>}
  </Card>
}
