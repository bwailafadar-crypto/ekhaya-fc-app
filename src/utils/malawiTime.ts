const hasZone = (value: string) => /[zZ]|[+-]\d\d:?\d\d$/.test(value)

/** Kick-off as Malawi time "HH:MM", whatever way the date was saved. */
export function malawiTime(date: string) {
  if (!hasZone(date)) return date.slice(11, 16)
  const ms = new Date(date).getTime()
  return Number.isNaN(ms) ? '' : new Date(ms + 2 * 3600000).toISOString().slice(11, 16)
}

/** The match day (YYYY-MM-DD) in Malawi. */
export function malawiDay(date: string) {
  if (!hasZone(date)) return date.slice(0, 10)
  return new Date(new Date(date).getTime() + 2 * 3600000).toISOString().slice(0, 10)
}
