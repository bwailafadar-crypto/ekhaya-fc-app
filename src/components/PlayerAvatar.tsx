import type { Player } from '../types'

export default function PlayerAvatar({ player, large = false }: { player: Player; large?: boolean }) {
  const initials = player.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()
  const className = `player-avatar${large ? ' player-avatar-large' : ''}`
  return player.photoDataUrl
    ? <img className={className} src={player.photoDataUrl} alt={player.name} />
    : <span className={`${className} player-avatar-fallback`} aria-label={`${player.name} initials`}>{initials}</span>
}