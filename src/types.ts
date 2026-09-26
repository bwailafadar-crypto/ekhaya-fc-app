export type MatchStatus = 'upcoming' | 'live' | 'finished'

export interface Fixture {
  id: string
  competition: string
  date: string
  venue: string
  home: string
  away: string
  status: MatchStatus
  homeScore?: number
  awayScore?: number
  minute?: number
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
  number: number
  position: 'GK' | 'DEF' | 'MID' | 'FWD'
  photo?: string
}

export interface TableRow {
  team: string
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  points: number
}