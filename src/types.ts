import type { Timestamp } from 'firebase/firestore'

export type MatchStatus = 'upcoming' | 'live' | 'finished'
export type MatchPeriod = 'first-half' | 'half-time' | 'second-half' | 'full-time'

export interface MatchStats {
  shots: number
  shotsOnTarget: number
  corners: number
  fouls: number
  offsides: number
}

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
  /** Cup round, e.g. "Quarter-final · 1st leg" or "Final". */
  round?: string | null
  /** Extra result detail, e.g. aggregate score or penalties. */
  note?: string | null
  date: string
  venue: string | null
  home: string
  away: string
  status: MatchStatus
  homeScore?: number | null
  awayScore?: number | null
  minute?: number
  eventCount?: number
  isTest?: boolean
  period?: MatchPeriod
  kickoffAt?: Timestamp
  periodStartedAt?: Timestamp
  clockElapsedSeconds?: number
  firstHalfSeconds?: number
  addedTime?: number
  matchStats?: { home: MatchStats; away: MatchStats }
  statsSkipped?: boolean
  statsAppliedChanges?: AppliedMatchChanges
  startingPlayerIds?: string[]
  benchPlayerIds?: string[]
  lineupConfirmed?: boolean
  /** Minutes played from the club's official match sheet (player id → minutes). */
  officialMinutes?: Record<string, number>
  /** Line-up shape, e.g. '4-3-3'. */
  formation?: string
  /** True while an admin is correcting a finished match. */
  editing?: boolean
  /** Editing a result the app never counted (imported): saving leaves the table and stats alone. */
  editNoStats?: boolean
  statsApplied?: boolean
  /** Fan Zone: admin closed man-of-the-match voting for this match. */
  motmClosed?: boolean
  /** Fan Zone: predictions closed (set at kick-off; an admin can reopen). */
  predictionsLocked?: boolean
  /** Fan Zone: man of the match result saved when voting closes. */
  motmWinnerId?: string
  motmWinnerVotes?: number
  motmTotalVotes?: number
  motmTally?: Record<string, number>
}

export interface AppliedStandingChange {
  standingId: string
  played: 1
  won: 0 | 1
  drawn: 0 | 1
  lost: 0 | 1
  goalsFor: number
  goalsAgainst: number
  points: number
  result: 'W' | 'D' | 'L'
}

export interface AppliedMatchChanges {
  standings: AppliedStandingChange[]
  players: Record<string, Partial<PlayerStats>>
}

export type MatchEventKind = 'goal' | 'card' | 'substitution' | 'commentary'

export interface MatchEvent {
  id: string
  kind: MatchEventKind
  minute: number
  team: string
  text?: string
  createdAt?: Timestamp
  updatedAt?: Timestamp
  playerId?: string
  playerName?: string
  assistPlayerId?: string
  assistPlayerName?: string
  card?: 'yellow' | 'red'
  subbedInPlayerId?: string
  subbedInPlayerName?: string
  subbedOutPlayerId?: string
  subbedOutPlayerName?: string
  /** YouTube/Facebook clip of this moment (goals). */
  videoUrl?: string
}

export type NewsCategory = 'Match' | 'Club' | 'Transfer' | 'Community'
export type NewsStatus = 'draft' | 'published'
export type NewsBodyBlock =
  | { id: string; type: 'paragraph'; text: string }
  | { id: string; type: 'photo'; photoId: string; caption?: string }

export interface NewsPhoto {
  id: string
  dataUrl: string
  caption: string
  order: number
}

export interface NewsItem {
  id: string
  title: string
  category: NewsCategory
  summary: string
  body: string
  coverImage: string
  publishedDate: string
  featured: boolean
  status: NewsStatus
  bodyBlocks?: NewsBodyBlock[]
  photoIds?: string[]
  coverPhotoId?: string
}

export interface MembershipTier {
  id: string
  name: string
  priceMWK: number
  durationMonths: number
  benefits: string[]
  colour: string
  active: boolean
}

export interface MembershipRecord {
  uid: string
  tierId: string
  fullName: string
  phone: string
  email: string
  status: 'pending' | 'active' | 'suspended'
  fanId?: string
  startDate?: Timestamp
  expiryDate?: Timestamp
  createdAt?: Timestamp
}

export interface LegacyFan {
  id: string
  fullName: string
  email: string
  phone: string | null
  tier: string
  status: string
  fanId: string | null
  memberSince: string | Timestamp | null
  expiryDate?: string | Timestamp | null
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
  formHistory?: Array<{ fixtureId: string; result: 'W' | 'D' | 'L' }>
  /** Position before the latest result (for the up/down arrows). */
  previousPosition?: number
}

export type TableRow = Standing
// ---- Fan Zone ----
export interface Poll {
  id: string
  question: string
  options: string[]
  status: 'open' | 'closed'
  createdAt?: Timestamp
  /** Final vote counts per option, saved when the poll is closed. */
  results?: number[]
}

export interface PollVote { id: string; option: number; updatedAt?: Timestamp }
export interface ScorePrediction { id: string; home: number; away: number; name: string; updatedAt?: Timestamp }
export interface MotmVote { id: string; playerId: string; updatedAt?: Timestamp }

