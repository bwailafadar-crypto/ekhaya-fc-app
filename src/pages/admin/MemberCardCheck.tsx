import { collection, getDocs, limit, query, where } from 'firebase/firestore'
import { Camera, CheckCircle2, ScanLine, XCircle } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button, Card } from '../../components/UI'
import { db } from '../../firebase'

type Result = { name: string; fanId: string; tier: string; status: string; expiry: string | null; valid: boolean } | 'none' | null

function dateOf(value: unknown) {
  const date = value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: unknown }).toDate === 'function'
    ? (value as { toDate: () => Date }).toDate() : typeof value === 'string' ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date : null
}

/** Reads "EKHAYA-FC|<fan id>|<email>" from a member card QR, or a typed fan ID. */
function fanIdFrom(text: string) {
  const parts = text.trim().split('|')
  return (parts[0] === 'EKHAYA-FC' ? parts[1] : text).trim()
}

type Detector = { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> }

/**
 * Gate check for the superadmin: scan a fan's digital membership card (or type
 * the Fan ID) and see at once whether the membership is active.
 */
export default function MemberCardCheck() {
  const [result, setResult] = useState<Result>(null)
  const [busy, setBusy] = useState(false)
  const [scanning, setScanning] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  const canScan = typeof window !== 'undefined' && 'BarcodeDetector' in window

  async function look(raw: string) {
    const fanId = fanIdFrom(raw)
    if (!fanId) return
    setBusy(true)
    try {
      const [members, legacy] = await Promise.all([
        getDocs(query(collection(db, 'memberships'), where('fanId', '==', fanId), limit(1))),
        getDocs(query(collection(db, 'fans'), where('fanId', '==', fanId), limit(1))).catch(() => null),
      ])
      const data = members.docs[0]?.data() ?? legacy?.docs[0]?.data()
      if (!data) { setResult('none'); return }
      const expiry = dateOf(data.expiryDate)
      const status = String(data.status ?? '').toLowerCase()
      setResult({ name: String(data.fullName ?? 'Member'), fanId, tier: String(data.tierId ?? data.tier ?? '—'), status, expiry: expiry ? expiry.toLocaleDateString() : null, valid: status === 'active' && (!expiry || expiry.getTime() > Date.now()) })
    } catch {
      setResult('none')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!scanning) return
    let stream: MediaStream | null = null
    let timer = 0
    let stopped = false
    const Ctor = (window as unknown as { BarcodeDetector: new (options: { formats: string[] }) => Detector }).BarcodeDetector
    const detector = new Ctor({ formats: ['qr_code'] })
    void navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then((media) => {
      if (stopped) { media.getTracks().forEach((track) => track.stop()); return }
      stream = media
      if (video.current) { video.current.srcObject = media; void video.current.play() }
      const tick = async () => {
        if (stopped || !video.current) return
        try {
          const codes = await detector.detect(video.current)
          if (codes[0]?.rawValue) { setScanning(false); void look(codes[0].rawValue); return }
        } catch { /* keep trying */ }
        timer = window.setTimeout(() => void tick(), 300)
      }
      void tick()
    }).catch(() => setScanning(false))
    return () => { stopped = true; window.clearTimeout(timer); stream?.getTracks().forEach((track) => track.stop()) }
  }, [scanning])

  return <Card className="admin-card member-check">
    <div className="sq-head"><ScanLine size={18} aria-hidden="true" /><div><h2>Check a member card</h2><span>At the gate: scan the QR on the fan's Profile, or type the Fan ID</span></div></div>
    {scanning && <video ref={video} className="member-check-video" playsInline muted />}
    <div className="member-check-actions">
      {canScan && <Button type="button" variant="secondary" icon={<Camera size={16} />} onClick={() => { setResult(null); setScanning((value) => !value) }}>{scanning ? 'Stop camera' : 'Scan QR'}</Button>}
      <form onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void look(String(new FormData(event.currentTarget).get('fanId') ?? '')) }}>
        <input name="fanId" placeholder="Fan ID, e.g. EFC-0123" aria-label="Fan ID" />
        <Button type="submit" disabled={busy}>{busy ? 'Checking…' : 'Check'}</Button>
      </form>
    </div>
    {result === 'none' && <p className="member-check-result bad"><XCircle size={18} aria-hidden="true" /> No member found with that Fan ID.</p>}
    {result && result !== 'none' && <div className={`member-check-result ${result.valid ? 'good' : 'bad'}`}>
      {result.valid ? <CheckCircle2 size={22} aria-hidden="true" /> : <XCircle size={22} aria-hidden="true" />}
      <div><strong>{result.valid ? 'Valid member' : 'Not valid'} · {result.name}</strong><span>{result.fanId} · {result.tier} · {result.status || 'unknown'}{result.expiry ? ` · until ${result.expiry}` : ''}</span></div>
    </div>}
  </Card>
}
