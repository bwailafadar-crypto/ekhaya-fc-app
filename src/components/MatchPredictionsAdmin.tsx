import { collection, getDocs } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { db } from '../firebase'
import type { Pick, Player } from '../types'
import { Card } from './UI'

type Row = Pick & { uid: string }

/** Superadmin: every fan prediction for one match, so the club can see who entered. */
export default function MatchPredictionsAdmin({ fixtureId, home, away, players }: { fixtureId: string; home: string; away: string; players: Player[] }) {
  // Keyed by fixtureId so switching matches shows loading until the new rows land,
  // without a synchronous state reset inside the effect.
  const [loaded, setLoaded] = useState<{ id: string; rows: Row[] } | null>(null)
  const [failed, setFailed] = useState('')

  useEffect(() => {
    let active = true
    getDocs(collection(db, 'fixtures', fixtureId, 'picks'))
      .then((snap) => { if (active) setLoaded({ id: fixtureId, rows: snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Pick) })) }) })
      .catch(() => { if (active) setFailed(fixtureId) })
    return () => { active = false }
  }, [fixtureId])

  const rows = loaded && loaded.id === fixtureId ? loaded.rows : null
  const error = failed === fixtureId

  const playerName = (id?: string) => players.find((p) => p.id === id)?.name ?? 'a player'
  const describe = (r: Row) =>
    r.type === 'score' ? `${home} ${r.home}–${r.away} ${away}`
      : r.type === 'scorer' ? `${playerName(r.playerId)} to score`
        : `${playerName(r.playerId)} — Man of the Match`
  const kindLabel = (t: Pick['type']) => (t === 'score' ? 'Score' : t === 'scorer' ? 'Goalscorer' : 'MOTM')

  return (
    <Card className="admin-card">
      <div className="matchday-admin-heading"><h2>Fan predictions</h2><span>{rows ? `${rows.length} entered` : 'Loading…'}</span></div>
      {error ? <p className="live-help">Could not load predictions. Try again.</p>
        : !rows ? <p className="live-help">Loading predictions…</p>
          : rows.length === 0 ? <p className="live-help">No fans have predicted this match yet.</p>
            : <ul className="pred-admin-list">
                {rows.map((r) => (
                  <li key={r.uid}>
                    <span className="pred-admin-name">{r.name || 'Fan'}</span>
                    <span className="pred-admin-kind">{kindLabel(r.type)}</span>
                    <span className="pred-admin-val">{describe(r)}</span>
                  </li>
                ))}
              </ul>}
    </Card>
  )
}
