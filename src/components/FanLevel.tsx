import { Award, Crown } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useMyDoc } from '../hooks/useCounts'
import { useMyFanPoints } from '../hooks/useFanPoints'
import { FAN_POINTS, LEVELS, levelFor, POINTS_EXACT, POINTS_RESULT, type FanPointsRow } from '../utils/leaderboardCalc'
import { Card, Skeleton } from './UI'
import CountUp from './CountUp'

type Board = { rows?: Array<Omit<FanPointsRow, 'breakdown'>>; totalFans?: number }

/** Fan level, points and how to earn more (Fan Zone). */
export function FanLevelCard() {
  const { data: mine, loading } = useMyFanPoints()
  const points = mine?.points ?? 0
  const level = levelFor(points)
  const start = LEVELS[level.index].from
  const progress = level.next ? Math.min(100, Math.round((points - start) / (level.next.from - start) * 100)) : 100
  const b = mine?.breakdown
  return <Card className="fz-card fan-level-card">
    <div className="fan-level-top">
      <span className={`fan-level-badge level-${level.index}`}><Award size={22} aria-hidden="true" /></span>
      <div><small>Your fan level</small><strong>{level.name}</strong><span>{loading ? '…' : <><CountUp value={points} /> point{points === 1 ? '' : 's'}{mine?.rank ? ` · #${mine.rank} of ${mine.totalFans ?? '?'} fan${mine.totalFans === 1 ? '' : 's'}` : ''}</>}</span></div>
    </div>
    <div className="fan-level-bar" aria-label={level.next ? `${progress}% of the way to ${level.next.name}` : 'Top level reached'}><i style={{ width: `${progress}%` }} /></div>
    <p className="fz-note">{level.next ? `${level.next.from - points} more point${level.next.from - points === 1 ? '' : 's'} to ${level.next.name}` : 'You reached the top level. Ekhaya legend!'}</p>
    {b && <ul className="fan-level-breakdown">
      <li><span>Predictions</span><b>{b.predictions}</b></li>
      <li><span>MOTM votes</span><b>{b.motmVotes * FAN_POINTS.motmVote}</b></li>
      <li><span>Poll votes</span><b>{b.pollVotes * FAN_POINTS.pollVote}</b></li>
      <li><span>Friends invited</span><b>{b.invites * FAN_POINTS.invite}</b></li>
    </ul>}
    <details className="fan-level-how"><summary>How to earn points</summary><ul>
      <li>Invite a friend who joins: <b>{FAN_POINTS.invite}</b></li>
      <li>Exact score prediction: <b>{POINTS_EXACT}</b> · right result: <b>{POINTS_RESULT}</b></li>
      <li>Vote for man of the match: <b>{FAN_POINTS.motmVote}</b></li>
      <li>Vote in a poll: <b>{FAN_POINTS.pollVote}</b></li>
    </ul><p className="fz-note">Levels: {LEVELS.map((item) => `${item.name} ${item.from}+`).join(' · ')}. Points are added after each match, when man of the match voting closes, and every few hours.</p></details>
  </Card>
}

/** Fans of the season: everyone's points together. */
export function FansBoard() {
  const { user } = useAuth()
  const { data, loading } = useMyDoc<Board>(['leaderboard', 'fans'])
  const rows = data?.rows ?? []
  return <Card className="fz-card">
    <div className="fz-card-heading"><Crown size={18} aria-hidden="true" /><div><h2>Fans of the season</h2><span>{data?.totalFans ? `${data.totalFans} fan${data.totalFans === 1 ? '' : 's'} with points` : 'Points for everything you do for the club'}</span></div></div>
    {loading ? <Skeleton className="fz-board-skeleton" /> : !rows.length ? <p className="fz-note">No points yet. Predict the next match or vote in a poll to start.</p>
      : <ol className="fz-board">{rows.slice(0, 10).map((row) => <li key={row.uid} className={row.uid === user?.uid ? 'mine' : undefined}>
          <span className="fz-board-rank">{row.rank <= 3 ? ['🥇', '🥈', '🥉'][row.rank - 1] : row.rank}</span>
          <span className="fz-board-name">{row.name}{row.uid === user?.uid && <em> (you)</em>}<small>{row.level}</small></span>
          <strong className="fz-board-points">{row.points}</strong>
        </li>)}</ol>}
  </Card>
}

/** Small level chip (profile and member card). */
export function FanLevelChip() {
  const { data: mine } = useMyFanPoints()
  const level = levelFor(mine?.points ?? 0)
  return <span className={`fan-level-chip level-${level.index}`}><Award size={12} aria-hidden="true" />{level.name} · {mine?.points ?? 0} pts</span>
}
