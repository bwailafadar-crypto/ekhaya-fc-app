import { useState, type CSSProperties } from 'react'
import { useTeams } from '../data/TeamContext'

// Logo files that 404'd once — don't try them again this session.
const missingLogos = new Set<string>()

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length <= 1) return (words[0] ?? 'FC').slice(0, 2).toUpperCase()
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase()
}

// Turns "Mighty Wanderers" / "FCB Nyasa Big Bullets" into the logo-file slug when
// the team isn't in the loaded teams list (e.g. a name from a fixture).
function slugFromName(name: string) {
  return name.trim().toLowerCase()
    .replace(/\bf\.?c\.?\b/g, '').replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
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
  // Any Ekhaya side (incl. "Ekhaya Women") uses the club crest.
  const slug = normalizedName.startsWith('ekhaya') ? 'ekhaya-fc' : team?.id ?? slugFromName(name)
  const style = { '--logo-size': crest ? '44px' : '30px' } as CSSProperties
  const classes = `team-logo${crest ? ' team-logo-crest' : ''} ${className}`.trim()

  // Prefer the logo image shipped with the app (sharp, always available), fall
  // back to the stored logo, then to the team's initials if neither loads.
  const [, bump] = useState(0)

  if (slug && !missingLogos.has(slug)) {
    return <img key={slug} className={classes} style={style} src={`./team-logos/${slug}.png`} alt={`${name} logo`} loading="lazy"
      onError={() => { missingLogos.add(slug); bump((n) => n + 1) }} />
  }

  if (team?.logoDataUrl) {
    return <img className={classes} style={style} src={team.logoDataUrl} alt={`${name} logo`} />
  }

  return <span className={`${classes} team-logo-fallback`} style={style} aria-label={`${name} initials`}>
    {initials(name)}
  </span>
}
