export type MatchStatus = 'upcoming' | 'live' | 'finished'

export interface Team {
  id: string
  name: string
  shortName: string
  logoDataUrl: string | null
  homeGround: string | null
}

export interface Fixture {
  id: string
  competition: string
  season?: string
  date: string
  venue: string | null
  home: string
  away: string
  status: MatchStatus
  homeScore?: number | null
  awayScore?: number | null
  minute?: number
  eventCount?: number
  startingPlayerIds?: string[]
  statsApplied?: boolean
}

export type MatchEventKind = 'goal' | 'card' | 'substitution'

export interface MatchEvent {
  id: string
  kind: MatchEventKind
  minute: number
  team: string
  playerId?: string
  playerName?: string
  assistPlayerId?: string
  assistPlayerName?: string
  card?: 'yellow' | 'red'
  subbedInPlayerId?: string
  subbedInPlayerName?: string
  subbedOutPlayerId?: string
  subbedOutPlayerName?: string
}

export interface NewsItem {
  id: string
  title: string
  summary: string
  date: string
  category: 'Match' | 'Club' | 'Transfer' | 'Community'
}

export interface Player {
  id: string
  name: string
  number: number | null
  team: string
  position: 'GK' | 'DEF' | 'MID' | 'FWD' | null
  dob: string | null
  nationality: string | null
  preferredFoot: 'Left' | 'Right' | 'Both' | null
  heightCm: number | null
  photoDataUrl: string | null
  stats: PlayerStats
}

export interface PlayerStats {
  appearances: number
  starts: number
  minutes: number
  goals: number
  assists: number
  yellowCards: number
  redCards: number
  cleanSheets: number
}

export interface Standing {
  id: string
  position: number
  team: string
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  goalDifference: number
  points: number
  form: Array<'W' | 'D' | 'L'>
}

export type TableRow = Standing