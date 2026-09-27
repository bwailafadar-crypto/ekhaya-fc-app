import { useState, type CSSProperties } from 'react'
import { useTeams } from '../data/TeamContext'

const SULOM_LOGOS: Record<string, string> = {
  'blue-eagles': 'https://sulommw.com/wp-content/uploads/2025/03/Blue-Eagles-FC.png',
  'big-bullets': 'https://sulommw.com/wp-content/uploads/2024/02/NBB.png',
  'mighty-wanderers': 'https://sulommw.com/wp-content/uploads/2021/08/Wanderers.png',
  'silver-strikers': 'https://fam.mw/wp-content/uploads/2022/03/Silver-Strikers.png',
  'masters-fc': 'https://sulommw.com/wp-content/uploads/2026/03/Masters-FC-Logo.png',
  'moyale-barracks': 'https://sulommw.com/wp-content/uploads/2024/02/Moyale.png',
  'chitipa-united': 'https://sulommw.com/wp-content/uploads/2024/02/Chitipa-FC-Logo.png',
  'red-lions': 'https://fam.mw/wp-content/uploads/2022/03/Red-Lions.png',
  'mitundu-baptist': 'https://sulommw.com/wp-content/uploads/2026/02/Luanar-Mitundu-Logo-2.0.png',
  'civo-united': 'https://fam.mw/wp-content/uploads/2022/03/Civo.png',
  'ekhaya-fc': 'https://sulommw.com/wp-content/uploads/2025/03/Ekhaya-FC.png',
  'dedza-dynamos': 'https://sulommw.com/wp-content/uploads/2024/02/Dedza.png',
  'karonga-united': 'https://sulommw.com/wp-content/uploads/2024/02/Karonga.png',
  mafco: 'https://sulommw.com/wp-content/uploads/2024/02/MAFCO.png',
  'kamuzu-barracks': 'https://sulommw.com/wp-content/uploads/2024/02/Kamuzu-Barracks.png',
  'creck-sporting': 'https://sulommw.com/wp-content/uploads/2024/02/CRECK-SC.png',
}

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
  const [failedLogoUrl, setFailedLogoUrl] = useState('')
  const { teams } = useTeams()
  const normalizedName = name.trim().toLocaleLowerCase()
  const team = teams.find((item) => item.name.toLocaleLowerCase() === normalizedName
    || item.shortName.toLocaleLowerCase() === normalizedName)
  const style = { '--logo-size': crest ? '44px' : '30px' } as CSSProperties
  const classes = `team-logo${crest ? ' team-logo-crest' : ''} ${className}`.trim()

  const sulomLogoUrl = team ? SULOM_LOGOS[team.id] : undefined
  const logoUrl = team?.logoDataUrl && failedLogoUrl !== team.logoDataUrl
    ? team.logoDataUrl
    : sulomLogoUrl && failedLogoUrl !== sulomLogoUrl ? sulomLogoUrl : undefined

  if (logoUrl) {
    return <img className={classes} style={style} src={logoUrl} alt={`${name} logo`} loading="lazy" onError={() => setFailedLogoUrl(logoUrl)} />
  }

  return <span className={`${classes} team-logo-fallback`} style={style} aria-label={`${name} initials`}>
    {crest ? 'EFC' : initials(name)}
  </span>
}