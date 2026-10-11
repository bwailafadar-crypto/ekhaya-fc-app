// Stories at the top of Home: ones the club posts (photo + caption, 24 hours)
// plus automatic ones made from the fixtures fans already have (no extra reads).
import type { Fixture } from '../types'
import { competitionLabel } from './competitions'
import { formatMalawiDate, formatMalawiTime, isLiveNow, isPlayed, sortByDate } from './football'

export const STORY_LABELS = ['Team news', 'Match day', 'Goal', 'Training', 'Club'] as const
export type StoryLabel = (typeof STORY_LABELS)[number]

export type Story = {
  id: string
  /** 'post' = posted by the club (has a photo in storyImages/{id} when hasImage). */
  source: 'post' | 'auto'
  label: string
  title: string
  text?: string
  path?: string
  thumb?: string | null
  hasImage?: boolean
  tone?: 'live' | 'gold' | 'result'
  /** Team whose crest is shown on the bubble (auto stories). */
  crest?: string
  createdAt: number
}

export type StoredStory = {
  caption: string
  label: StoryLabel
  thumb?: string | null
  hasImage?: boolean
  path?: string
  createdAt?: { toMillis?: () => number }
  expiresAt?: { toMillis?: () => number }
  by: string
}

export const STORY_HOURS = 24
export const STORY_LINKS: Array<{ path: string; label: string }> = [
  { path: '', label: 'No link' },
  { path: '/live', label: 'Live match' },
  { path: '/fixtures', label: 'Fixtures' },
  { path: '/results', label: 'Results' },
  { path: '/fanzone', label: 'Fan Zone' },
  { path: '/news', label: 'News' },
  { path: '/squad', label: 'Squad' },
]

const DAY = 86_400_000
const isClub = (name: string) => /ekhaya/i.test(name)
const opponentOf = (fixture: Fixture) => (isClub(fixture.home) ? fixture.away : fixture.home)

/** Automatic stories: live score, next match, team news, full time. Newest first. */
export function autoStories(fixtures: Fixture[], now: number): Story[] {
  const real = fixtures.filter((fixture) => !fixture.isTest && (isClub(fixture.home) || isClub(fixture.away)))
  const stories: Story[] = []
  const live = real.find(isLiveNow)
  if (live) {
    stories.push({ id: `live-${live.id}-${live.homeScore ?? 0}-${live.awayScore ?? 0}`, source: 'auto', label: 'LIVE', tone: 'live', crest: opponentOf(live), title: `${live.home} ${live.homeScore ?? 0}–${live.awayScore ?? 0} ${live.away}`, text: `${competitionLabel(live.competition)} · follow every moment`, path: `/live?match=${live.id}`, createdAt: now })
  }
  const next = sortByDate(real.filter((fixture) => fixture.status === 'upcoming' && new Date(fixture.date).getTime() > now - 3 * 3_600_000), 'asc')[0]
  if (next && new Date(next.date).getTime() - now < 7 * DAY) {
    if (next.lineupConfirmed && (next.startingPlayerIds ?? []).length) {
      stories.push({ id: `xi-${next.id}-${next.formation ?? ''}-${(next.startingPlayerIds ?? []).join('').length}`, source: 'auto', label: 'Team news', tone: 'gold', crest: 'Ekhaya FC', title: 'The starting XI is in', text: `v ${opponentOf(next)}${next.formation ? ` · ${next.formation}` : ''}`, path: `/live?match=${next.id}&tab=lineups`, createdAt: now - 1 })
    }
    stories.push({ id: `next-${next.id}`, source: 'auto', label: 'Next match', tone: 'gold', crest: opponentOf(next), title: `${next.home} v ${next.away}`, text: `${formatMalawiDate(next.date)} · ${formatMalawiTime(next.date)} · ${next.venue || 'Venue TBC'}`, path: `/live?match=${next.id}`, createdAt: now - 2 })
  }
  const last = sortByDate(real.filter((fixture) => isPlayed(fixture) && !fixture.editing), 'desc')[0]
  if (last && now - new Date(last.date).getTime() < 4 * DAY) {
    stories.push({ id: `ft-${last.id}-${last.homeScore ?? 0}-${last.awayScore ?? 0}`, source: 'auto', label: 'Full time', tone: 'result', crest: opponentOf(last), title: `${last.home} ${last.homeScore ?? 0}–${last.awayScore ?? 0} ${last.away}`, text: last.motmClosed ? "See the fans' man of the match" : 'Vote for your man of the match', path: `/live?match=${last.id}${last.motmClosed ? '' : '&tab=vote'}`, createdAt: now - 3 })
  }
  return stories
}

/** A posted story as shown in the bar (expired ones are dropped). */
export function postedStory(id: string, data: StoredStory, now: number): Story | null {
  const expires = data.expiresAt?.toMillis?.() ?? 0
  if (expires && expires <= now) return null
  return { id, source: 'post', label: data.label, title: data.caption, thumb: data.thumb ?? null, hasImage: Boolean(data.hasImage), path: data.path || undefined, createdAt: data.createdAt?.toMillis?.() ?? now }
}

const SEEN_KEY = 'ekhaya-stories-seen'
export function seenStories(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]')) } catch { return new Set() }
}
export function markSeen(id: string) {
  try {
    const list = [...seenStories().add(id)].slice(-200)
    localStorage.setItem(SEEN_KEY, JSON.stringify(list))
  } catch { /* storage blocked: stories just stay "new" */ }
}
