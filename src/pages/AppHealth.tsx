import { collection, deleteDoc, doc, getDocsFromServer, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, type DocumentData } from 'firebase/firestore'
import { Activity, AlertTriangle, Database, Flag, Megaphone, RefreshCw, Trash2 } from 'lucide-react'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useToast } from '../components/ToastContext'
import { Badge, Button, Card, PageHeader } from '../components/UI'
import { config } from '../config'
import { FLAGS, flagValue, getFlags, saveFlags, subscribeFlags, type FlagName } from '../data/flags'
import { SNAPSHOT_REF } from '../data/publicSnapshot'
import { buildMatchSnapshot, buildTeamsSnapshot } from '../data/snapshotPayload'
import { db } from '../firebase'

type ErrorRow = { id: string; context: string; message: string; code: string; path: string; build: string; env: string; agent: string; createdAt?: { toMillis?: () => number } }

function when(ms?: number) {
  return ms ? new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—'
}

function SnapshotCard() {
  const { showToast } = useToast()
  const [info, setInfo] = useState<DocumentData | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => onSnapshot(SNAPSHOT_REF(), (snapshot) => setInfo(snapshot.exists() ? snapshot.data() : {}), () => setInfo({})), [])
  const bytes = Number(info?.bytes ?? 0)
  const percent = Math.round((bytes / 1048576) * 100)

  async function rebuild() {
    setBusy(true)
    try {
      // Straight from the server, never from this phone's saved copy.
      const [fixtures, standings, teams] = await Promise.all(['fixtures', 'standings', 'teams'].map((name) => getDocsFromServer(collection(db, name))))
      const rows = (snap: typeof fixtures) => snap.docs.map((item) => ({ ...item.data(), id: item.id }))
      const match = buildMatchSnapshot({ fixtures: rows(fixtures), standings: rows(standings) })
      const clubs = buildTeamsSnapshot(rows(teams))
      await setDoc(SNAPSHOT_REF('snapshot'), { ...match.doc, updatedAt: serverTimestamp() })
      await setDoc(SNAPSHOT_REF('teams'), { ...clubs.doc, updatedAt: serverTimestamp() })
      showToast('Shared data rebuilt.', 'success')
    } catch {
      showToast('Could not rebuild. Check your connection.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="fz-card">
      <div className="fz-card-heading"><Database size={18} aria-hidden="true" /><div><h2>Shared fan data</h2><span>Fixtures and table in one document</span></div></div>
      {info === null ? <p className="fz-note">Checking…</p>
        : info.disabled ? <p className="fz-result">Switched off ({String(info.reason ?? 'unknown')}). Fans read the collections directly.</p>
        : !info.hash ? <p className="fz-result">Not built yet. Fans read the collections directly until it is.</p>
        : <ul className="health-list">
            <li><span>Last updated</span><strong>{when(info.updatedAt?.toMillis?.())}</strong></li>
            <li><span>Contents</span><strong>{(info.fixtures ?? []).length} fixtures · {(info.standings ?? []).length} table rows (teams kept separately)</strong></li>
            <li><span>Size</span><strong>{Math.round(bytes / 1024)} KB · {percent}% of the limit</strong></li>
          </ul>}
      <p className="fz-note">Each fan reads this once per visit instead of 70+ separate records. It updates by itself when an admin changes fixtures, the table or teams.</p>
      <Button type="button" variant="secondary" disabled={busy} onClick={() => void rebuild()}><RefreshCw size={15} /> {busy ? 'Rebuilding…' : 'Rebuild now'}</Button>
    </Card>
  )
}

function FlagsCard() {
  const { role } = useAuth()
  const { showToast } = useToast()
  const state = useSyncExternalStore(subscribeFlags, getFlags)
  const canEdit = role === 'superadmin'
  const [draft, setDraft] = useState<{ flags: Partial<Record<FlagName, boolean>>; notice: string } | null>(null)
  const current = draft ?? { flags: Object.fromEntries((Object.keys(FLAGS) as FlagName[]).map((name) => [name, flagValue(state, name)])), notice: state.notice }
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try { await saveFlags(current.flags, current.notice); setDraft(null); showToast('Saved. Every fan gets the change straight away.', 'success') } catch (error) { if ((error as Error).message !== 'cancelled') showToast('Not saved. Only the superadmin can change these.', 'error') } finally { setSaving(false) }
  }

  return (
    <Card className="fz-card">
      <div className="fz-card-heading"><Flag size={18} aria-hidden="true" /><div><h2>Feature switches</h2><span>Turn features on or off for everyone, no deploy needed</span></div></div>
      <ul className="health-flags">
        {(Object.keys(FLAGS) as FlagName[]).map((name) => <li key={name}>
          <label>
            <input type="checkbox" checked={Boolean(current.flags[name])} disabled={!canEdit} onChange={(event) => setDraft({ ...current, flags: { ...current.flags, [name]: event.target.checked } })} />
            <span>{FLAGS[name].label}</span>
          </label>
        </li>)}
      </ul>
      <label className="admin-field"><span><Megaphone size={12} aria-hidden="true" /> Club notice (shown at the top of every page, leave empty for none)</span>
        <input value={current.notice} maxLength={200} disabled={!canEdit} placeholder="e.g. Kick-off moved to 3pm today" onChange={(event) => setDraft({ ...current, notice: event.target.value })} />
      </label>
      {canEdit ? <Button type="button" disabled={saving || !draft} onClick={() => void save()}>{saving ? 'Saving…' : 'Save switches'}</Button>
        : <p className="fz-note">Only the superadmin can change these.</p>}
    </Card>
  )
}

function ErrorsCard() {
  const { showToast } = useToast()
  const [rows, setRows] = useState<ErrorRow[] | null>(null)
  useEffect(() => onSnapshot(query(collection(db, 'clientErrors'), orderBy('createdAt', 'desc'), limit(40)), (snapshot) => {
    setRows(snapshot.docs.map((item) => ({ ...(item.data() as Omit<ErrorRow, 'id'>), id: item.id })))
  }, () => setRows([])), [])
  const groups = new Map<string, { row: ErrorRow; count: number }>()
  for (const row of rows ?? []) {
    const key = `${row.context}|${row.message}`
    const group = groups.get(key)
    if (group) group.count += 1
    else groups.set(key, { row, count: 1 })
  }

  async function clear() {
    if (!rows?.length || !window.confirm('Clear the error list?')) return
    try { await Promise.all(rows.map((row) => deleteDoc(doc(db, 'clientErrors', row.id)))); showToast('Cleared.', 'success') } catch { showToast('Could not clear.', 'error') }
  }

  return (
    <Card className="fz-card">
      <div className="fz-card-heading"><AlertTriangle size={18} aria-hidden="true" /><div><h2>Errors fans hit</h2><span>Last 40 reports, newest first</span></div></div>
      {rows === null ? <p className="fz-note">Loading…</p>
        : !groups.size ? <p className="fz-result fz-result-win">No errors reported. 🎉</p>
        : <ul className="health-errors">{[...groups.values()].map(({ row, count }) => <li key={row.id}>
            <div><Badge variant={count > 2 ? 'danger' : 'default'}>{count}×</Badge> <strong>{row.context}</strong> <small>{when(row.createdAt?.toMillis?.())}</small></div>
            <p>{row.message}{row.code ? ` (${row.code})` : ''}</p>
            <small>{row.path} · build {row.build} · {row.env}</small>
          </li>)}</ul>}
      {Boolean(rows?.length) && <Button type="button" variant="ghost" onClick={() => void clear()}><Trash2 size={15} /> Clear list</Button>}
    </Card>
  )
}

export default function AppHealth() {
  return <div className="fan-zone">
    <PageHeader eyebrow="Admin" title="App health" description="How the app is running, feature switches and errors." />
    <Card className="fz-card">
      <div className="fz-card-heading"><Activity size={18} aria-hidden="true" /><div><h2>This version</h2><span>What this device is running</span></div></div>
      <ul className="health-list">
        <li><span>Environment</span><strong>{config.environment}</strong></li>
        <li><span>Version</span><strong>{config.build}</strong></li>
        <li><span>Connection</span><strong>{navigator.onLine ? 'Online' : 'Offline'}</strong></li>
      </ul>
    </Card>
    <SnapshotCard />
    <FlagsCard />
    <ErrorsCard />
  </div>
}
