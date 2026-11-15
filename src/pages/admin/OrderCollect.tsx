import { collection, doc, getDocs, limit, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'
import { AlertTriangle, Ban, CheckCircle2, ScanLine, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { Button } from '../../components/UI'
import { useToast } from '../../components/ToastContext'
import { db } from '../../firebase'
import { logAction } from '../../utils/audit'
import { mwk, type ShopOrder } from '../../utils/shop'

type Found = ShopOrder | 'none' | null

/** Staff scan or type a collection pass to verify payment and hand the order over once. */
export default function OrderCollect() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [code, setCode] = useState('')
  const [order, setOrder] = useState<Found>(null)
  const [busy, setBusy] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [msg, setMsg] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const canScan = typeof window !== 'undefined' && 'BarcodeDetector' in window

  async function lookup(raw: string) {
    const clean = raw.trim().toUpperCase().replace(/^EKHAYA:/, '')
    if (!/^EK-[A-Z0-9#@*]{5,8}$/.test(clean)) { setMsg('That is not a valid order code (looks like EK-A2#9B).'); return }
    setMsg(''); setBusy(true); setOrder(null)
    try {
      const snap = await getDocs(query(collection(db, 'shopOrders'), where('ref', '==', clean), limit(1)))
      setOrder(snap.empty ? 'none' : { ...(snap.docs[0].data() as ShopOrder), id: snap.docs[0].id })
    } catch (error) { setMsg(error instanceof Error ? error.message : 'Lookup failed.') }
    finally { setBusy(false) }
  }

  async function markCollected() {
    if (!order || order === 'none') return
    setBusy(true)
    try {
      await updateDoc(doc(db, 'shopOrders', order.id), { status: 'collected', collectedAt: serverTimestamp(), collectedBy: user?.uid ?? '', updatedAt: serverTimestamp() })
      void logAction('Order collected', `${order.ref} · ${order.name} · ${mwk(order.total)}`)
      setOrder({ ...order, status: 'collected' })
      showToast('Handed over. Order marked collected.')
    } catch (error) { setMsg(error instanceof Error ? error.message : 'Could not mark collected.') }
    finally { setBusy(false) }
  }

  // Camera scanning with the native BarcodeDetector (works on Android Chrome).
  useEffect(() => {
    if (!scanning || !canScan) return
    let stream: MediaStream | null = null
    let timer = 0
    let stopped = false
    const Detector = (window as unknown as { BarcodeDetector: new (o: { formats: string[] }) => { detect: (s: CanvasImageSource) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector
    const detector = new Detector({ formats: ['qr_code'] })
    const run = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return }
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play() }
        const tick = async () => {
          if (stopped || !videoRef.current) return
          try {
            const codes = await detector.detect(videoRef.current)
            if (codes[0]?.rawValue) { setScanning(false); void lookup(codes[0].rawValue); return }
          } catch { /* keep scanning */ }
          timer = window.setTimeout(() => void tick(), 350)
        }
        timer = window.setTimeout(() => void tick(), 400)
      } catch { setMsg('Could not open the camera. Type the code instead.'); setScanning(false) }
    }
    void run()
    return () => { stopped = true; window.clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()) }
  }, [scanning, canScan])

  const ok = order && order !== 'none'
  const paid = ok && (order.status === 'paid' || order.status === 'ready')
  const collected = ok && order.status === 'collected'
  const unpaid = ok && (order.status === 'new' || order.status === 'confirmed')
  const cancelled = ok && order.status === 'cancelled'

  return <div className="collect">
    <p className="live-help">Scan or type the fan's collection pass. Only hand over a jersey when it shows <b>green</b>. A pass already collected shows red — it may be a copy.</p>

    {scanning
      ? <div className="collect-scan"><video ref={videoRef} playsInline muted /><div className="collect-scan-frame" aria-hidden="true" /><button type="button" className="collect-scan-close" onClick={() => setScanning(false)} aria-label="Stop scanning"><X size={18} /></button></div>
      : canScan && <Button type="button" variant="secondary" onClick={() => { setOrder(null); setMsg(''); setScanning(true) }}><ScanLine size={16} /> Scan collection pass</Button>}

    <form className="collect-manual" onSubmit={(e) => { e.preventDefault(); void lookup(code) }}>
      <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Or type code, e.g. EK-7K#M9Q" maxLength={9} aria-label="Order code" />
      <Button type="submit" disabled={busy || !code.trim()}>Check</Button>
    </form>

    {msg && <p className="collect-msg"><AlertTriangle size={14} /> {msg}</p>}

    {order === 'none' && <div className="collect-card bad"><Ban size={22} /><div><strong>No order found</strong><span>No order has that code. Do not hand anything over.</span></div></div>}

    {ok && <div className={`collect-card ${collected ? 'bad' : paid ? 'good' : 'warn'}`}>
      {collected ? <Ban size={22} /> : paid ? <CheckCircle2 size={22} /> : <AlertTriangle size={22} />}
      <div className="collect-detail">
        <strong>{order.ref} · {order.name}</strong>
        <span className="collect-items">{order.lines.map((l) => `${l.qty} × ${l.name}${l.size ? ` (${l.size})` : ''}${l.printName || l.printNumber ? ` [${l.printName ?? ''} ${l.printNumber ?? ''}]`.trim() + ']' : ''}`).join(', ')}</span>
        <span className="collect-total">{mwk(order.total)} · {order.phone}</span>
        {collected
          ? <span className="collect-verdict">⛔ ALREADY COLLECTED{order.collectedAt?.seconds ? ` on ${new Date(order.collectedAt.seconds * 1000).toLocaleString()}` : ''}. This may be a copy — do not hand over.</span>
          : paid
            ? <span className="collect-verdict">✓ PAID. Check the name, then hand over and mark collected.</span>
            : unpaid ? <span className="collect-verdict">⚠ NOT PAID YET. Take payment first — do not hand over.</span>
              : cancelled ? <span className="collect-verdict">⚠ This order was cancelled.</span> : null}
        {paid && <Button type="button" disabled={busy} onClick={() => void markCollected()}><CheckCircle2 size={15} /> Hand over &amp; mark collected</Button>}
      </div>
    </div>}
  </div>
}
