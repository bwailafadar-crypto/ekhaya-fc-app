import { collection, getDocs, query, where } from 'firebase/firestore'
import { ArrowLeft, Bandage, Bell, BellOff, Goal, UserRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import PlayerAvatar from '../components/PlayerAvatar'
import CountUp from '../components/CountUp'
import TeamLogo from '../components/TeamLogo'
import { useToast } from '../components/ToastContext'
import { EmptyState, PageHeader, Skeleton } from '../components/UI'
import { db } from '../firebase'
import { useFirestoreCollection } from '../hooks/useFirestoreCollection'
import type { Fixture, Player } from '../types'
import { ekhayaOutcome, formatMalawiDate, isPlayed, sortByDate } from '../utils/football'
import { enablePush, pushSupport, savedFollows, savedPrefs, setFollow } from '../utils/push'

const POSITION_NAMES: Record<string, string> = { GK: 'Goalkeeper', DEF: 'Defender', MID: 'Midfielder', FWD: 'Forward' }


function playerAge(dob: string | null) {
  if (!dob) return null
  const birthDate = new Date(`${dob}T00:00:00`)
  if (Number.isNaN(birthDate.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  if (today.getMonth() < birthDate.getMonth()
    || (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate())) age -= 1
  return age
}

const FOLLOW_PROBLEMS: Record<string, string> = {
  'no-key': 'Alerts are not set up for the app yet.',
  apk: 'Alerts work in the web app (ekhaya-fc-app.web.app), not in the downloaded Android app yet.',
  'ios-install': 'On iPhone, add the app to your Home Screen first (Share → Add to Home Screen), then follow.',
  unsupported: 'This browser cannot receive alerts. Try Chrome.',
  blocked: 'Alerts are blocked for this app. Allow notifications in your browser settings, then try again.',
  dismissed: 'Tap Allow when your phone asks, to get his goals.',
}

function FollowButton({ player }: { player: Player }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [following, setFollowing] = useState(() => savedFollows().includes(player.id))
  const [busy, setBusy] = useState(false)
  const first = player.name.split(/\s+/)[0]

  async function toggle() {
    if (!user) return
    setBusy(true)
    try {
      // Following always works; goal alerts are a bonus where the device allows them.
      const list = await setFollow(user.uid, player.id, !following)
      const now = list.includes(player.id)
      setFollowing(now)
      if (!now) { showToast(`You no longer follow ${first}.`); return }
      const support = await pushSupport().catch(() => 'unsupported' as const)
      if (support === 'ok') {
        try { await enablePush(user.uid, savedPrefs()); await setFollow(user.uid, player.id, true) } catch { /* following still saved */ }
        showToast(`Following ${first}. You'll get an alert when he scores.`)
      } else {
        showToast(`Following ${first}.`)
      }
    } catch (error) {
      const code = error instanceof Error ? error.message : ''
      showToast(FOLLOW_PROBLEMS[code] ?? 'Could not save. Check your connection and try again.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return <button type="button" className={`follow-button${following ? ' following' : ''}`} aria-pressed={following} disabled={busy} onClick={() => void toggle()}>
    {following ? <BellOff size={15} aria-hidden="true" /> : <Bell size={15} aria-hidden="true" />}
    {busy ? 'Saving…' : following ? 'Following' : `Follow ${first}`}
  </button>
}

/** His goals in his recent matches: one small query per match, only for those matches. */
function useGoals(playerId: string, fixtureIds: string[]) {
  const key = fixtureIds.join(',')
  const [state, setState] = useState<{ key: string; goals: Record<string, number[]> }>({ key: '', goals: {} })
  useEffect(() => {
    if (!key) return
    let active = true
    void Promise.all(key.split(',').map(async (fixtureId) => {
      try {
        const snap = await getDocs(query(collection(db, 'fixtures', fixtureId, 'events'), where('playerId', '==', playerId)))
        return [fixtureId, snap.docs.map((item) => item.data()).filter((event) => event.kind === 'goal').map((event) => Number(event.minute)).sort((a, b) => a - b)] as const
      } catch { return [fixtureId, []] as const }
    })).then((rows) => { if (active) setState({ key, goals: Object.fromEntries(rows) }) })
    return () => { active = false }
  }, [playerId, key])
  return state.key === key ? state.goals : {}
}

export default function PlayerDetailPage() {
  const { id = '' } = useParams()
  const { items, loading, error } = useFirestoreCollection<Player>('players')
  const player = items.find((item) => item.id === id)
  const fixtures = useFirestoreCollection<Fixture>('fixtures')
  const real = fixtures.items.filter((fixture) => !fixture.isTest)
  // Matches he was named in (started or on the bench), newest first.
  const log = sortByDate(real.filter((fixture) => isPlayed(fixture) && ((fixture.startingPlayerIds ?? []).includes(id) || (fixture.benchPlayerIds ?? []).includes(id))), 'desc').slice(0, 6)
  const goals = useGoals(id, log.map((fixture) => fixture.id))

  if (loading) {
    return <div className="player-detail-loading"><Skeleton /><Skeleton /><Skeleton /></div>
  }
  if (error) return <EmptyState icon={UserRound} title="Could not load player" description={error} />
  if (!player) return <EmptyState icon={UserRound} title="Player not found" description="This player may have been removed from the squad." />

  const age = playerAge(player.dob)
  const position = player.position ? POSITION_NAMES[player.position] : null
  const footLabel = player.preferredFoot === 'Both' ? 'Both feet' : player.preferredFoot ? `${player.preferredFoot} foot` : null
  const yellows = player.stats?.yellowCards ?? 0
  const reds = player.stats?.redCards ?? 0
  return (
    <>
      <Link className="back-link" to="/squad"><ArrowLeft size={17} /> Squad</Link>
      <section className="player-hero player-hero-big">
        {player.number != null && <span className="player-hero-number" aria-hidden="true">{player.number}</span>}
        <PlayerAvatar player={player} large />
        <div className="player-profile-heading">
          <span className="page-eyebrow">{position ?? 'Squad'}{player.number == null ? '' : ` · #${player.number}`}</span>
          <h1>{player.name}{player.injured && <span className="player-injured-badge"><Bandage size={13} aria-hidden="true" /> Injured</span>}</h1>
          <p>Ekhaya FC{age != null ? ` · ${age} years` : ''}{player.nationality ? ` · ${player.nationality}` : ''}{footLabel ? ` · ${footLabel}` : ''}</p>
          {(yellows > 0 || reds > 0) && <p className="player-discipline" aria-label={`${yellows} yellow card${yellows === 1 ? '' : 's'}, ${reds} red card${reds === 1 ? '' : 's'}`}>
            {yellows > 0 && <span className="disc-card disc-yellow"><i aria-hidden="true" /> {yellows}</span>}
            {reds > 0 && <span className="disc-card disc-red"><i aria-hidden="true" /> {reds}</span>}
          </p>}
          <FollowButton key={player.id} player={player} />
        </div>
      </section>

      <section className="player-headline-stats" aria-label="Season at a glance">
        <div><strong className="number"><CountUp value={player.stats?.appearances ?? 0} /></strong><span>Apps</span></div>
        {player.position === 'GK'
          ? <div><strong className="number"><CountUp value={player.stats?.cleanSheets ?? 0} /></strong><span>Clean sheets</span></div>
          : <>
            <div><strong className="number"><CountUp value={player.stats?.goals ?? 0} /></strong><span>Goals</span></div>
            <div><strong className="number"><CountUp value={player.stats?.assists ?? 0} /></strong><span>Assists</span></div>
          </>}
      </section>

      {log.length > 0 && <>
        <PageHeader eyebrow="Recent matches" title="Match log" />
        <ul className="player-log">
          {log.map((fixture) => {
            const started = (fixture.startingPlayerIds ?? []).includes(id)
            const outcome = ekhayaOutcome(fixture)
            const opponent = /ekhaya/i.test(fixture.home) ? fixture.away : fixture.home
            const scored = goals[fixture.id] ?? []
            return <li key={fixture.id}><Link to={`/live?match=${fixture.id}`}>
              {outcome && <span className={`player-log-result result-${outcome}`}>{outcome}</span>}
              <TeamLogo name={opponent} />
              <span className="player-log-main"><strong>{/ekhaya/i.test(fixture.home) ? 'v' : '@'} {opponent} · {fixture.homeScore ?? 0}–{fixture.awayScore ?? 0}</strong><small>{formatMalawiDate(fixture.date)} · {started ? 'Started' : 'Sub'}{fixture.officialMinutes?.[id] ? ` · ${fixture.officialMinutes[id]}′` : ''}</small></span>
              {scored.length > 0 && <span className="player-log-goals" aria-label={`${scored.length} goal${scored.length === 1 ? '' : 's'}`}>{scored.map((minute, index) => <i key={index}><Goal size={11} aria-hidden="true" /> {minute}′</i>)}</span>}
            </Link></li>
          })}
        </ul>
      </>}

      <PageHeader eyebrow="Player details" title="Player profile" />
      <section className="player-facts" aria-label="Player details">
        <Fact label="Position" value={position} />
        <Fact label="Age" value={age == null ? null : `${age} years`} />
        <Fact label="Nationality" value={player.nationality} />
        <Fact label="Preferred foot" value={player.preferredFoot} />
      </section>

    </>
  )
}

function Fact({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="player-fact">
      <span>{label}</span>
      <strong>{value || 'Not provided'}</strong>
    </div>
  )
}
