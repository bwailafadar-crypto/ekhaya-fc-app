import type { CSSProperties } from 'react'
import { useTeams } from '../data/TeamContext'

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length <= 1) return (words[0] ?? 'FC').slice(0, 2).toUpperCase()
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase()
}

export default function TeamLogo({
  name,
  crest = false,
  className = '',
}: {
  name: string
  crest?: boolean
  className?: string
}) {
  const { teams } = useTeams()
  const normalizedName = name.trim().toLocaleLowerCase()
  const team = teams.find((item) => item.name.toLocaleLowerCase() === normalizedName
    || item.shortName.toLocaleLowerCase() === normalizedName)
  const style = { '--logo-size': crest ? '44px' : '30px' } as CSSProperties
  const classes = `team-logo${crest ? ' team-logo-crest' : ''} ${className}`.trim()

  if (team?.logoDataUrl) {
    return <img className={classes} style={style} src={team.logoDataUrl} alt={`${name} logo`} />
  }

  if (crest && normalizedName === 'ekhaya fc') {
    return <img className={classes} style={style} src="./team-logos/ekhaya-fc.png" alt={`${name} logo`} />
  }

  return <span className={`${classes} team-logo-fallback`} style={style} aria-label={`${name} initials`}>
    {initials(name)}
  </span>
}