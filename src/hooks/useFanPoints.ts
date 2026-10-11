import { useAuth } from '../auth/AuthContext'
import type { FanPointsRow } from '../utils/leaderboardCalc'
import { useMyDoc } from './useCounts'

type Mine = FanPointsRow & { totalFans?: number }

/** The signed-in fan's points (calculated by the club after matches, votes and polls). */
export function useMyFanPoints() {
  const { user } = useAuth()
  return useMyDoc<Mine>(user ? ['fanPoints', user.uid] : null)
}

