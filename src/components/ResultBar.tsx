import { CheckCircle2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { percent } from '../utils/fanZone'

/** A single horizontal result bar, used by Fan Zone polls. */
export function ResultBar({ label, value, total, mine, leading }: { label: ReactNode; value: number; total: number; mine?: boolean; leading?: boolean }) {
  const share = percent(value, total)
  return (
    <div className={`fz-bar${mine ? ' fz-bar-mine' : ''}${leading ? ' fz-bar-leading' : ''}`}>
      <span className="fz-bar-fill" style={{ width: `${share}%` }} aria-hidden="true" />
      <span className="fz-bar-label">{label}{mine && <CheckCircle2 size={14} aria-label="Your vote" />}</span>
      <span className="fz-bar-value">{share}%</span>
    </div>
  )
}
