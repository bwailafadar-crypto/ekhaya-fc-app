import { collection, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore'
import { CalendarDays, Check, Gift, Goal, Lock, Minus, Plus, Star, Target, Ticket, Trophy, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import MatchPredictionsAdmin from '../components/MatchPredictionsAdmin'
import PlayerAvatar from '../components/PlayerAvatar'
import TeamLogo from '../components/TeamLogo'
import { useToast } from '../components/ToastContext'
import { Button, Card, EmptyState, PageHeader, Skeleton } from '../components/UI'
import { db } from '../firebase'
import { useMyDoc } from '../hooks/useCounts'
import { useFirestoreCollection } from '../hooks/useFirestoreCollection'
import type { Fixture, Pick, Player, PredictorScore } from '../types'
import { competitionOf } from '../utils/competitions'
import { formatMalawiDate, formatMalawiTime, isEkhayaTeam, isPlayed, sortByDate } from '../utils/football'
import { burst } from '../utils/celebrate'
import { saveErrorText } from '../utils/fanZone'

const MAX_GOALS = 20
type Kind = 'score' | 'scorer' | 'motm'

const PREDICTOR_POINTS: Record<Kind, number> = { score: 5, scorer: 3, motm: 3 }

const KINDS: Array<{ id: Kind; label: string; icon: typeof Goal; hint: string }> = [
  { id: 'score', label: 'Correct score', icon: Target, hint: 'Call the exact full-time score. Hardest to get, worth the most.' },
  { id: 'scorer', label: 'Goalscorer', icon: Goal, hint: 'Pick an Ekhaya player to score.' },
  { id: 'motm', label: 'Man of the Match', icon: Star, hint: 'Pick who will be named Man of the Match.' },
]

function kickoffMs(fixture: Fixture) {
  const ts = fixture.kickoffAt?.toMillis?.()
  if (typeof ts === 'number' && !Number.isNaN(ts)) return ts
  const parsed = Date.parse(fixture.date)
  return Number.isNaN(parsed) ? 0 : parsed
}

function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])
  return now
}

function Stepper({ label, value, onChange, disabled }: { label: string; value: number; onChange: (v: number) => void; disabled: boolean }) {
  return (
    <div className="pr-stepper" role="group" aria-label={`${label} goals`}>
      <button type="button" onClick={() => onChange(Math.max(0, value - 1))} disabled={disabled || value <= 0} aria-label={`One less goal for ${label}`}><Minus size={16} /></button>
      <strong aria-live="polite">{value}</strong>
      <button type="button" onClick={() => onChange(Math.min(MAX_GOALS, value + 1))} disabled={disabled || value >= MAX_GOALS} aria-label={`One more goal for ${label}`}><Plus size={16} /></button>
    </div>
  )
}

/** The prediction card for one upcoming league match. */
function PredictMatch({ fixture, squadPlayers }: { fixture: Fixture; squadPlayers: Player[] }) {
  const { user, profile } = useAuth()
  const { showToast } = useToast()
  const now = useNow()
  const mine = useMyDoc<Pick>(user ? ['fixtures', fixture.id, 'picks', user.uid] : null)
  const saved = mine.data

  // Draft overrides (null = fall back to the saved pick, so the form shows it).
  const [kind, setKind] = useState<Kind | null>(null)
  const [homeD, setHomeD] = useState<number | null>(null)
  const [awayD, setAwayD] = useState<number | null>(null)
  const [playerD, setPlayerD] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const activeKind = kind ?? saved?.type ?? 'score'
  const home = homeD ?? saved?.home ?? 1
  const away = awayD ?? saved?.away ?? 0
  const playerId = playerD ?? saved?.playerId ?? ''
  const locked = fixture.status !== 'upcoming' || fixture.predictionsLocked === true || kickoffMs(fixture) <= now
  const opponent = isEkhayaTeam(fixture.home) ? fixture.away : fixture.home
  const playerName = (id: string) => squadPlayers.find((p) => p.id === id)?.name ?? ''

  async function save(button?: HTMLElement | null) {
    if (!user || locked) return
    setSaving(true)
    try {
      const name = (profile?.fullName ?? '').slice(0, 120)
      const base = { type: activeKind, name, updatedAt: serverTimestamp() }
      const payload = activeKind === 'score' ? { ...base, home, away } : { ...base, playerId }
      if (activeKind !== 'score' && !playerId) { showToast('Pick a player first.', 'error'); setSaving(false); return }
      await setDoc(doc(db, 'fixtures', fixture.id, 'picks', user.uid), payload)
      showToast('Prediction saved. Good luck!')
      burst(button ?? null)
    } catch (error) {
      showToast(locked ? 'Predictions are closed for this match.' : saveErrorText(error, 'Your prediction was not saved. Check your connection and try again.'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const savedSummary = saved && (saved.type === 'score'
    ? `${fixture.home} ${saved.home}–${saved.away} ${fixture.away}`
    : `${KINDS.find((k) => k.id === saved.type)?.label}: ${playerName(saved.playerId ?? '') || 'your pick'}`)

  return (
    <Card className="pr-match">
      <div className="pr-match-head">
        <span className="pr-match-comp">{competitionOf(fixture.competition).short}</span>
        <span className="pr-match-when"><CalendarDays size={13} aria-hidden="true" /> {formatMalawiDate(fixture.date)} · {formatMalawiTime(fixture.date)}</span>
      </div>
      <div className="pr-teams">
        <div className="pr-team"><TeamLogo name={fixture.home} /><span>{fixture.home}</span></div>
        <span className="pr-v">v</span>
        <div className="pr-team"><TeamLogo name={fixture.away} /><span>{fixture.away}</span></div>
      </div>

      {locked ? (
        <p className="pr-locked"><Lock size={14} aria-hidden="true" /> Predictions closed.{saved ? ` You picked — ${savedSummary}.` : ' You did not predict this one.'}</p>
      ) : (
        <>
          <div className="pr-kinds" role="tablist" aria-label="What to predict">
            {KINDS.map((k) => {
              const Icon = k.icon
              const on = activeKind === k.id
              return <button key={k.id} type="button" role="tab" aria-selected={on} className={`pr-kind${on ? ' on' : ''}`} onClick={() => setKind(k.id)}><Icon size={16} aria-hidden="true" /><span>{k.label}</span><em className="pr-kind-pts">{PREDICTOR_POINTS[k.id]} pts</em></button>
            })}
          </div>
          <p className="pr-kind-hint">{KINDS.find((k) => k.id === activeKind)?.hint} <strong>Worth {PREDICTOR_POINTS[activeKind]} points if you get it right.</strong></p>

          {activeKind === 'score' ? (
            <div className="pr-score">
              <div className="pr-score-team"><TeamLogo name={fixture.home} /><Stepper label={fixture.home} value={home} disabled={saving} onChange={setHomeD} /></div>
              <span className="pr-score-dash">–</span>
              <div className="pr-score-team"><TeamLogo name={fixture.away} /><Stepper label={fixture.away} value={away} disabled={saving} onChange={setAwayD} /></div>
            </div>
          ) : (
            <div className="pr-pick">
              <span className="pr-pick-q">{activeKind === 'scorer' ? `Which Ekhaya player scores v ${opponent}?` : 'Who will be Man of the Match?'}</span>
              <div className="pr-players" role="radiogroup" aria-label="Choose a player">
                {squadPlayers.map((p) => {
                  const on = playerId === p.id
                  return <button key={p.id} type="button" role="radio" aria-checked={on} className={`pr-player-card${on ? ' on' : ''}`} disabled={saving} onClick={() => setPlayerD(p.id)}>
                    <PlayerAvatar player={p} />
                    <span className="pr-player-name">{p.name}</span>
                    {p.number != null && <em className="pr-player-no">{p.number}</em>}
                    {on && <span className="pr-player-tick" aria-hidden="true"><Check size={13} /></span>}
                  </button>
                })}
              </div>
            </div>
          )}

          <Button type="button" disabled={saving} onClick={(e) => void save(e.currentTarget)}>{saving ? 'Saving…' : saved ? 'Update prediction' : 'Save prediction'}</Button>
          {saved && <p className="pr-saved"><Check size={13} aria-hidden="true" /> Saved — {savedSummary}. You can change it until kick-off.</p>}
        </>
      )}
    </Card>
  )
}

/** How a fan's pick on the most recent finished league match turned out. */
function ResultCard({ fixture, squadPlayers }: { fixture: Fixture; squadPlayers: Player[] }) {
  const { user } = useAuth()
  const mine = useMyDoc<Pick>(user ? ['fixtures', fixture.id, 'picks', user.uid] : null)
  const saved = mine.data
  const [scorerIds, setScorerIds] = useState<string[] | null>(null)

  useEffect(() => {
    if (saved?.type !== 'scorer') return
    let active = true
    getDocs(collection(db, 'fixtures', fixture.id, 'events'))
      .then((snap) => { if (active) setScorerIds(snap.docs.filter((d) => d.data().kind === 'goal').map((d) => String(d.data().playerId || ''))) })
      .catch(() => { if (active) setScorerIds([]) })
    return () => { active = false }
  }, [fixture.id, saved?.type])

  if (!saved) return null
  const playerName = (id: string) => squadPlayers.find((p) => p.id === id)?.name ?? 'your pick'
  let won: boolean | null
  let line: string
  if (saved.type === 'score') { won = saved.home === (fixture.homeScore ?? 0) && saved.away === (fixture.awayScore ?? 0); line = `You said ${saved.home}–${saved.away}.` }
  else if (saved.type === 'motm') { won = fixture.manOfTheMatchId ? saved.playerId === fixture.manOfTheMatchId : null; line = `You picked ${playerName(saved.playerId ?? '')} for Man of the Match.` }
  else { won = scorerIds ? scorerIds.includes(saved.playerId ?? '') : null; line = `You backed ${playerName(saved.playerId ?? '')} to score.` }

  return (
    <Card className="pr-result">
      <div className="pr-result-head"><strong>{fixture.home} {fixture.homeScore ?? 0}–{fixture.awayScore ?? 0} {fixture.away}</strong><span>{competitionOf(fixture.competition).short}</span></div>
      <p className={`pr-result-line${won === true ? ' win' : won === false ? ' miss' : ''}`}>{line} {won === true ? '✓ You called it!' : won === false ? 'Not this time.' : 'Result being settled…'}</p>
    </Card>
  )
}

/** The Predictor points table — fans see their points and the other fans. */
function PredictorBoard() {
  const { user } = useAuth()
  const scores = useFirestoreCollection<PredictorScore>('predictorScores')
  if (scores.loading) return <Card className="pr-board"><Skeleton className="fz-board-skeleton" /></Card>
  const rows = scores.items.filter((r) => (r.points ?? 0) > 0).sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
  if (!rows.length) return <Card className="pr-board"><p className="pr-board-empty">No points yet — be the first to predict and climb the table. Correct score = 5 points, goalscorer and Man of the Match = 3 points each.</p></Card>
  const myIndex = rows.findIndex((r) => r.id === user?.uid)
  const top = rows.slice(0, 15)
  return (
    <Card className="pr-board">
      <ol className="pr-board-list">
        {top.map((r, i) => (
          <li key={r.id} className={r.id === user?.uid ? 'me' : ''}>
            <span className={`fz-board-rank${i < 3 ? ` fz-rank-${i + 1}` : ''}`}>{i + 1}</span>
            <span className="pr-board-name">{r.name || 'Fan'}{r.id === user?.uid && <em> · you</em>}</span>
            <strong>{r.points}<small> pts</small></strong>
          </li>
        ))}
      </ol>
      {myIndex >= 15 && <p className="pr-board-you">You are #{myIndex + 1} with {rows[myIndex].points} pts — keep predicting to climb.</p>}
    </Card>
  )
}

export default function Predictor() {
  const { user, role } = useAuth()
  const isSuperadmin = role === 'superadmin'
  const fixtures = useFirestoreCollection<Fixture>('fixtures')
  const players = useFirestoreCollection<Player>('players')

  const leagueMen = useMemo(() => fixtures.items.filter((f) => !f.isTest && (f.squad ?? 'men') === 'men' && competitionOf(f.competition).kind === 'league'), [fixtures.items])
  const upcoming = useMemo(() => sortByDate(leagueMen.filter((f) => f.status === 'upcoming'), 'asc').slice(0, 2), [leagueMen])
  const lastPlayed = useMemo(() => sortByDate(leagueMen.filter(isPlayed), 'desc')[0], [leagueMen])
  const menPlayers = useMemo(() => players.items.filter((p) => (p.squad ?? 'men') === 'men').sort((a, b) => (a.number ?? 99) - (b.number ?? 99)), [players.items])

  if (fixtures.loading || players.loading) return <><PageHeader eyebrow="Win a prize" title="Predictor" /><div className="loading-list"><Skeleton /><Skeleton /></div></>

  return (
    <div className="predictor">
      <PageHeader eyebrow="Win a prize" title="Predictor" description="Predict Ekhaya's league matches · Malawi time (CAT)" />

      <Card className="pr-prize">
        <div className="pr-prize-icons" aria-hidden="true"><Gift size={22} /><Ticket size={22} /></div>
        <div>
          <strong>Win an Ekhaya jersey or a match ticket</strong>
          <p>Predict two league matches each fortnight. Every correct call earns you an entry into the prize draw — the more you get right, the better your chances.</p>
        </div>
      </Card>

      {fixtures.error && <p className="live-error" role="alert">Matches could not be loaded. Check your connection.</p>}

      <section className="pr-section">
        <h2 className="pr-section-title"><Target size={17} aria-hidden="true" /> This fortnight</h2>
        {upcoming.length
          ? upcoming.map((f) => <PredictMatch key={f.id} fixture={f} squadPlayers={menPlayers} />)
          : <EmptyState icon={CalendarDays} title="No league matches open yet" description="The next league fixtures will appear here as soon as they are scheduled. Check back soon." />}
      </section>

      {lastPlayed && user && (
        <section className="pr-section">
          <h2 className="pr-section-title"><Trophy size={17} aria-hidden="true" /> How you did</h2>
          <ResultCard fixture={lastPlayed} squadPlayers={menPlayers} />
        </section>
      )}

      <section className="pr-section">
        <h2 className="pr-section-title"><Trophy size={17} aria-hidden="true" /> Points table</h2>
        <PredictorBoard />
      </section>

      {isSuperadmin && (upcoming.length > 0 || lastPlayed) && (
        <section className="pr-section">
          <h2 className="pr-section-title"><Users size={17} aria-hidden="true" /> Fan predictions · superadmin</h2>
          {[...upcoming, ...(lastPlayed ? [lastPlayed] : [])].map((f) => (
            <MatchPredictionsAdmin key={f.id} fixtureId={f.id} home={f.home} away={f.away} players={menPlayers} />
          ))}
        </section>
      )}

      <p className="pr-foot">Correct score = 5 points · Goalscorer = 3 points · Man of the Match = 3 points. Predictions lock at kick-off, and every point is an entry into the fortnightly prize draw for a jersey or a match ticket.</p>
    </div>
  )
}
