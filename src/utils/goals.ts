// Goal lines saved on each finished match ("Mchema 21'"), so lists like
// Results and Top scorers show scorers without reading every match's events.
import type { Fixture, MatchEvent } from '../types'

export type GoalLine = {
  side: 'home' | 'away'
  name: string
  playerId?: string
  minute: number
  added?: number
  approx?: boolean
  /** Minute not known at all (only the scorer). */
  unknown?: boolean
  penalty?: boolean
  assist?: string
  assistId?: string
}

type GoalEvent = Pick<MatchEvent, 'kind' | 'minute' | 'team' | 'playerName' | 'playerId' | 'assistPlayerName' | 'assistPlayerId'> & { minuteApprox?: boolean; minuteUnknown?: boolean; addedTime?: number; penalty?: boolean }

const same = (a = '', b = '') => a.trim().toLowerCase() === b.trim().toLowerCase()

export function buildGoals(events: GoalEvent[], fixture: Pick<Fixture, 'home' | 'away'>): GoalLine[] {
  return events.filter((event) => event.kind === 'goal')
    .sort((a, b) => a.minute + (a.addedTime ?? 0) / 100 - (b.minute + (b.addedTime ?? 0) / 100))
    .map((event) => ({
      side: same(event.team, fixture.home) ? 'home' as const : 'away' as const,
      name: event.playerName || '',
      minute: event.minute,
      ...(event.playerId ? { playerId: event.playerId } : {}),
      ...(event.addedTime ? { added: event.addedTime } : {}),
      ...(event.minuteApprox ? { approx: true } : {}),
      ...(event.minuteUnknown ? { unknown: true } : {}),
      ...(event.penalty ? { penalty: true } : {}),
      ...(event.assistPlayerName ? { assist: event.assistPlayerName } : {}),
      ...(event.assistPlayerId ? { assistId: event.assistPlayerId } : {}),
    }))
}

/** "21'", "45+2'", "1st half" (when only the half is known). */
export function minuteLabel(goal: { minute: number; added?: number; approx?: boolean; minuteApprox?: boolean; addedTime?: number; unknown?: boolean; minuteUnknown?: boolean }) {
  if (goal.unknown || goal.minuteUnknown) return '–'
  if (goal.approx || goal.minuteApprox) return goal.minute <= 45 ? '1st half' : '2nd half'
  const added = goal.added ?? goal.addedTime
  if (added) return `${goal.minute}+${added}'`
  if (goal.minute > 90) return `90+${goal.minute - 90}'`
  return `${goal.minute}'`
}

export const surname = (name: string) => { const words = name.trim().split(/\s+/); const last = words.at(-1) ?? ''; return /^\d+$/.test(last) ? words.slice(-2).join(' ') : last || name }

/** "Mchema 21', 70'" style list for one side (same scorer grouped). */
export function scorerText(goals: GoalLine[], side: 'home' | 'away') {
  const groups = new Map<string, string[]>()
  for (const goal of goals.filter((item) => item.side === side)) {
    const key = goal.name ? surname(goal.name) : 'Goal'
    const label = goal.approx ? '' : `${minuteLabel(goal)}${goal.penalty ? ' pen' : ''}`
    groups.set(key, [...(groups.get(key) ?? []), label].filter(Boolean))
  }
  return [...groups.entries()].map(([name, minutes]) => (minutes.length ? `${name} ${minutes.join(', ')}` : name)).join(' · ')
}
