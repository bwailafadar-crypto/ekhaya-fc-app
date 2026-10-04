import { useSearchParams } from 'react-router-dom'
import { CUPS, type CompetitionFilter } from '../utils/competitions'

/** League / Cups switch (with Airtel Top 8 and Castel Cup under Cups), kept in the address so links can open a filter. */
export function useCompetitionFilter(): [CompetitionFilter, (value: CompetitionFilter) => void] {
  const [params, setParams] = useSearchParams()
  const value = params.get('c') || 'all'
  const set = (next: CompetitionFilter) => setParams(next === 'all' ? {} : { c: next }, { replace: true })
  return [value, set]
}

export function filterLabel(value: CompetitionFilter) {
  if (value === 'league') return 'TNM Super League'
  if (value === 'cups') return 'Cups'
  return CUPS.find((cup) => cup.id === value)?.name ?? 'All competitions'
}
