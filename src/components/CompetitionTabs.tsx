import { useFlag } from '../hooks/useFlag'
import { CUPS, type CompetitionFilter } from '../utils/competitions'

const TOP = [
  { id: 'all', label: 'All' },
  { id: 'league', label: 'League' },
  { id: 'cups', label: 'Cups' },
]

export default function CompetitionTabs({ value, onChange }: { value: CompetitionFilter; onChange: (value: CompetitionFilter) => void }) {
  const enabled = useFlag('competitions')
  if (!enabled) return null
  const inCups = value === 'cups' || CUPS.some((cup) => cup.id === value)
  const top = inCups ? 'cups' : value
  return (
    <div className="comp-tabs">
      <div className="comp-tabs-row" role="tablist" aria-label="Competition">
        {TOP.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={top === tab.id} className={top === tab.id ? 'active' : undefined} onClick={() => onChange(tab.id)}>{tab.label}</button>)}
      </div>
      {inCups && <div className="comp-tabs-row comp-tabs-sub" role="tablist" aria-label="Cup">
        <button type="button" role="tab" aria-selected={value === 'cups'} className={value === 'cups' ? 'active' : undefined} onClick={() => onChange('cups')}>All cups</button>
        {CUPS.map((cup) => <button key={cup.id} type="button" role="tab" aria-selected={value === cup.id} className={value === cup.id ? 'active' : undefined} onClick={() => onChange(cup.id)}>{cup.name}</button>)}
      </div>}
    </div>
  )
}
