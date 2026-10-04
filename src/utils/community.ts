// Fan branches (by district) and invite links.
import { collection, doc, getCountFromServer, getDoc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore'
import { db } from '../firebase'

export const BRANCHES = [
  'Balaka', 'Blantyre', 'Chikwawa', 'Chiradzulu', 'Chitipa', 'Dedza', 'Dowa', 'Karonga', 'Kasungu', 'Likoma',
  'Lilongwe', 'Machinga', 'Mangochi', 'Mchinji', 'Mulanje', 'Mwanza', 'Mzimba / Mzuzu', 'Neno', 'Nkhata Bay',
  'Nkhotakota', 'Nsanje', 'Ntcheu', 'Ntchisi', 'Phalombe', 'Rumphi', 'Salima', 'Thyolo', 'Zomba', 'Outside Malawi',
].map((name) => ({ id: name.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, ''), name }))

export function branchName(id: string | null | undefined) {
  return BRANCHES.find((branch) => branch.id === id)?.name ?? ''
}

export type FanCard = { name: string; branch: string }
export type CommunityStats = {
  branches: Array<{ id: string; fans: number }>
  recruiters: Array<{ uid: string; name: string; count: number }>
  totalFans: number
  totalInvites: number
  updatedAt?: { toMillis?: () => number }
}

const INVITE_KEY = 'ekhaya-invite-ref'
const APP_URL = 'https://ekhaya-fc-app.web.app/'

function readLocal(key: string) { try { return localStorage.getItem(key) } catch { return null } }
function writeLocal(key: string, value: string | null) {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value) } catch { /* storage blocked */ }
}

/** Remembers who invited this visitor (from ...#/signup?ref=CODE), before any page loads. */
export function captureInviteCode() {
  const match = /[?&]ref=([A-Za-z0-9]{20,40})/.exec(window.location.hash || window.location.search)
  if (match) writeLocal(INVITE_KEY, match[1])
}

export function inviteLink(uid: string) {
  return `${APP_URL}#/signup?ref=${uid}`
}

export function inviteMessage(uid: string) {
  return `Join me on the official Ekhaya FC app ⚽ Live scores, goal alerts, predictions and polls. Create your free fan account here: ${inviteLink(uid)}`
}

/** Credits the friend who invited this fan. Runs once the fan's email is verified. */
export async function claimInvite(uid: string) {
  const by = readLocal(INVITE_KEY)
  if (!by) return
  if (by === uid) { writeLocal(INVITE_KEY, null); return }
  try {
    await setDoc(doc(db, 'referrals', uid), { by, createdAt: serverTimestamp() })
  } catch {
    // Already counted, an older account, or an unknown code: nothing to credit.
  }
  writeLocal(INVITE_KEY, null)
}

export function saveBranch(uid: string, name: string, branch: string) {
  return setDoc(doc(db, 'fanCards', uid), { name, branch, updatedAt: serverTimestamp() })
}

export const STATS_MAX_AGE = 30 * 60 * 1000

/** Admin-only: recounts branch sizes (about 1 read per branch) and the top recruiters. */
export async function refreshCommunityStats(force = true) {
  if (!force) {
    const lock = doc(db, 'alertsSent', `community-${Math.floor(Date.now() / STATS_MAX_AGE)}`)
    try { await setDoc(lock, { title: 'community', createdAt: serverTimestamp() }) } catch { return false }
  }
  const cards = collection(db, 'fanCards')
  const counts = await Promise.all(BRANCHES.map(async (branch) => ({
    id: branch.id,
    fans: (await getCountFromServer(query(cards, where('branch', '==', branch.id)))).data().count,
  })))
  const referrals = await getDocs(collection(db, 'referrals'))
  const byFan = new Map<string, number>()
  referrals.docs.forEach((item) => {
    const by = item.data().by
    if (typeof by === 'string') byFan.set(by, (byFan.get(by) ?? 0) + 1)
  })
  const top = [...byFan.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
  const recruiters = await Promise.all(top.map(async ([uid, count]) => {
    const card = await getDoc(doc(db, 'fanCards', uid)).catch(() => null)
    const name = card?.exists() && typeof card.data().name === 'string' ? card.data().name : 'Ekhaya fan'
    return { uid, name, count }
  }))
  await setDoc(doc(db, 'communityStats', 'current'), {
    branches: counts.filter((item) => item.fans > 0).sort((a, b) => b.fans - a.fans),
    recruiters,
    totalFans: counts.reduce((sum, item) => sum + item.fans, 0),
    totalInvites: referrals.size,
    updatedAt: serverTimestamp(),
  })
  return true
}
