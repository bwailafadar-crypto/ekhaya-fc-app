// Asks GitHub Actions to send a push alert (free; no Firebase Blaze plan needed).
// The GitHub key is stored in Firestore adminConfig/github, readable only by admins.
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { logAction } from './audit'
import { confirmIdentity } from './reauth'

export const GITHUB_REPO = 'bwailafadar-crypto/ekhaya-fc-app'
const WORKFLOW = 'send-alert.yml'

let cachedKey: string | null | undefined

export async function githubKey(force = false) {
  if (cachedKey !== undefined && !force) return cachedKey
  try {
    const snapshot = await getDoc(doc(db, 'adminConfig', 'github'))
    const value = snapshot.data()?.token
    cachedKey = typeof value === 'string' && value.trim() ? value.trim() : null
  } catch {
    cachedKey = null
  }
  return cachedKey
}

export async function saveGithubKey(token: string) {
  if (!(await confirmIdentity('The GitHub key controls alerts and app updates.'))) throw new Error('cancelled')
  await setDoc(doc(db, 'adminConfig', 'github'), { token: token.trim(), updatedAt: serverTimestamp() })
  cachedKey = token.trim() || null
  void logAction('Changed the GitHub alerts key', token.trim() ? 'new key saved' : 'key removed')
}

export async function dispatchAlert(alert: { kind: 'match' | 'news' | 'test' | 'player' | 'broadcast'; title: string; body: string; path: string; player?: string }) {
  const token = await githubKey()
  if (!token) throw new Error('no-key')
  const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: 'master', inputs: { kind: alert.kind, title: alert.title.slice(0, 120), body: alert.body.slice(0, 240), path: alert.path, ...(alert.player ? { player: alert.player } : {}) } }),
  })
  if (response.status !== 204) {
    if (response.status === 401 || response.status === 403 || response.status === 404) cachedKey = undefined
    throw new Error(`github-${response.status}`)
  }
}

/** Starts any GitHub Actions job that needs no inputs (e.g. the YouTube sync). */
export async function dispatchWorkflow(workflow: string) {
  const token = await githubKey()
  if (!token) throw new Error('no-key')
  const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${workflow}/dispatches`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: 'master' }),
  })
  if (response.status !== 204) throw new Error(`github-${response.status}`)
}
