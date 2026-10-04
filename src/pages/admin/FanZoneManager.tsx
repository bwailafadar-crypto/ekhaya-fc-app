import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { Lock, LockOpen, Plus, Star, Trash2, Vote } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useToast } from '../../components/ToastContext'
import { Button, Card } from '../../components/UI'
import { db } from '../../firebase'
import { useFirestoreCollection } from '../../hooks/useFirestoreCollection'
import { useLiveDocs } from '../../hooks/useLiveDocs'
import type { Fixture, MotmVote, Player, Poll, PollVote } from '../../types'
import { sortByDate } from '../../utils/football'

function PollRow({ poll }: { poll: Poll }) {
  const { showToast } = useToast()
  const votes = useLiveDocs<Omit<PollVote, 'id'>>(['polls', poll.id, 'votes'])
  const [busy, setBusy] = useState(false)
  const counts = poll.options.map((_, index) => votes.items.filter((item) => item.option === index).length)

  async function toggle() {
    setBusy(true)
    try {
      await updateDoc(doc(db, 'polls', poll.id), { status: poll.status === 'open' ? 'closed' : 'open' })
      showToast(poll.status === 'open' ? 'Poll closed. Fans now see the final results.' : 'Poll reopened.')
    } catch { showToast('The poll was not updated.', 'error') } finally { setBusy(false) }
  }

  async function remove() {
    if (!window.confirm(`Delete the poll "${poll.question}"? Its results will disappear.`)) return
    setBusy(true)
    try { await deleteDoc(doc(db, 'polls', poll.id)); showToast('Poll deleted.') } catch { showToast('The poll was not deleted.', 'error'); setBusy(false) }
  }

  return <Card className="fz-admin-row">
    <div className="fz-admin-row-heading"><strong>{poll.question}</strong><span className={poll.status === 'open' ? 'fan-tag fan-tag-new' : 'fan-tag fan-tag-role'}>{poll.status === 'open' ? 'Open' : 'Closed'}</span></div>
    <ul className="fz-admin-results">{poll.options.map((option, index) => <li key={option + index}><span>{option}</span><strong>{counts[index]}</strong></li>)}</ul>
    <div className="admin-actions">
      <Button type="button" variant="secondary" disabled={busy} onClick={() => void toggle()}>{poll.status === 'open' ? <><Lock size={15} /> Close poll</> : <><LockOpen size={15} /> Reopen</>}</Button>
      <Button type="button" variant="ghost" disabled={busy} onClick={() => void remove()}><Trash2 size={15} /> Delete</Button>
    </div>
  </Card>
}

function MotmControl({ fixture, players }: { fixture: Fixture; players: Player[] }) {
  const { showToast } = useToast()
  const votes = useLiveDocs<Omit<MotmVote, 'id'>>(['fixtures', fixture.id, 'motm'])
  const [busy, setBusy] = useState(false)
  const counts = new Map<string, number>()
  votes.items.forEach((item) => counts.set(item.playerId, (counts.get(item.playerId) ?? 0) + 1))
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
  const closed = fixture.motmClosed === true

  async function toggle() {
    setBusy(true)
    try {
      await updateDoc(doc(db, 'fixtures', fixture.id), { motmClosed: !closed })
      showToast(closed ? 'Man of the match voting reopened.' : 'Voting closed. Fans now see the winner.')
    } catch { showToast('Voting was not updated.', 'error') } finally { setBusy(false) }
  }

  return <Card className="admin-card">
    <div className="fz-card-heading"><Star size={18} /><div><h2>Man of the match</h2><span>{fixture.home} {fixture.homeScore ?? 0}–{fixture.awayScore ?? 0} {fixture.away} · {votes.items.length} votes</span></div></div>
    {top.length ? <ul className="fz-admin-results">{top.map(([playerId, count]) => <li key={playerId}><span>{players.find((player) => player.id === playerId)?.name ?? 'Unknown player'}</span><strong>{count}</strong></li>)}</ul> : <p className="fz-note">No votes yet.</p>}
    <Button type="button" variant={closed ? 'secondary' : 'primary'} disabled={busy} onClick={() => void toggle()}>{closed ? <><LockOpen size={15} /> Reopen voting</> : <><Lock size={15} /> Close voting and announce winner</>}</Button>
  </Card>
}

export default function FanZoneManager() {
  const { showToast } = useToast()
  const polls = useFirestoreCollection<Poll>('polls')
  const fixtures = useFirestoreCollection<Fixture>('fixtures')
  const players = useFirestoreCollection<Player>('players')
  const [saving, setSaving] = useState(false)
  const lastMatch = sortByDate(fixtures.items.filter((fixture) => fixture.status === 'finished' && !fixture.isTest), 'desc')[0]
  const sortedPolls = polls.items.slice().sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0))

  async function createPoll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const question = String(data.get('question') ?? '').trim()
    const options = String(data.get('options') ?? '').split('\n').map((line) => line.trim()).filter(Boolean)
    if (!question) { showToast('Write the poll question.', 'error'); return }
    if (options.length < 2 || options.length > 6) { showToast('Give between 2 and 6 answers, one per line.', 'error'); return }
    setSaving(true)
    try {
      await addDoc(collection(db, 'polls'), { question: question.slice(0, 200), options: options.map((option) => option.slice(0, 80)), status: 'open', createdAt: serverTimestamp() })
      form.reset()
      showToast('Poll published to the Fan Zone.')
    } catch { showToast('The poll was not published.', 'error') } finally { setSaving(false) }
  }

  return <section className="fz-admin">
    <Card className="admin-card">
      <div className="fz-card-heading"><Vote size={18} /><div><h2>New poll</h2><span>Appears in the Fan Zone straight away</span></div></div>
      <form className="admin-form" onSubmit={createPoll}>
        <label className="admin-field"><span>Question</span><input name="question" maxLength={200} placeholder="Who should start up front on Saturday?" required /></label>
        <label className="admin-field"><span>Answers (one per line, 2–6)</span><textarea className="membership-benefits-input" name="options" rows={4} placeholder={'Player A\nPlayer B\nPlayer C'} required /></label>
        <Button type="submit" disabled={saving}><Plus size={15} /> {saving ? 'Publishing...' : 'Publish poll'}</Button>
      </form>
    </Card>
    {lastMatch && <MotmControl fixture={lastMatch} players={players.items} />}
    {sortedPolls.length > 0 && <h2 className="fz-section-title">Polls</h2>}
    {sortedPolls.map((poll) => <PollRow key={poll.id} poll={poll} />)}
  </section>
}
