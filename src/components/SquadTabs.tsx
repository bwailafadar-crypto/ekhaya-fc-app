// Men's / Women's toggle shown at the top of Squad, Fixtures and the League
// table. Same tab style as Ekhaya TV.
import type { Squad } from '../hooks/useSquad'

export default function SquadTabs({ value, onChange }: { value: Squad; onChange: (next: Squad) => void }) {
  return (
    <div className="tv-teams" role="tablist" aria-label="Team">
      <button type="button" role="tab" aria-selected={value === 'men'} className={value === 'men' ? 'active' : ''} onClick={() => onChange('men')}>Men's</button>
      <button type="button" role="tab" aria-selected={value === 'women'} className={value === 'women' ? 'active' : ''} onClick={() => onChange('women')}>Women's</button>
    </div>
  )
}
