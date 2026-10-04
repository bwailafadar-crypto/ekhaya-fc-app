// Builds the shared public documents fans read, from the live collections
// (used by admin apps; scripts/publish-snapshot.cjs does the same on GitHub):
//   publicData/snapshot  fixtures + league table (changes during matches)
//   publicData/teams     clubs and logos (rarely changes; kept apart so live
//                        score updates never re-send the logos to every fan)
import type { DocumentData } from 'firebase/firestore'

// Admin-only bookkeeping fans never need.
const PRIVATE_FIXTURE_FIELDS = ['statsAppliedChanges']
// Stay well under Firestore's 1 MB document limit.
export const SNAPSHOT_MAX_BYTES = 900_000

type Row = DocumentData & { id: string }

function clean(rows: Row[], drop: string[] = []) {
  return rows
    .filter((row) => !row.isTest)
    .map((row) => {
      const copy: DocumentData = { ...row }
      for (const field of drop) delete copy[field]
      for (const [key, value] of Object.entries(copy)) if (value === undefined) delete copy[key]
      return copy
    })
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
}

/** Same text for the same data on every device: keys sorted, times as numbers. */
function stable(value: unknown): unknown {
  if (value && typeof value === 'object') {
    const v = value as { toMillis?: () => number }
    if (typeof v.toMillis === 'function') return v.toMillis()
    if (Array.isArray(value)) return value.map(stable)
    return Object.fromEntries(Object.keys(value as object).sort().map((key) => [key, stable((value as Record<string, unknown>)[key])]))
  }
  return value
}

/** Small fingerprint so unchanged data is never written again (and two admins agree). */
export function fingerprint(value: unknown) {
  const text = JSON.stringify(stable(value))
  let hash = 5381
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0
  return { hash: `${(hash >>> 0).toString(36)}-${text.length}`, bytes: text.length }
}

function pack(payload: DocumentData) {
  const size = fingerprint(payload)
  // Too big for one document: switch it off, fans then read the collections directly.
  if (size.bytes > SNAPSHOT_MAX_BYTES) return { doc: { disabled: true, reason: 'too-large', hash: 'disabled' }, hash: 'disabled' }
  return { doc: { ...payload, hash: size.hash, bytes: size.bytes }, hash: size.hash }
}

export function buildMatchSnapshot(input: { fixtures: Row[]; standings: Row[] }) {
  return pack({ fixtures: clean(input.fixtures, PRIVATE_FIXTURE_FIELDS), standings: clean(input.standings) })
}

export function buildTeamsSnapshot(teams: Row[]) {
  return pack({ teams: clean(teams) })
}
