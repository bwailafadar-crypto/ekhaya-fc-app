import { collection, doc, getCountFromServer, getDoc, getDocs, onSnapshot, limit, orderBy, query, serverTimestamp, startAfter, Timestamp, updateDoc, where, writeBatch, type DocumentData, type QueryDocumentSnapshot } from 'firebase/firestore'
import { Activity, BellRing, Clock3, Download, Search, ShieldCheck, Trash2, UserCheck, UserPlus, Users, UserX } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { getUsersSeenAt, markUsersSeen, requestPhoneAlerts } from '../../utils/adminAlerts'
import { getAdminSounds, playAdminSound, setAdminSounds } from '../../utils/adminSound'
import { useToast } from '../../components/ToastContext'
import { Button, Card, Skeleton } from '../../components/UI'
import { db } from '../../firebase'
import { logAction } from '../../utils/audit'
import { confirmIdentity } from '../../utils/reauth'

const PAGE_SIZE = 25
const DAY = 24 * 60 * 60 * 1000

type FanAccount = {
  id: string
  role: 'fan' | 'admin' | 'superadmin'
  email: string
  fullName: string
  phone: string | null
  disabled: boolean
  createdAt: Date | null
  photoDataUrl: string | null
}

type Stats = { total: number; today: number; week: number; admins: number; blocked: number; pending: number }
type Filter = 'all' | 'fans' | 'admins' | 'blocked' | 'new' | 'online' | 'today'
type FanActivity = { lastSeen: Date | null; since: Date | null; day: string; minutesTotal: number; minutesToday: number; visits: number }
const ONLINE_MS = 7 * 60 * 1000
const malawiDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Blantyre' }).format(new Date())

/** "2 h 05 min" style. */
function minutesLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  return `${hours} h ${String(minutes % 60).padStart(2, '0')} min`
}

function seenLabel(date: Date | null, now: number) {
  if (!date) return 'Not seen yet'
  const ago = now - date.getTime()
  if (ago < ONLINE_MS) return 'In the app now'
  if (ago < 60 * 60 * 1000) return `Last seen ${Math.round(ago / 60000)} min ago`
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (ago < DAY && new Date(now).getDate() === date.getDate()) return `Last seen today, ${time}`
  if (ago < 2 * DAY) return `Last seen yesterday, ${time}`
  return `Last seen ${date.toLocaleDateString()}, ${time}`
}

function toAccount(snapshot: QueryDocumentSnapshot<DocumentData>): FanAccount {
  const data = snapshot.data()
  const role = data.role === 'admin' || data.role === 'superadmin' ? data.role : 'fan'
  return {
    id: snapshot.id,
    role,
    email: typeof data.email === 'string' ? data.email : '',
    fullName: typeof data.fullName === 'string' ? data.fullName : '',
    phone: typeof data.phone === 'string' ? data.phone : null,
    disabled: data.disabled === true,
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null,
    photoDataUrl: typeof data.photoDataUrl === 'string' ? data.photoDataUrl : null,
  }
}

function initials(account: FanAccount) {
  const source = account.fullName || account.email || '?'
  return source.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')
}

function joinedLabel(date: Date | null) {
  if (!date) return 'Join date unknown'
  const days = Math.floor((Date.now() - date.getTime()) / DAY)
  if (days <= 0) return `Joined today, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  if (days === 1) return 'Joined yesterday'
  if (days < 7) return `Joined ${days} days ago`
  return `Joined ${date.toLocaleDateString()}`
}

function csvCell(raw: string) {
  // Stop spreadsheet formulas hidden in names (e.g. "=HYPERLINK(...)") from running.
  const value = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export default function FansManager({ onOpenRequests }: { onOpenRequests: () => void }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [seenAt] = useState(getUsersSeenAt)
  const [stats, setStats] = useState<Stats | null>(null)
  const [accounts, setAccounts] = useState<FanAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [exporting, setExporting] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [alertsState, setAlertsState] = useState(() => ('Notification' in window ? Notification.permission : 'unsupported'))
  const cursor = useRef<QueryDocumentSnapshot<DocumentData> | null>(null)
  // Time in the app, live: last seen, minutes today and in total, visits.
  const [activity, setActivity] = useState<Map<string, FanActivity>>(new Map())
  const [now, setNow] = useState(() => Date.now())
  const [names, setNames] = useState<Record<string, string>>({})
  const [sounds, setSoundState] = useState(getAdminSounds)
  useEffect(() => onSnapshot(collection(db, 'activity'), (snapshot) => setActivity(new Map(snapshot.docs.map((item) => {
    const data = item.data()
    return [item.id, { lastSeen: data.lastSeenAt instanceof Timestamp ? data.lastSeenAt.toDate() : null, since: data.sessionStartedAt instanceof Timestamp ? data.sessionStartedAt.toDate() : null, day: String(data.day ?? ''), minutesTotal: Number(data.minutesTotal ?? 0), minutesToday: Number(data.minutesToday ?? 0), visits: Number(data.visits ?? 0) }]
  }))), () => undefined), [])
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30000); return () => window.clearInterval(timer) }, [])
  const today = malawiDay()
  const todayMinutes = (item?: FanActivity) => (item && item.day === today ? item.minutesToday : 0)
  const online = [...activity.entries()].filter(([, item]) => item.lastSeen && now - item.lastSeen.getTime() < ONLINE_MS)
  const activeToday = [...activity.entries()].filter(([, item]) => item.day === today)
  const topToday = [...activeToday].sort((a, b) => todayMinutes(b[1]) - todayMinutes(a[1])).slice(0, 10)
  // Names for fans in the activity panels who are not in the loaded page.
  const nameIds = [...online, ...topToday].map(([id]) => id).join(',')
  useEffect(() => {
    const wanted = nameIds.split(',').filter(Boolean).filter((id) => !(id in names) && !accounts.some((account) => account.id === id)).slice(0, 30)
    if (!wanted.length) return
    let active = true
    void Promise.all(wanted.map(async (id) => { try { const snap = await getDoc(doc(db, 'users', id)); return [id, String(snap.data()?.fullName || snap.data()?.email || 'Fan')] as const } catch { return [id, 'Fan'] as const } }))
      .then((pairs) => { if (active) setNames((current) => ({ ...current, ...Object.fromEntries(pairs) })) })
    return () => { active = false }
  }, [nameIds, accounts, names])
  const nameOf = (id: string) => accounts.find((account) => account.id === id)?.fullName || names[id] || 'Fan'

  const fetchStats = useCallback(async (): Promise<Stats> => {
    const users = collection(db, 'users')
    const count = async (q: Parameters<typeof getCountFromServer>[0]) => (await getCountFromServer(q)).data().count
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const [total, today, week, admins, blocked, pending] = await Promise.all([
      count(users),
      count(query(users, where('createdAt', '>=', Timestamp.fromDate(startOfToday)))),
      count(query(users, where('createdAt', '>=', Timestamp.fromMillis(Date.now() - 7 * DAY)))),
      count(query(users, where('role', 'in', ['admin', 'superadmin']))),
      count(query(users, where('disabled', '==', true))),
      count(query(collection(db, 'memberships'), where('status', '==', 'pending'))),
    ])
    return { total, today, week, admins, blocked, pending }
  }, [])
  const loadStats = useCallback(async () => setStats(await fetchStats()), [fetchStats])

  const fetchPage = useCallback(async (reset: boolean) => {
    const base = query(collection(db, 'users'), orderBy('createdAt', 'desc'))
    const pageQuery = !reset && cursor.current
      ? query(base, startAfter(cursor.current), limit(PAGE_SIZE + 1))
      : query(base, limit(PAGE_SIZE + 1))
    const snapshot = await getDocs(pageQuery)
    const docs = snapshot.docs.slice(0, PAGE_SIZE)
    cursor.current = docs.at(-1) ?? cursor.current
    return { next: docs.map(toAccount), more: snapshot.docs.length > PAGE_SIZE }
  }, [])

  useEffect(() => {
    let active = true
    cursor.current = null
    Promise.all([fetchStats(), fetchPage(true)])
      .then(([nextStats, page]) => {
        if (!active) return
        setStats(nextStats)
        setAccounts(page.next)
        setHasMore(page.more)
        setError('')
      })
      .catch(() => { if (active) setError('Fan accounts could not be loaded. Check your connection and try again.') })
      .finally(() => { if (active) setLoading(false) })
    // Opening this page counts as having seen the new-fan alerts.
    markUsersSeen()
    return () => { active = false }
  }, [fetchStats, fetchPage])

  async function loadMore() {
    setLoadingMore(true)
    try {
      const page = await fetchPage(false)
      setAccounts((current) => [...current, ...page.next])
      setHasMore(page.more)
    } catch {
      showToast('More fans could not be loaded.', 'error')
    } finally {
      setLoadingMore(false)
    }
  }

  async function changeAccount(account: FanAccount, change: { role?: 'fan' | 'admin'; disabled?: boolean }, question: string, done: string) {
    if (!window.confirm(question)) return
    if (change.role && !(await confirmIdentity(change.role === 'admin' ? 'Making someone an admin gives them control of the app.' : 'Changing who is an admin.'))) return
    setBusyId(account.id)
    try {
      await updateDoc(doc(db, 'users', account.id), { ...change, updatedAt: serverTimestamp() })
      void logAction(change.role ? (change.role === 'admin' ? 'Made admin' : 'Removed admin') : change.disabled ? 'Blocked a fan' : 'Unblocked a fan', `${account.fullName || ''} ${account.email || ''}`.trim())
      setAccounts((current) => current.map((item) => (item.id === account.id ? { ...item, ...change } : item)))
      showToast(done)
      void loadStats().catch(() => undefined)
    } catch {
      showToast('That change was not saved. Check your connection and try again.', 'error')
    } finally {
      setBusyId('')
    }
  }

  async function deleteAccount(account: FanAccount) {
    const name = account.fullName || account.email || 'this fan'
    const typed = window.prompt(`Delete ${name}'s account data? This permanently removes their profile and any membership.\n\nIf they sign in again they start fresh as a new fan. To keep them out for good, use Block instead.\n\nType DELETE to confirm.`)
    if (typed?.trim().toUpperCase() !== 'DELETE') return
    if (!(await confirmIdentity('Deleting an account cannot be undone.'))) return
    setBusyId(account.id)
    try {
      const batch = writeBatch(db)
      batch.delete(doc(db, 'memberships', account.id))
      batch.delete(doc(db, 'fanCards', account.id))
      batch.delete(doc(db, 'activity', account.id))
      batch.delete(doc(db, 'referrals', account.id))
      batch.delete(doc(db, 'users', account.id))
      await batch.commit()
      void logAction('Deleted an account', `${account.fullName || ''} ${account.email || ''}`.trim())
      setAccounts((current) => current.filter((item) => item.id !== account.id))
      showToast(`${name} deleted.`)
      void loadStats().catch(() => undefined)
    } catch {
      showToast('The account was not deleted. Check your connection and try again.', 'error')
    } finally {
      setBusyId('')
    }
  }

  async function exportCsv() {
    setExporting(true)
    try {
      const snapshot = await getDocs(collection(db, 'users'))
      const rows = snapshot.docs.map(toAccount).sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
      const lines = [
        ['Name', 'Email', 'Phone', 'Role', 'Status', 'Joined', 'Last seen', 'Minutes today', 'Minutes in total', 'Visits'].join(','),
        ...rows.map((row) => { const a = activity.get(row.id); return [row.fullName, row.email, row.phone ?? '', row.role, row.disabled ? 'blocked' : 'active', row.createdAt?.toISOString() ?? '', a?.lastSeen?.toISOString() ?? '', String(todayMinutes(a)), String(a?.minutesTotal ?? 0), String(a?.visits ?? 0)].map(csvCell).join(',') }),
      ]
      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `ekhaya-fans-${new Date().toISOString().slice(0, 10)}.csv`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 2000)
      showToast(`Downloaded ${rows.length} fan accounts.`)
    } catch {
      showToast('The fan list could not be downloaded.', 'error')
    } finally {
      setExporting(false)
    }
  }

  async function turnOnAlerts() {
    const result = await requestPhoneAlerts()
    setAlertsState(result)
    if (result === 'granted') showToast('Alerts are on for this device while the app is open.')
    else if (result === 'denied') showToast('Alerts are blocked. Allow notifications for this site in your browser settings.', 'error')
  }

  const visible = (() => {
    const term = search.trim().toLowerCase()
    return accounts.filter((account) => {
      if (filter === 'fans' && account.role !== 'fan') return false
      if (filter === 'admins' && account.role === 'fan') return false
      if (filter === 'blocked' && !account.disabled) return false
      if (filter === 'new' && !(account.createdAt && account.createdAt.getTime() > seenAt)) return false
      if (filter === 'online' && !online.some(([id]) => id === account.id)) return false
      if (filter === 'today' && activity.get(account.id)?.day !== today) return false
      if (!term) return true
      return [account.fullName, account.email, account.phone ?? ''].some((value) => value.toLowerCase().includes(term))
    })
  })()

  if (loading) return <div className="loading-list"><Skeleton /><Skeleton /><Skeleton /></div>
  if (error) return <p className="live-error" role="alert">{error}</p>

  const tiles = [
    { label: 'Total fans', value: stats?.total ?? 0, icon: Users },
    { label: 'Joined today', value: stats?.today ?? 0, icon: UserPlus },
    { label: 'Last 7 days', value: stats?.week ?? 0, icon: UserPlus },
    { label: 'In the app now', value: online.length, icon: Activity },
    { label: 'Used it today', value: activeToday.length, icon: Clock3 },
    { label: 'Admins', value: stats?.admins ?? 0, icon: ShieldCheck },
  ]
  const filters: Array<{ key: Filter; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'new', label: 'New' },
    { key: 'online', label: `In the app now (${online.length})` },
    { key: 'today', label: 'Used today' },
    { key: 'fans', label: 'Fans' },
    { key: 'admins', label: 'Admins' },
    { key: 'blocked', label: `Blocked${stats?.blocked ? ` (${stats.blocked})` : ''}` },
  ]

  return <section className="fans-manager">
    <div className="fans-stats">
      {tiles.map(({ label, value, icon: Icon }) => <Card className="fans-stat" key={label}>
        <Icon size={17} aria-hidden="true" />
        <strong>{value.toLocaleString()}</strong>
        <span>{label}</span>
      </Card>)}
    </div>

    <Card className="fans-activity">
      <div className="fans-activity-head"><Activity size={17} aria-hidden="true" /><div><h2>Time in the app</h2><span>{activeToday.length} fan{activeToday.length === 1 ? '' : 's'} today · {minutesLabel(activeToday.reduce((sum, [, item]) => sum + todayMinutes(item), 0))} in total today</span></div></div>
      <div className="fans-sounds" role="group" aria-label="Sound alerts on this device">
        <label><input type="checkbox" checked={sounds.newFan} onChange={(event) => { const next = { ...sounds, newFan: event.target.checked }; setSoundState(next); setAdminSounds(next); if (event.target.checked) playAdminSound('join') }} /> 🔔 Sound when a new fan joins</label>
        <label><input type="checkbox" checked={sounds.fanOpens} onChange={(event) => { const next = { ...sounds, fanOpens: event.target.checked }; setSoundState(next); setAdminSounds(next); if (event.target.checked) playAdminSound('open') }} /> 🔈 Sound when any fan opens the app</label>
      </div>
      <div className="fans-online" id="live-now">
        <strong><i className="live-pulse-dot" /> Live in the app now: {online.length}</strong>
        {online.length ? <ul className="fans-live-list">{[...online].sort((a, b) => (a[1].since?.getTime() ?? a[1].lastSeen?.getTime() ?? 0) - (b[1].since?.getTime() ?? b[1].lastSeen?.getTime() ?? 0)).map(([id, item]) => {
          const since = item.since && item.lastSeen && item.lastSeen.getTime() - item.since.getTime() < DAY ? item.since : null
          const sinceText = since ? `In since ${since.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (${minutesLabel(Math.max(0, Math.round((now - since.getTime()) / 60000)))})` : 'In the app'
          const active = item.lastSeen ? Math.max(0, Math.round((now - item.lastSeen.getTime()) / 60000)) : 0
          return <li key={id}>
            <span className="fans-live-dot" aria-hidden="true" />
            <div><b>{nameOf(id)}</b><small>{sinceText} · active {active ? `${active} min ago` : 'just now'} · {minutesLabel(todayMinutes(item))} today</small></div>
          </li>
        })}</ul> : <small>No fans in the app right now.</small>}
      </div>
      {topToday.length > 0 ? <ol className="fans-top">{topToday.map(([id, item], index) => <li key={id}><b>{index + 1}</b><span>{nameOf(id)}</span><small>{minutesLabel(todayMinutes(item))}</small></li>)}</ol>
        : <p className="fans-note">No one has used the app yet today. Times show here as fans open the app (counted only while the app is on their screen).</p>}
    </Card>

    {(stats?.pending ?? 0) > 0 && <Card className="fans-requests">
      <div><strong>{stats?.pending} membership request{stats?.pending === 1 ? '' : 's'} waiting</strong><span>Fans who asked to join a membership tier.</span></div>
      <Button type="button" onClick={onOpenRequests}>Review</Button>
    </Card>}

    <div className="fans-toolbar">
      <label className="fans-search"><Search size={16} aria-hidden="true" /><input type="search" placeholder="Search name, email or phone" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search fans" /></label>
      <div className="fans-filters" role="group" aria-label="Filter fans">
        {filters.map(({ key, label }) => <button key={key} type="button" className={filter === key ? 'fans-filter active' : 'fans-filter'} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}
      </div>
      <div className="fans-tools">
        <Button type="button" variant="secondary" disabled={exporting} onClick={() => void exportCsv()}><Download size={15} aria-hidden="true" /> {exporting ? 'Preparing...' : 'Download list'}</Button>
        {alertsState !== 'granted' && alertsState !== 'unsupported' && <Button type="button" variant="ghost" onClick={() => void turnOnAlerts()}><BellRing size={15} aria-hidden="true" /> Alerts on this device</Button>}
      </div>
    </div>

    {visible.length ? <div className="fans-list">
      {visible.map((account) => {
        const isSelf = account.id === user?.uid
        const isNew = Boolean(account.createdAt && account.createdAt.getTime() > seenAt)
        const busy = busyId === account.id
        const name = account.fullName || 'Unnamed fan'
        return <Card className={account.disabled ? 'fan-account fan-account-blocked' : 'fan-account'} key={account.id}>
          <div className="fan-account-main">
            {account.photoDataUrl ? <img className="fan-account-avatar" src={account.photoDataUrl} alt="" /> : <span className="fan-account-avatar">{initials(account)}</span>}
            <div className="fan-account-copy">
              <strong>{name}{isSelf && <em> (you)</em>}</strong>
              <span>{account.email || 'No email'}</span>
              <small>{joinedLabel(account.createdAt)}{account.phone ? ` · ${account.phone}` : ''}</small>
              {(() => { const a = activity.get(account.id); return <small className={`fan-account-seen${a?.lastSeen && now - a.lastSeen.getTime() < ONLINE_MS ? ' online' : ''}`}>{seenLabel(a?.lastSeen ?? null, now)}{a ? ` · ${minutesLabel(todayMinutes(a))} today · ${minutesLabel(a.minutesTotal)} in total · ${a.visits} visit${a.visits === 1 ? '' : 's'}` : ''}</small> })()}
            </div>
            <div className="fan-account-tags">
              {isNew && <span className="fan-tag fan-tag-new">New</span>}
              {account.role !== 'fan' && <span className="fan-tag fan-tag-role">{account.role === 'superadmin' ? 'Super admin' : 'Admin'}</span>}
              {account.disabled && <span className="fan-tag fan-tag-blocked">Blocked</span>}
            </div>
          </div>
          {!isSelf && account.role !== 'superadmin' && <div className="fan-account-actions">
            {account.role === 'fan'
              ? <Button type="button" variant="secondary" disabled={busy} onClick={() => void changeAccount(account, { role: 'admin' }, `Make ${name} an admin? Admins can edit players, fixtures, results and news.`, `${name} is now an admin.`)}><ShieldCheck size={15} aria-hidden="true" /> Make admin</Button>
              : <Button type="button" variant="secondary" disabled={busy} onClick={() => void changeAccount(account, { role: 'fan' }, `Remove admin access from ${name}?`, `${name} is now a fan.`)}><Users size={15} aria-hidden="true" /> Make fan</Button>}
            {account.disabled
              ? <Button type="button" variant="ghost" disabled={busy} onClick={() => void changeAccount(account, { disabled: false }, `Unblock ${name}? They will be able to sign in again.`, `${name} is unblocked.`)}><UserCheck size={15} aria-hidden="true" /> Unblock</Button>
              : <Button type="button" variant="secondary" disabled={busy} onClick={() => void changeAccount(account, { disabled: true }, `Block ${name}? They will be signed out and cannot use the app until you unblock them.`, `${name} is blocked.`)}><UserX size={15} aria-hidden="true" /> Block</Button>}
            <Button type="button" variant="danger" disabled={busy} onClick={() => void deleteAccount(account)}><Trash2 size={15} aria-hidden="true" /> Delete</Button>
          </div>}
        </Card>
      })}
    </div> : <Card className="admin-card"><h2>No fans match</h2><p>{accounts.length ? 'Try a different search or filter.' : 'No fan accounts yet. New sign-ups will appear here.'}</p></Card>}

    {hasMore && <div className="member-pagination"><span>{accounts.length} of {stats?.total ?? accounts.length} loaded; search covers loaded fans.</span><Button type="button" variant="secondary" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? 'Loading...' : 'Load more fans'}</Button></div>}
    {!hasMore && stats && stats.total > accounts.length && <p className="fans-note">{stats.total - accounts.length} older account{stats.total - accounts.length === 1 ? '' : 's'} without a join date {stats.total - accounts.length === 1 ? 'is' : 'are'} only in the downloaded list.</p>}
  </section>
}
