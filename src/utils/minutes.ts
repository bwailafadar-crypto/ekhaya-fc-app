import type { Fixture, MatchEvent } from '../types'

/** First guess from the commentary: starters play to full time or until taken off; subs from when they came on. */
export function guessMinutes(fixture: Fixture, events: MatchEvent[], fullTime: number) {
  const minutes: Record<string, number> = {}
  for (const id of fixture.startingPlayerIds ?? []) minutes[id] = fullTime
  const subs = events.filter((event) => event.kind === 'substitution').sort((a, b) => a.minute - b.minute)
  for (const sub of subs) {
    const at = Math.min(fullTime, Math.max(0, sub.minute))
    if (sub.subbedOutPlayerId && minutes[sub.subbedOutPlayerId] != null) minutes[sub.subbedOutPlayerId] = Math.max(0, at - (fullTime - minutes[sub.subbedOutPlayerId]))
    if (sub.subbedInPlayerId) minutes[sub.subbedInPlayerId] = Math.max(1, fullTime - at)
  }
  for (const red of events.filter((event) => event.kind === 'card' && event.card === 'red' && event.playerId)) {
    const id = red.playerId as string
    if (minutes[id] != null) minutes[id] = Math.min(minutes[id], Math.max(1, red.minute))
  }
  return minutes
}
