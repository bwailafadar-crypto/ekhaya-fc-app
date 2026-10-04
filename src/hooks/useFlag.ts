import { useSyncExternalStore } from 'react'
import { flagValue, getFlags, subscribeFlags, type FlagName } from '../data/flags'

/** Whether a feature is switched on (falls back to its default until loaded). */
export function useFlag(name: FlagName) {
  const state = useSyncExternalStore(subscribeFlags, getFlags)
  return flagValue(state, name)
}

/** Club-wide notice set in Admin → App health (empty when none). */
export function useNotice() {
  return useSyncExternalStore(subscribeFlags, getFlags).notice
}
