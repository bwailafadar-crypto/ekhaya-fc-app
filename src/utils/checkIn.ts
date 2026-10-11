import type { Fixture } from '../types'

/** True when fans may check in: team news is out, or the match is on. */
export function checkInOpen(fixture: Fixture) {
  if (fixture.isTest || fixture.editing || !/ekhaya/i.test(`${fixture.home} ${fixture.away}`)) return false
  return fixture.status === 'live' || (fixture.status === 'upcoming' && Boolean(fixture.lineupConfirmed))
}
