import { useRef, useState } from 'react'
import { Check, Copy, Download, Share2 } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'

const installUrl = new URL('/download', window.location.origin).toString()

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }
  const input = document.createElement('textarea')
  input.value = value
  input.setAttribute('readonly', '')
  input.style.position = 'fixed'
  input.style.opacity = '0'
  document.body.append(input)
  input.select()
  const copied = document.execCommand('copy')
  input.remove()
  if (!copied) throw new Error('Copy is unavailable in this browser.')
}

export default function InstallSharePanel({ compact = false }: { compact?: boolean }) {
  const qrRef = useRef<SVGSVGElement | null>(null)
  const [message, setMessage] = useState('')

  async function shareLink() {
    setMessage('')
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Ekhaya FC', text: 'Get the Ekhaya FC app', url: installUrl })
        return
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return
      }
    }
    try {
      await copyText(installUrl)
      setMessage('Link copied.')
    } catch {
      setMessage('Could not copy the link. Please copy it from your address bar.')
    }
  }

  async function copyLink() {
    setMessage('')
    try {
      await copyText(installUrl)
      setMessage('Link copied.')
    } catch {
      setMessage('Could not copy the link. Please copy it from your address bar.')
    }
  }

  function downloadQr() {
    if (!qrRef.current) return
    const svg = new XMLSerializer().serializeToString(qrRef.current)
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = 'ekhaya-fc-install-qr.svg'
    anchor.click()
    URL.revokeObjectURL(objectUrl)
  }

  return <section className={`install-share${compact ? ' install-share-compact' : ''}`} aria-label="Share the Ekhaya FC app">
    <div className="install-share-copy">
      <span className="page-eyebrow">Share with a supporter</span>
      <h2>Bring a fan closer</h2>
      <p>Share the install link or scan the code at the next match.</p>
      <div className="install-share-actions">
        <button className="button button-primary" type="button" onClick={() => void shareLink()}><Share2 size={17} aria-hidden="true" />Share app</button>
        <button className="button button-secondary" type="button" onClick={() => void copyLink()}><Copy size={16} aria-hidden="true" />Copy link</button>
      </div>
      <code className="install-share-url">{installUrl}</code>
      {message && <p className="install-share-message" role="status">{message}</p>}
    </div>
    <div className="install-qr-block">
      <div className="install-qr"><QRCodeSVG ref={qrRef} value={installUrl} size={148} level="H" includeMargin aria-label="QR code to install the Ekhaya FC app" /></div>
      <button className="button button-secondary install-qr-download" type="button" onClick={downloadQr}><Download size={16} aria-hidden="true" />Download QR</button>
      <span className="install-qr-status"><Check size={13} aria-hidden="true" />Ready to scan</span>
    </div>
  </section>
}
