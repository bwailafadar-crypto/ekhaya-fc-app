import type { Fixture } from '../types'

/** Same window as the Firestore rules: team news until 2 hours after full time. */
export function chatOpen(fixture: Fixture, now = Date.now()) {
  if (fixture.isTest || fixture.chatClosed) return false
  if (fixture.status === 'live') return true
  if (fixture.status === 'upcoming') return fixture.lineupConfirmed === true
  const finished = (fixture as Fixture & { finishedAt?: { toMillis?: () => number } }).finishedAt?.toMillis?.() ?? 0
  return fixture.status === 'finished' && finished > 0 && now - finished < 2 * 3600000
}
