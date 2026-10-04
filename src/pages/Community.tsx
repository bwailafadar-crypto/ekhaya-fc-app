import { collection, query, where } from 'firebase/firestore'
import { Copy, MapPin, RefreshCw, Share2, UserPlus, Users } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useToast } from '../components/ToastContext'
import { Button, Card, PageHeader, Skeleton } from '../components/UI'
import { db } from '../firebase'
import { useCounts, useMyDoc } from '../hooks/useCounts'
import { BRANCHES, branchName, inviteLink, inviteMessage, refreshCommunityStats, saveBranch, type CommunityStats, type FanCard } from '../utils/community'

const medals = ['🥇', '🥈', '🥉']

function BranchCard() {
  const { user, profile } = useAuth()
  const { showToast } = useToast()
  const uid = user?.uid ?? ''
  const card = useMyDoc<FanCard>(uid ? ['fanCards', uid] : null)
  const [choice, setChoice] = useState('')
  const [saving, setSaving] = useState(false)
  const current = card.data?.branch ?? ''
  const selected = choice || current
  // One count read for "fans in my branch".
  const mine = useCounts(current ? `branch:${current}` : null, () => ({ fans: query(collection(db, 'fanCards'), where('branch', '==', current)) }))

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!uid || !profile || !selected) return
    setSaving(true)
    try {
      await saveBranch(uid, profile.fullName, selected)
      showToast(`Welcome to the ${branchName(selected)} branch!`, 'success')
      setChoice('')
    } catch {
      showToast('Your branch was not saved. Check your connection and try again.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="fz-card">
      <div className="fz-card-heading"><MapPin size={18} aria-hidden="true" /><div><h2>Your branch</h2><span>Where do you support Ekhaya from?</span></div></div>
      {card.loading ? <Skeleton className="fz-board-skeleton" /> : <>
        {current && <p className="fz-result fz-result-win">You're in the <strong>{branchName(current)}</strong> branch{typeof mine.counts.fans === 'number' ? ` with ${mine.counts.fans} fan${mine.counts.fans === 1 ? '' : 's'}` : ''}</p>}
        <form className="community-branch-form" onSubmit={(event) => void save(event)}>
          <label className="admin-field"><span>{current ? 'Change branch' : 'Choose your district'}</span>
            <select value={selected} onChange={(event) => setChoice(event.target.value)} required>
              <option value="" disabled>Select a district…</option>
              {BRANCHES.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </label>
          <Button type="submit" disabled={saving || !selected || selected === current}>{saving ? 'Saving…' : current ? 'Move branch' : 'Join branch'}</Button>
        </form>
      </>}
    </Card>
  )
}

function InviteCard() {
  const { user, emailVerified } = useAuth()
  const { showToast } = useToast()
  const uid = user?.uid ?? ''
  const invited = useCounts(uid ? `invites:${uid}` : null, () => ({ count: query(collection(db, 'referrals'), where('by', '==', uid)) }))
  const link = uid ? inviteLink(uid) : ''
  const count = invited.counts.count

  async function share() {
    const text = inviteMessage(uid)
    if (navigator.share) {
      try { await navigator.share({ title: 'Ekhaya FC', text }); return } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
  }

  async function copy() {
    try { await navigator.clipboard.writeText(link); showToast('Invite link copied.', 'success') } catch { showToast(link, 'info') }
  }

  return (
    <Card className="fz-card">
      <div className="fz-card-heading"><UserPlus size={18} aria-hidden="true" /><div><h2>Invite friends</h2><span>Grow the Ekhaya family</span></div></div>
      {typeof count === 'number' && <p className="fz-result fz-result-win">You've brought {count} fan{count === 1 ? '' : 's'} into the family{count >= 5 ? ' 🔥' : ''}</p>}
      <div className="community-invite-link"><span>{link}</span><button type="button" aria-label="Copy invite link" onClick={() => void copy()}><Copy size={16} /></button></div>
      <Button type="button" onClick={() => void share()}><Share2 size={15} /> Share on WhatsApp</Button>
      <p className="fz-note">A friend counts once they create an account with your link and confirm their email.{!emailVerified ? ' Confirm your own email too, so your invites appear on the board.' : ''}</p>
    </Card>
  )
}

function BranchTable({ stats, myBranch }: { stats: CommunityStats | null; myBranch: string }) {
  const [all, setAll] = useState(false)
  const rows = stats?.branches ?? []
  return (
    <Card className="fz-card">
      <div className="fz-card-heading"><Users size={18} aria-hidden="true" /><div><h2>Branch table</h2><span>{stats ? `${stats.totalFans} fan${stats.totalFans === 1 ? '' : 's'} in ${rows.length} branch${rows.length === 1 ? '' : 'es'}` : 'Biggest supporter branches'}</span></div></div>
      {!rows.length ? <p className="fz-note">No branches yet. Be the first to join yours!</p> : <>
        <ol className="fz-board">
          {rows.slice(0, all ? rows.length : 10).map((row, index) => <li key={row.id} className={row.id === myBranch ? 'mine' : undefined}>
            <span className="fz-board-rank">{index < 3 ? medals[index] : index + 1}</span>
            <span className="fz-board-name">{branchName(row.id)}{row.id === myBranch && <em> (your branch)</em>}</span>
            <strong className="fz-board-points">{row.fans}</strong>
          </li>)}
        </ol>
        {rows.length > 10 && <button type="button" className="fz-board-more" onClick={() => setAll((value) => !value)}>{all ? 'Show top 10' : `Show all ${rows.length}`}</button>}
      </>}
    </Card>
  )
}

function Recruiters({ stats }: { stats: CommunityStats | null }) {
  const { user } = useAuth()
  const rows = stats?.recruiters ?? []
  return (
    <Card className="fz-card">
      <div className="fz-card-heading"><UserPlus size={18} aria-hidden="true" /><div><h2>Top recruiters</h2><span>{stats ? `${stats.totalInvites} fan${stats.totalInvites === 1 ? '' : 's'} joined through invites` : 'Fans who brought the most friends'}</span></div></div>
      {!rows.length ? <p className="fz-note">No invites yet. Share your link and top this table!</p>
        : <ol className="fz-board">{rows.map((row, index) => <li key={row.uid} className={row.uid === user?.uid ? 'mine' : undefined}>
            <span className="fz-board-rank">{index < 3 ? medals[index] : index + 1}</span>
            <span className="fz-board-name">{row.name}{row.uid === user?.uid && <em> (you)</em>}</span>
            <strong className="fz-board-points">{row.count}</strong>
          </li>)}</ol>}
    </Card>
  )
}

export default function Community() {
  const { user, role } = useAuth()
  const { showToast } = useToast()
  const stats = useMyDoc<CommunityStats>(['communityStats', 'current'])
  const card = useMyDoc<FanCard>(user ? ['fanCards', user.uid] : null)
  const [refreshing, setRefreshing] = useState(false)
  const isAdmin = role === 'admin' || role === 'superadmin'
  const updated = stats.data?.updatedAt?.toMillis?.()

  async function refresh() {
    setRefreshing(true)
    try { await refreshCommunityStats(); showToast('Branch and invite numbers updated.', 'success') } catch { showToast('Could not update the numbers. Check your connection.', 'error') } finally { setRefreshing(false) }
  }

  return <div className="fan-zone">
    <PageHeader eyebrow="Supporters" title="Fan Family" description="Join your district branch and bring your friends into the Ekhaya family." />
    <BranchCard />
    <InviteCard />
    {stats.loading ? <Skeleton className="fz-board-skeleton" /> : <>
      <BranchTable stats={stats.data} myBranch={card.data?.branch ?? ''} />
      <Recruiters stats={stats.data} />
    </>}
    <p className="fz-note community-updated">Tables update every 30 minutes{updated ? ` · last ${new Date(updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}</p>
    {isAdmin && <Button type="button" variant="secondary" disabled={refreshing} onClick={() => void refresh()}><RefreshCw size={15} /> {refreshing ? 'Updating…' : 'Update tables now'}</Button>}
  </div>
}
