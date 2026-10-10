import { useSearchParams } from 'react-router-dom'
import { CUPS, type CompetitionFilter } from '../utils/competitions'
import { useFlag } from './useFlag'

/** League / Cups switch (with Airtel Top 8 and Castel Cup under Cups), kept in the address so links can open a filter. */
export function useCompetitionFilter(): [CompetitionFilter, (value: CompetitionFilter) => void] {
  const [params, setParams] = useSearchParams()
  // With competitions switched off, old links never leave fans on a hidden filter.
  const enabled = useFlag('competitions')
  const value = enabled ? params.get('c') || 'all' : 'all'
  const set = (next: CompetitionFilter) => setParams(next === 'all' ? {} : { c: next }, { replace: true })
  return [value, set]
}

export function filterLabel(value: CompetitionFilter) {
  if (value === 'league') return 'FDH Championship'
  if (value === 'cups') return 'Cups'
  return CUPS.find((cup) => cup.id === value)?.name ?? 'All competitions'
}
