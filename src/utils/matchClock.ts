import type { Fixture, MatchPeriod } from '../types'

export function elapsedMatchSeconds(fixture: Fixture, now = Date.now()) {
  const elapsed = Number(fixture.clockElapsedSeconds ?? (fixture.minute ?? 0) * 60)
  const running = fixture.period === 'first-half' || fixture.period === 'second-half'
  const startedAt = fixture.periodStartedAt?.toMillis()
  if (!running || startedAt == null) return elapsed
  return elapsed + Math.max(0, Math.floor((now - startedAt) / 1000))
}

export function matchMinute(fixture: Fixture, now = Date.now()) {
  if (fixture.period === 'half-time') return 'HT'
  if (fixture.period === 'full-time') return 'FT'
  if (!fixture.period) return `${fixture.minute ?? 0}'`

  const elapsed = elapsedMatchSeconds(fixture, now)
  const secondHalf = fixture.period === 'second-half'
  const halfSeconds = secondHalf ? Math.max(0, elapsed - (fixture.firstHalfSeconds ?? 45 * 60)) : elapsed
  const added = Math.max(Number(fixture.addedTime ?? 0), Math.ceil(Math.max(0, halfSeconds - 45 * 60) / 60))
  if (halfSeconds > 45 * 60 || added > 0) {
    return `${secondHalf ? 90 : 45}+${Math.max(1, added)}'`
  }
  return `${(secondHalf ? 45 : 0) + Math.max(1, Math.ceil(halfSeconds / 60))}'`
}

export function activePeriod(period: MatchPeriod | undefined) {
  return period === 'first-half' || period === 'second-half'
}