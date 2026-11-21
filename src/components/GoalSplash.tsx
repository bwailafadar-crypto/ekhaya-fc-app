import { Goal } from 'lucide-react'
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { MatchEvent, Player } from '../types'
import { fireConfetti, prefersLessMotion } from '../utils/confetti'
import PlayerAvatar from './PlayerAvatar'

/** Full-screen "GOAL!" moment when Ekhaya score, with the scorer's photo. Tap to close. */
export default function GoalSplash({ event, player, score, onClose }: { event: MatchEvent; player?: Player; score: string; onClose: () => void }) {
  useEffect(() => {
    const stop = fireConfetti(window.innerWidth / 2, window.innerHeight * 0.55, { duration: 2800, count: 140 })
    try { navigator.vibrate?.([120, 60, 120]) } catch { /* not supported */ }
    const timer = window.setTimeout(onClose, prefersLessMotion() ? 2500 : 4200)
    return () => { stop(); window.clearTimeout(timer) }
  }, [event.id, onClose])

  const name = player?.name ?? event.playerName ?? 'Ekhaya FC'
  // Drawn on top of everything (header and bottom bar included).
  return createPortal(<div className="goal-splash" role="alert" onClick={onClose}>
    <div className="goal-splash-card">
      <span className="goal-splash-word" aria-hidden="true">GOAL!</span>
      {player ? <PlayerAvatar player={player} large /> : <span className="goal-splash-ball" aria-hidden="true"><Goal size={44} /></span>}
      <strong>{name}{player?.number != null ? <em> #{player.number}</em> : null}</strong>
      <span>{event.minute}′{event.assistPlayerName ? ` · assist ${event.assistPlayerName}` : ''}</span>
      <b>{score}</b>
      <small>Tap to close</small>
    </div>
  </div>, document.body)
}
