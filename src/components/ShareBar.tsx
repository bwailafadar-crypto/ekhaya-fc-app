import { Share2 } from 'lucide-react'
import { useState } from 'react'
import { useTeams } from '../data/TeamContext'
import type { Fixture, MatchEvent, Player } from '../types'
import { competitionLabel } from '../utils/competitions'
import { formatMalawiDate, isPlayed } from '../utils/football'
import { isFormation, linesBySlot, DEFAULT_FORMATION } from '../utils/formations'
import { renderShareCard, shareImage, type ShareCard, type SharePlayer, type ShareTeam } from '../utils/shareCard'
import { useToast } from './ToastContext'

const CLUB = 'ekhaya fc'
const isClub = (name: string) => name.trim().toLocaleLowerCase() === CLUB

function slug(text: string) {
  return text.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/** "Share result / Share XI / Share man of the match" buttons for the match centre. */
export default function ShareBar({ fixture, events, players, minuteLabel }: { fixture: Fixture; events: MatchEvent[]; players: Player[]; minuteLabel: string }) {
  const { teams } = useTeams()
  const { showToast } = useToast()
  const [busy, setBusy] = useState('')

  const team = (name: string): ShareTeam => {
    const found = teams.find((item) => item.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase() || item.shortName.toLocaleLowerCase() === name.trim().toLocaleLowerCase())
    return { name, logo: found?.logoDataUrl ?? (isClub(name) ? './team-logos/ekhaya-fc.png' : null) }
  }
  const asShare = (player: Player): SharePlayer => ({ name: player.name, number: player.number, photo: player.photoDataUrl })
  const byId = new Map(players.map((player) => [player.id, player]))
  const played = isPlayed(fixture)
  const live = fixture.status === 'live' && !fixture.editing
  const starters = (fixture.startingPlayerIds ?? []).map((id) => byId.get(id)).filter((player): player is Player => Boolean(player))
  const winner = fixture.motmClosed && fixture.motmWinnerId ? byId.get(fixture.motmWinnerId) : undefined
  const competition = competitionLabel(fixture.competition)
  const matchLine = `${fixture.home} ${fixture.homeScore ?? 0}–${fixture.awayScore ?? 0} ${fixture.away}`

  function scorers(side: string) {
    return events
      .filter((event) => event.kind === 'goal' && event.team.trim().toLocaleLowerCase() === side.trim().toLocaleLowerCase())
      .sort((a, b) => a.minute - b.minute)
      .map((event) => `${event.playerName || 'Goal'} ${event.minute}′`)
  }

  async function share(kind: ShareCard['kind']) {
    setBusy(kind)
    try {
      let card: ShareCard
      let text: string
      if (kind === 'result') {
        card = { kind, home: team(fixture.home), away: team(fixture.away), homeScore: fixture.homeScore ?? 0, awayScore: fixture.awayScore ?? 0, status: live ? `Live · ${minuteLabel}` : 'Full time', competition, date: formatMalawiDate(fixture.date), venue: fixture.venue || '', homeScorers: scorers(fixture.home), awayScorers: scorers(fixture.away) }
        text = `${live ? 'LIVE' : 'Full time'}: ${matchLine} · Follow Ekhaya FC: https://ekhaya-fc-app.web.app`
      } else if (kind === 'lineup') {
        const formation = isFormation(fixture.formation) ? fixture.formation : DEFAULT_FORMATION
        const bench = (fixture.benchPlayerIds ?? []).map((id) => byId.get(id)).filter((player): player is Player => Boolean(player))
        card = { kind, club: team('Ekhaya FC'), opponent: team(isClub(fixture.home) ? fixture.away : fixture.home), competition, date: formatMalawiDate(fixture.date), formation, lines: linesBySlot(starters.map(asShare), formation), subs: bench.map((player) => player.name.split(/\s+/).slice(-1)[0] ?? player.name) }
        text = `Team news! Ekhaya FC starting XI v ${isClub(fixture.home) ? fixture.away : fixture.home} · https://ekhaya-fc-app.web.app`
      } else {
        if (!winner) return
        const votes = fixture.motmWinnerVotes ?? null
        const total = fixture.motmTotalVotes ?? null
        card = { kind, club: team('Ekhaya FC'), player: asShare(winner), votes, share: votes != null && total ? Math.round(votes / total * 100) : null, match: matchLine, competition }
        text = `${winner.name} is the fans' man of the match! ${matchLine} · https://ekhaya-fc-app.web.app`
      }
      const blob = await renderShareCard(card)
      const result = await shareImage(blob, `ekhaya-${kind}-${slug(fixture.home)}-v-${slug(fixture.away)}.png`, text)
      if (result === 'downloaded') showToast('Image saved. Post it on WhatsApp or Facebook.')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'The image could not be made.', 'error')
    } finally {
      setBusy('')
    }
  }

  const buttons: Array<{ kind: ShareCard['kind']; label: string; show: boolean }> = [
    { kind: 'result', label: live ? 'Share score' : 'Share result', show: played || live },
    { kind: 'lineup', label: 'Share XI', show: starters.length >= 11 },
    { kind: 'motm', label: 'Share man of the match', show: Boolean(winner) },
  ]
  const visible = buttons.filter((button) => button.show)
  if (fixture.isTest || !visible.length) return null

  return <div className="share-bar" aria-label="Share this match">
    {visible.map((button) => <button key={button.kind} type="button" className="share-chip" disabled={Boolean(busy)} onClick={() => void share(button.kind)}>
      <Share2 size={15} aria-hidden="true" />{busy === button.kind ? 'Making image…' : button.label}
    </button>)}
  </div>
}
