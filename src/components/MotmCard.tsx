import { collection, doc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore'
import { CheckCircle2, Lock, Star } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'
import { db } from '../firebase'
import { useCounts, useMyDoc } from '../hooks/useCounts'
import type { Fixture, MotmVote, Player } from '../types'
import { percent, saveErrorText } from '../utils/fanZone'
import PlayerAvatar from './PlayerAvatar'
import { useToast } from './ToastContext'
import { Card, Skeleton } from './UI'

export function ResultBar({ label, value, total, mine, leading }: { label: ReactNode; value: number; total: number; mine?: boolean; leading?: boolean }) {
  const share = percent(value, total)
  return (
    <div className={`fz-bar${mine ? ' fz-bar-mine' : ''}${leading ? ' fz-bar-leading' : ''}`}>
      <span className="fz-bar-fill" style={{ width: `${share}%` }} aria-hidden="true" />
      <span className="fz-bar-label">{label}{mine && <CheckCircle2 size={14} aria-label="Your vote" />}</span>
      <span className="fz-bar-value">{share}%</span>
    </div>
  )
}

/** Fans' man of the match vote for one finished match (Fan Zone and match centre). */
export default function MotmCard({ fixture, players }: { fixture: Fixture; players: Player[] }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const mine = useMyDoc<Omit<MotmVote, 'id'>>(user ? ['fixtures', fixture.id, 'motm', user.uid] : null)
  const [saving, setSaving] = useState('')
  const [version, setVersion] = useState(0)
  // Only players who actually played: the official minutes when loaded,
  // otherwise the starting XI plus the subs who came on (from the commentary).
  const [subsOn, setSubsOn] = useState<{ fixtureId: string; ids: string[] } | null>(null)
  const official = fixture.officialMinutes ? Object.keys(fixture.officialMinutes).filter((id) => (fixture.officialMinutes?.[id] ?? 0) > 0) : []
  const starters = fixture.startingPlayerIds ?? []
  useEffect(() => {
    if (official.length || !starters.length) return
    let active = true
    getDocs(query(collection(db, 'fixtures', fixture.id, 'events'), where('kind', '==', 'substitution')))
      .then((snapshot) => { if (active) setSubsOn({ fixtureId: fixture.id, ids: snapshot.docs.map((item) => String(item.data().subbedInPlayerId ?? '')).filter(Boolean) }) })
      .catch(() => { if (active) setSubsOn({ fixtureId: fixture.id, ids: [] }) })
    return () => { active = false }
  }, [fixture.id, official.length, starters.length])
  const played = official.length ? official
    : starters.length ? [...starters, ...(subsOn?.fixtureId === fixture.id ? subsOn.ids : [])]
      : []
  const candidates = (played.length ? players.filter((player) => played.includes(player.id)) : players.filter((player) => player.team === 'senior'))
    .slice().sort((a, b) => (a.number ?? 99) - (b.number ?? 99))
  const closed = fixture.motmClosed === true
  const showResults = Boolean(mine.data) || closed
  const savedTally = fixture.motmTally
  // When voting is closed the final tally is saved on the match (no extra reads);
  // while open, results are counted once after the fan votes.
  const live = useCounts(showResults && !savedTally && candidates.length ? `${fixture.id}:${version}` : null, () => Object.fromEntries(candidates.map((player) => [player.id, query(collection(db, 'fixtures', fixture.id, 'motm'), where('playerId', '==', player.id))])))
  const tally: Record<string, number> = savedTally ?? live.counts
  const totalVotes = Object.values(tally).reduce((sum, count) => sum + count, 0)
  const ranked = candidates.slice().sort((a, b) => (tally[b.id] ?? 0) - (tally[a.id] ?? 0))
  const winner = closed && fixture.motmWinnerId ? players.find((player) => player.id === fixture.motmWinnerId) : (ranked[0] && (tally[ranked[0].id] ?? 0) > 0 ? ranked[0] : null)

  async function vote(player: Player) {
    if (!user || closed) return
    setSaving(player.id)
    try {
      await setDoc(doc(db, 'fixtures', fixture.id, 'motm', user.uid), { playerId: player.id, updatedAt: serverTimestamp() })
      setVersion((value) => value + 1)
      showToast(`You voted for ${player.name}.`)
    } catch (error) {
      showToast(saveErrorText(error, 'Your vote was not saved. Check your connection and try again.'), 'error')
    } finally {
      setSaving('')
    }
  }

  return (
    <Card className="fz-card">
      <div className="fz-card-heading"><Star size={18} aria-hidden="true" /><div><h2>Man of the match</h2><span>{fixture.home} {fixture.homeScore ?? 0}–{fixture.awayScore ?? 0} {fixture.away}</span></div></div>
      {closed && winner && <p className="fz-result fz-result-win">🏆 {winner.name} is the fans' man of the match</p>}
      {!candidates.length ? <p className="fz-note">Players will appear here once the squad is added.</p>
        : showResults ? (live.loading ? <Skeleton className="fz-board-skeleton" /> : <div className="fz-bars">
            {ranked.slice(0, 8).map((player, index) => <ResultBar key={player.id} label={<><PlayerAvatar player={player} />{player.number ? `${player.number}. ` : ''}{player.name}</>} value={tally[player.id] ?? 0} total={totalVotes} mine={mine.data?.playerId === player.id} leading={index === 0 && (tally[player.id] ?? 0) > 0} />)}
          </div>)
        : <div className="fz-players">
            {candidates.map((player) => <button key={player.id} type="button" className="fz-player" disabled={Boolean(saving)} onClick={() => void vote(player)}>
              <PlayerAvatar player={player} /><span>{player.number ? <em>{player.number}</em> : null}{player.name}</span>{saving === player.id && <small>Voting...</small>}
            </button>)}
          </div>}
      <p className="fz-note">{closed ? <><Lock size={14} aria-hidden="true" /> Voting closed · </> : null}{totalVotes} vote{totalVotes === 1 ? '' : 's'}{mine.data && !closed ? ' · tap below to change your vote' : ''}</p>
      {mine.data && !closed && <details className="fz-change"><summary>Change my vote</summary><div className="fz-players">{candidates.map((player) => <button key={player.id} type="button" className={mine.data?.playerId === player.id ? 'fz-player active' : 'fz-player'} disabled={Boolean(saving)} onClick={() => void vote(player)}><PlayerAvatar player={player} /><span>{player.name}</span></button>)}</div></details>}
    </Card>
  )
}
