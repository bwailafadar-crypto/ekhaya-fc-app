import { addDoc, collection, deleteField, doc, serverTimestamp, updateDoc, writeBatch, type DocumentReference } from 'firebase/firestore'
import { Eraser, Lock, LockOpen, Plus, RefreshCw, Target, Trash2, Trophy, Vote } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useToast } from '../../components/ToastContext'
import { Button, Card } from '../../components/UI'
import { db } from '../../firebase'
import { useFirestoreCollection } from '../../hooks/useFirestoreCollection'
import { useLiveDocs } from '../../hooks/useLiveDocs'
import type { Fixture, Player, Poll, PollVote, ScorePrediction } from '../../types'
import { sortByDate } from '../../utils/football'
import AlertsSetup from './AlertsSetup'
import HeroCompAdmin from './HeroCompAdmin'
import { recalculateLeaderboard } from '../../utils/leaderboardStore'

// Deletes many documents in batches (Firestore allows 500 writes per batch).
async function deleteAll(refs: DocumentReference[]) {
  for (let i = 0; i < refs.length; i += 450) {
    const batch = writeBatch(db)
    refs.slice(i, i + 450).forEach((ref) => batch.delete(ref))
    await batch.commit()
  }
}

function PredictionsAdmin({ fixture, title }: { fixture: Fixture; title: string }) {
  const { showToast } = useToast()
  const lockedUpcoming = fixture.status === 'upcoming' && fixture.predictionsLocked === true
  async function reopen() {
    try { await updateDoc(doc(db, 'fixtures', fixture.id), { predictionsLocked: false }); showToast('Predictions reopened for this match.') } catch { showToast('Predictions were not reopened.', 'error') }
  }
  const predictions = useLiveDocs<Omit<ScorePrediction, 'id'>>(['fixtures', fixture.id, 'predictions'])
  const [busy, setBusy] = useState('')
  const [showAll, setShowAll] = useState(false)
  const sorted = predictions.items.slice().sort((a, b) => (b.updatedAt?.toMillis() ?? 0) - (a.updatedAt?.toMillis() ?? 0))
  const visible = showAll ? sorted : sorted.slice(0, 10)

  async function removeOne(id: string, name: string) {
    if (!window.confirm(`Delete ${name}'s prediction?`)) return
    setBusy(id)
    try { await deleteAll([doc(db, 'fixtures', fixture.id, 'predictions', id)]); showToast('Prediction deleted.') } catch { showToast('The prediction was not deleted.', 'error') } finally { setBusy('') }
  }

  async function clearAll() {
    if (!window.confirm(`Delete all ${sorted.length} predictions for ${fixture.home} v ${fixture.away}?`)) return
    setBusy('all')
    try { await deleteAll(sorted.map((item) => doc(db, 'fixtures', fixture.id, 'predictions', item.id))); showToast('All predictions deleted.') } catch { showToast('Predictions were not deleted.', 'error') } finally { setBusy('') }
  }

  return <Card className="admin-card">
    <div className="fz-card-heading"><Target size={18} /><div><h2>{title}</h2><span>{fixture.home} v {fixture.away} · {sorted.length} prediction{sorted.length === 1 ? '' : 's'}</span></div></div>
    {lockedUpcoming && <p className="fz-note"><Lock size={14} /> Predictions are locked (this match was started before). <button type="button" className="squad-admin-edit" onClick={() => void reopen()}><LockOpen size={12} /> Reopen</button></p>}
    {sorted.length ? <ul className="fz-admin-results">{visible.map((item) => <li key={item.id}>
      <span>{item.name || 'Fan'} <strong>{item.home}–{item.away}</strong></span>
      <button type="button" className="fz-admin-delete" disabled={Boolean(busy)} onClick={() => void removeOne(item.id, item.name || 'this fan')} aria-label={`Delete ${item.name || 'fan'}'s prediction`}><Trash2 size={14} /></button>
    </li>)}</ul> : <p className="fz-note">No predictions yet.</p>}
    <div className="admin-actions">
      {sorted.length > 10 && <Button type="button" variant="ghost" onClick={() => setShowAll((value) => !value)}>{showAll ? 'Show fewer' : `Show all ${sorted.length}`}</Button>}
      {sorted.length > 0 && <Button type="button" variant="danger" disabled={Boolean(busy)} onClick={() => void clearAll()}><Eraser size={15} /> Delete all</Button>}
    </div>
  </Card>
}

function PollRow({ poll }: { poll: Poll }) {
  const { showToast } = useToast()
  const votes = useLiveDocs<Omit<PollVote, 'id'>>(['polls', poll.id, 'votes'])
  const [busy, setBusy] = useState(false)
  const counts = poll.options.map((_, index) => votes.items.filter((item) => item.option === index).length)

  async function toggle() {
    setBusy(true)
    try {
      // Closing saves the final counts on the poll, so fans read them for free.
      await updateDoc(doc(db, 'polls', poll.id), poll.status === 'open'
        ? { status: 'closed', results: counts }
        : { status: 'open', results: deleteField() })
      showToast(poll.status === 'open' ? 'Poll closed. Fans now see the final results.' : 'Poll reopened.')
      // Poll votes earn fan points: update the boards in the background.
      if (poll.status === 'open') void recalculateLeaderboard().catch(() => undefined)
    } catch { showToast('The poll was not updated.', 'error') } finally { setBusy(false) }
  }

  const voteRefs = () => votes.items.map((item) => doc(db, 'polls', poll.id, 'votes', item.id))

  async function resetVotes() {
    if (!window.confirm(`Delete all ${votes.items.length} votes in "${poll.question}" and start again?`)) return
    setBusy(true)
    try { await deleteAll(voteRefs()); await updateDoc(doc(db, 'polls', poll.id), { results: deleteField() }); showToast('Poll votes cleared.') } catch { showToast('The votes were not cleared.', 'error') } finally { setBusy(false) }
  }

  async function remove() {
    if (!window.confirm(`Delete the poll "${poll.question}" and all its votes?`)) return
    setBusy(true)
    try { await deleteAll([...voteRefs(), doc(db, 'polls', poll.id)]); showToast('Poll deleted.') } catch { showToast('The poll was not deleted.', 'error'); setBusy(false) }
  }

  return <Card className="fz-admin-row">
    <div className="fz-admin-row-heading"><strong>{poll.question}</strong><span className={poll.status === 'open' ? 'fan-tag fan-tag-new' : 'fan-tag fan-tag-role'}>{poll.status === 'open' ? 'Open' : 'Closed'}</span></div>
    <ul className="fz-admin-results">{poll.options.map((option, index) => <li key={option + index}><span>{option}</span><strong>{counts[index]}</strong></li>)}</ul>
    <div className="admin-actions">
      <Button type="button" variant="secondary" disabled={busy || votes.loading} onClick={() => void toggle()}>{poll.status === 'open' ? <><Lock size={15} /> Close poll</> : <><LockOpen size={15} /> Reopen</>}</Button>
      {votes.items.length > 0 && <Button type="button" variant="ghost" disabled={busy} onClick={() => void resetVotes()}><Eraser size={15} /> Clear votes</Button>}
      <Button type="button" variant="danger" disabled={busy} onClick={() => void remove()}><Trash2 size={15} /> Delete poll</Button>
    </div>
  </Card>
}

function LeaderboardTools() {
  const { showToast } = useToast()
  const [busy, setBusy] = useState(false)
  async function run() {
    setBusy(true)
    try { const fans = await recalculateLeaderboard(); showToast(`Leaderboard updated: ${fans} fans ranked.`) } catch { showToast('The leaderboard could not be updated. Check your connection.', 'error') } finally { setBusy(false) }
  }
  return <Card className="admin-card">
    <div className="fz-card-heading"><Trophy size={18} /><div><h2>Prediction league</h2><span>Updates by itself after each match. Use this after correcting old results.</span></div></div>
    <Button type="button" variant="secondary" disabled={busy} onClick={() => void run()}><RefreshCw size={15} /> {busy ? 'Updating…' : 'Recalculate leaderboard'}</Button>
  </Card>
}

export default function FanZoneManager() {
  const { showToast } = useToast()
  const polls = useFirestoreCollection<Poll>('polls')
  const fixtures = useFirestoreCollection<Fixture>('fixtures')
  const players = useFirestoreCollection<Player>('players')
  const [saving, setSaving] = useState(false)
  const lastMatch = sortByDate(fixtures.items.filter((fixture) => fixture.status === 'finished' && !fixture.isTest), 'desc')[0]
  const nextMatch = sortByDate(fixtures.items.filter((fixture) => fixture.status === 'upcoming' && !fixture.isTest), 'asc')[0]
  const sortedPolls = polls.items.slice().sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0))

  // Ready-made polls from the fixtures and the squad: tap one, edit if needed, publish.
  const [draftQuestion, setDraftQuestion] = useState('')
  const [draftOptions, setDraftOptions] = useState('')
  const isClub = (name: string) => /ekhaya/i.test(name)
  const opponent = (fixture?: Fixture) => (fixture ? (isClub(fixture.home) ? fixture.away : fixture.home) : '')
  const senior = players.items.filter((player) => player.team === 'senior')
  const byGoals = senior.slice().sort((a, b) => (b.stats?.goals ?? 0) - (a.stats?.goals ?? 0) || (b.stats?.assists ?? 0) - (a.stats?.assists ?? 0) || (b.stats?.appearances ?? 0) - (a.stats?.appearances ?? 0))
  const attackers = byGoals.filter((player) => player.position === 'FWD' || player.position === 'MID' || !player.position)
  const playedLast = lastMatch ? [...(lastMatch.officialMinutes ? Object.keys(lastMatch.officialMinutes) : lastMatch.startingPlayerIds ?? [])] : []
  const templates = [
    nextMatch && { label: `Result v ${opponent(nextMatch)}`, question: `How will Ekhaya FC do against ${opponent(nextMatch)}?`, options: ['Ekhaya FC win', 'Draw', `${opponent(nextMatch)} win`] },
    nextMatch && attackers.length >= 2 && { label: `First scorer v ${opponent(nextMatch)}`, question: `Who will score first for Ekhaya against ${opponent(nextMatch)}?`, options: [...attackers.slice(0, 5).map((player) => player.name), 'Someone else'] },
    lastMatch && playedLast.length >= 2 && { label: `Best player v ${opponent(lastMatch)}`, question: `Who was Ekhaya's best player against ${opponent(lastMatch)}?`, options: senior.filter((player) => playedLast.includes(player.id)).sort((a, b) => (b.stats?.goals ?? 0) - (a.stats?.goals ?? 0)).slice(0, 6).map((player) => player.name) },
    byGoals.length >= 3 && { label: 'Player of the month', question: `Who is Ekhaya's player of the month (${new Date().toLocaleDateString('en-GB', { month: 'long' })})?`, options: byGoals.slice(0, 5).map((player) => player.name) },
    lastMatch && { label: `Rate the team v ${opponent(lastMatch)}`, question: `How did Ekhaya play against ${opponent(lastMatch)} (${lastMatch.home} ${lastMatch.homeScore ?? 0}–${lastMatch.awayScore ?? 0} ${lastMatch.away})?`, options: ['Excellent', 'Good', 'Average', 'Poor'] },
  ].filter(Boolean) as Array<{ label: string; question: string; options: string[] }>

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
      setDraftQuestion('')
      setDraftOptions('')
      showToast('Poll published to the Fan Zone.')
    } catch { showToast('The poll was not published.', 'error') } finally { setSaving(false) }
  }

  return <section className="fz-admin">
    <AlertsSetup />
    <HeroCompAdmin />
    <LeaderboardTools />
    <Card className="admin-card">
      <div className="fz-card-heading"><Vote size={18} /><div><h2>New poll</h2><span>Appears in the Fan Zone straight away</span></div></div>
      {templates.length > 0 && <div className="poll-templates" role="group" aria-label="Ready-made polls"><span>Quick polls:</span>{templates.map((template) => <button type="button" key={template.label} onClick={() => { setDraftQuestion(template.question); setDraftOptions(template.options.slice(0, 6).join('\n')) }}>{template.label}</button>)}</div>}
      <form className="admin-form" onSubmit={createPoll}>
        <label className="admin-field"><span>Question</span><input name="question" maxLength={200} placeholder="Who should start up front on Saturday?" required value={draftQuestion} onChange={(event) => setDraftQuestion(event.target.value)} /></label>
        <label className="admin-field"><span>Answers (one per line, 2–6)</span><textarea className="membership-benefits-input" name="options" rows={5} placeholder={'Player A\nPlayer B\nPlayer C'} required value={draftOptions} onChange={(event) => setDraftOptions(event.target.value)} /></label>
        <Button type="submit" disabled={saving}><Plus size={15} /> {saving ? 'Publishing...' : 'Publish poll'}</Button>
      </form>
    </Card>
    {nextMatch && <PredictionsAdmin fixture={nextMatch} title="Predictions: next match" />}
    {lastMatch && <PredictionsAdmin fixture={lastMatch} title="Predictions: last match" />}
    {sortedPolls.length > 0 && <h2 className="fz-section-title">Polls</h2>}
    {sortedPolls.map((poll) => <PollRow key={poll.id} poll={poll} />)}
  </section>
}
