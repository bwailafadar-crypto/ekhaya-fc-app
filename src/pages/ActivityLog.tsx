// Superadmin: who did what, and when (auditLogs). Entries can't be changed or deleted.
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore'
import { ScrollText } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Card, EmptyState, PageHeader } from '../components/UI'
import { db } from '../firebase'

type Entry = { id: string; action: string; detail?: string; by: string; byName?: string; at?: { toMillis?: () => number } }

export default function ActivityLog() {
  const [items, setItems] = useState<Entry[] | null>(null)
  const [who, setWho] = useState('')
  const [text, setText] = useState('')
  useEffect(() => onSnapshot(query(collection(db, 'auditLogs'), orderBy('at', 'desc'), limit(400)), (s) => setItems(s.docs.map((d) => ({ ...(d.data() as Entry), id: d.id }))), () => setItems([])), [])
  const people = useMemo(() => [...new Map((items ?? []).map((e) => [e.by, e.byName || e.by])).entries()], [items])
  const shown = (items ?? []).filter((e) => (!who || e.by === who) && (!text || `${e.action} ${e.detail ?? ''}`.toLowerCase().includes(text.toLowerCase())))
  const rows = shown.map((e, i) => {
    const ms = e.at?.toMillis?.() ?? 0
    const day = ms ? new Date(ms).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : 'Just now'
    const prev = shown[i - 1]?.at?.toMillis?.() ?? 0
    const prevDay = i === 0 ? '' : prev ? new Date(prev).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : 'Just now'
    return { e, ms, head: day !== prevDay ? day : '' }
  })
  return <div className="activity-log">
    <PageHeader eyebrow="Superadmin" title="Activity log" description="Every important change by an admin: who, what and when. Entries cannot be edited or deleted." />
    <div className="al-filters">
      <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Person"><option value="">Everyone</option>{people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search (e.g. order, admin, switch)" aria-label="Search" />
    </div>
    {items === null ? <p className="page-loading">Loading…</p> : !shown.length ? <Card><EmptyState icon={ScrollText} title="Nothing yet" description="Admin changes (orders marked paid, prices, players, switches, new admins…) will be listed here." /></Card>
      : <ul className="al-list">{rows.map(({ e, ms, head }) => {
        return <li key={e.id}>
          {head && <h3>{head}</h3>}
          <div className={`al-row${/admin|delet|removed|switch|settings|key|block/i.test(e.action) ? ' strong' : ''}`}>
            <time>{ms ? new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : 'now'}</time>
            <div><b>{e.action}</b>{e.detail && <span>{e.detail}</span>}<small>by {e.byName || 'unknown'}</small></div>
          </div>
        </li>
      })}</ul>}
  </div>
}
