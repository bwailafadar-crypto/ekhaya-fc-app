import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { Lock, Shirt, Trophy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { db } from '../firebase'
import { useMyDoc } from '../hooks/useCounts'
import { inSquad } from '../hooks/useSquad'
import type { Fixture, HeroComp, HeroPick, Player } from '../types'
import { burst } from '../utils/celebrate'
import { saveErrorText } from '../utils/fanZone'
import { formatMalawiDate, formatMalawiTime } from '../utils/football'
import PlayerAvatar from './PlayerAvatar'
import { useToast } from './ToastContext'
import { Card } from './UI'

const MATCHES_PER_ROUND = 5

/** Matchday Hero: pick one men's player before kick-off; he earns you points. */
export default function MatchdayHero({ nextMatch, players }: { nextMatch?: Fixture; players: Player[] }) {
  const { user, profile } = useAuth()
  const { showToast } = useToast()
  const comp = useMyDoc<HeroComp>(['heroComp', 'current'])
  const round = comp.data
  const prevRound = useMyDoc<HeroComp>(round && round.roundNumber > 1 ? ['heroComp', `round-${round.roundNumber - 1}`] : null)
  const isMensNext = Boolean(nextMatch && (nextMatch.squad ?? 'men') === 'men')
  const fixtureId = isMensNext ? nextMatch!.id : ''
  const myPick = useMyDoc<Omit<HeroPick, 'id'>>(user && fixtureId ? ['fixtures', fixtureId, 'heroPicks', user.uid] : null)
  const [saving, setSaving] = useState('')
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30000); return () => window.clearInterval(timer) }, [])

  const squad = players.filter((player) => inSquad(player.squad, 'men')).sort((a, b) => (a.number ?? 99) - (b.number ?? 99))
  const kickoff = nextMatch?.date ? Date.parse(nextMatch.date) : 0
  const locked = !nextMatch || nextMatch.status !== 'upcoming' || nextMatch.predictionsLocked === true || (kickoff > 0 && kickoff <= now)

  const standings = round?.standings ?? {}
  const ranked = Object.entries(standings).map(([uid, s]) => ({ uid, ...s })).sort((a, b) => b.points - a.points)
  const mine = user ? standings[user.uid] : undefined
  const myRank = user ? ranked.findIndex((row) => row.uid === user.uid) + 1 : 0
  const roundNo = round?.roundNumber ?? 1
  const played = round?.countedFixtureIds?.length ?? 0
  const matchNo = Math.min(played + 1, MATCHES_PER_ROUND)
  const prize = round?.prize ?? 'Ekhaya FC jersey'

  async function pick(player: Player, button?: HTMLElement | null) {
    if (!user || !fixtureId || locked) return
    setSaving(player.id)
    try {
      await setDoc(doc(db, 'fixtures', fixtureId, 'heroPicks', user.uid), { playerId: player.id, name: (profile?.fullName ?? '').slice(0, 120), updatedAt: serverTimestamp() })
      burst(button ?? null, 16)
      showToast(`Your matchday hero: ${player.name}. Up the Ekhaya! 💛`)
    } catch (error) {
      showToast(saveErrorText(error, 'Your pick was not saved. Check your connection and try again.'), 'error')
    } finally {
      setSaving('')
    }
  }

  const myPlayer = myPick.data ? squad.find((player) => player.id === myPick.data?.playerId) : undefined

  return (
    <Card className="mh-card">
      <div className="mh-head">
        <div className="mh-prize"><Shirt size={20} aria-hidden="true" /></div>
        <div className="mh-head-text">
          <h3>Matchday Hero</h3>
          <span>Round {roundNo} · Match {matchNo} of {MATCHES_PER_ROUND} · win a {prize}</span>
        </div>
      </div>

      {prevRound.data?.winnerName && <p className="mh-winner"><Trophy size={14} aria-hidden="true" /> Round {prevRound.data.roundNumber}: <strong>{prevRound.data.winnerName}</strong> won the jersey with {prevRound.data.winnerPoints} pts! 🎉</p>}

      <div className="mh-scoring"><span>⚽ Goal <b>+5</b></span><span>👟 Assist <b>+3</b></span><span>⭐ MOM <b>+4</b></span></div>

      {isMensNext
        ? <>
            <p className="mh-sub">{locked ? 'Picks are closed for this match.' : `Pick your hero for ${nextMatch!.home} v ${nextMatch!.away} · ${formatMalawiDate(nextMatch!.date)} ${formatMalawiTime(nextMatch!.date)}`}</p>
            {myPlayer && <p className="mh-mypick">Your pick: <strong>{myPlayer.name}</strong>{myPlayer.number != null ? ` · #${myPlayer.number}` : ''}{!locked ? ' — tap another to change' : ''}</p>}
            {locked && !myPlayer
              ? <p className="fz-note"><Lock size={14} aria-hidden="true" /> You didn't pick for this match.</p>
              : squad.length === 0
                ? <p className="fz-note">The squad list will appear here soon.</p>
                : <div className="mh-grid">
                    {squad.map((player) => {
                      const chosen = myPick.data?.playerId === player.id
                      return <button key={player.id} type="button" className={`mh-player${chosen ? ' mh-player-on' : ''}`} disabled={locked || saving !== ''} onClick={(event) => void pick(player, event.currentTarget)} aria-pressed={chosen}>
                        <PlayerAvatar player={player} />
                        <span className="mh-player-name">{player.name}</span>
                        {player.number != null && <span className="mh-player-no">#{player.number}</span>}
                      </button>
                    })}
                  </div>}
          </>
        : <p className="mh-sub">The next men's match will open here for picks once it's scheduled.</p>}

      {mine && <p className="mh-you">You have <strong>{mine.points} pts</strong> this round{myRank > 0 ? ` · ${myRank}${myRank === 1 ? 'st' : myRank === 2 ? 'nd' : myRank === 3 ? 'rd' : 'th'} place` : ''}.</p>}

      {ranked.length > 0 && <div className="mh-board">
        <span className="mh-board-title">Top fans this round</span>
        {ranked.slice(0, 5).map((row, index) => <div key={row.uid} className={`mh-row${user && row.uid === user.uid ? ' mh-row-me' : ''}`}>
          <span className="mh-rank">{index + 1}</span>
          <span className="mh-row-name">{row.name}</span>
          <span className="mh-row-pts">{row.points}</span>
        </div>)}
      </div>}
    </Card>
  )
}
