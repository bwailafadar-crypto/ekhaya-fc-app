import { Medal, Trophy } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { POINTS_EXACT, POINTS_RESULT, useLeaderboard } from '../hooks/useLeaderboard'
import { Card, Skeleton } from './UI'

const medals = ['🥇', '🥈', '🥉']

export default function Leaderboard() {
  const { user } = useAuth()
  const { rows, matches, loading, error } = useLeaderboard()
  const [expanded, setExpanded] = useState(false)
  const mine = rows.find((row) => row.uid === user?.uid)
  const visible = rows.slice(0, expanded ? 50 : 10)

  return (
    <Card className="fz-card">
      <div className="fz-card-heading"><Trophy size={18} aria-hidden="true" /><div><h2>Top fans</h2><span>Season prediction league · {matches} match{matches === 1 ? '' : 'es'}</span></div></div>
      {loading ? <Skeleton className="fz-board-skeleton" />
        : error ? <p className="fz-note">The leaderboard could not be loaded. Check your connection.</p>
        : rows.length === 0 ? <p className="fz-note"><Medal size={14} aria-hidden="true" /> No points yet. Predict the next match to get on the board.</p>
        : <>
            {mine && <p className="fz-result fz-result-win">You're #{mine.rank} of {rows.length} with {mine.points} pt{mine.points === 1 ? '' : 's'}</p>}
            <ol className="fz-board">
              {visible.map((row) => <li key={row.uid} className={row.uid === user?.uid ? 'mine' : undefined}>
                <span className="fz-board-rank">{row.rank <= 3 ? medals[row.rank - 1] : row.rank}</span>
                <span className="fz-board-name">{row.name}{row.uid === user?.uid && <em> (you)</em>}<small>{row.exact} exact · {row.results} result{row.results === 1 ? '' : 's'} · {row.played} played</small></span>
                <strong className="fz-board-points">{row.points}</strong>
              </li>)}
            </ol>
            {rows.length > 10 && <button type="button" className="fz-board-more" onClick={() => setExpanded((value) => !value)}>{expanded ? 'Show top 10' : `Show top ${Math.min(rows.length, 50)}`}</button>}
          </>}
      <p className="fz-note">Exact score {POINTS_EXACT} pts · right result {POINTS_RESULT} pt</p>
    </Card>
  )
}

/** Small badge for the profile page. */
export function LeaderboardBadge() {
  const { user } = useAuth()
  const { rows, loading } = useLeaderboard()
  if (loading) return null
  const mine = rows.find((row) => row.uid === user?.uid)
  return (
    <Link to="/fanzone" className="fz-badge">
      <Trophy size={18} aria-hidden="true" />
      {mine
        ? <span><strong>#{mine.rank} in the prediction league</strong><small>{mine.points} pts · {mine.exact} exact score{mine.exact === 1 ? '' : 's'}</small></span>
        : <span><strong>Join the prediction league</strong><small>Predict the next match in the Fan Zone</small></span>}
    </Link>
  )
}
