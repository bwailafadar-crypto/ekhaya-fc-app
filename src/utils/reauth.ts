// "Confirm it's you" before dangerous actions (making admins, deleting
// accounts, payment numbers, switches, prices). The database rules also
// refuse these changes unless the account signed in within the last 30
// minutes, so a phone left unlocked can't be used to do damage.
import { auth } from '../firebase'

const RECENT_MS = 25 * 60_000
type Ask = (reason: string) => Promise<boolean>
let ask: Ask | null = null

/** Set by <ReauthHost/>, which shows the password box. */
export function registerReauth(fn: Ask | null) { ask = fn }

/** True when the user signed in recently, or confirmed their password / Google account now. */
export async function confirmIdentity(reason: string): Promise<boolean> {
  const user = auth.currentUser
  if (!user) return false
  try {
    const token = await user.getIdTokenResult()
    if (Date.now() - Date.parse(token.authTime) < RECENT_MS) return true
  } catch { /* ask below */ }
  if (!ask) return window.confirm(`${reason}\n\nPlease sign out and sign in again first, then try once more.`) && false
  const ok = await ask(reason)
  if (ok) await user.getIdToken(true).catch(() => undefined)
  return ok
}
