import { BellRing, KeyRound, Send } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { useToast } from '../../components/ToastContext'
import { Button, Card } from '../../components/UI'
import { dispatchAlert, GITHUB_REPO, githubKey, saveGithubKey } from '../../utils/githubAlerts'

/** Superadmin card: store the GitHub key used to send free push alerts, and send a test. */
export default function AlertsSetup() {
  const { role } = useAuth()
  const { showToast } = useToast()
  const [hasKey, setHasKey] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const isSuperadmin = role === 'superadmin'

  useEffect(() => {
    let active = true
    void githubKey(true).then((key) => { if (active) setHasKey(Boolean(key)) })
    return () => { active = false }
  }, [])

  if (!isSuperadmin) return null

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const token = String(new FormData(form).get('token') ?? '').trim()
    // Only fine-grained keys (limited to this one repository) are accepted;
    // classic ghp_ keys can control every repository and are refused.
    if (!/^github_pat_[A-Za-z0-9_]{20,}$/.test(token)) { showToast('Use a fine-grained GitHub key (it starts with github_pat_). Classic keys are not accepted for safety.', 'error'); return }
    setBusy(true)
    try { await saveGithubKey(token); form.reset(); setHasKey(true); showToast('GitHub key saved. Send a test alert to check it.') } catch { showToast('The key was not saved.', 'error') } finally { setBusy(false) }
  }

  async function test() {
    setBusy(true)
    try {
      await dispatchAlert({ kind: 'test', title: 'Ekhaya FC test alert', body: 'Alerts are working. Up the Ekhaya!', path: '/' })
      showToast('Test sent. Phones with alerts on should get it within about a minute.')
    } catch (error) {
      const code = error instanceof Error ? error.message : ''
      showToast(code === 'github-401' || code === 'github-403' ? 'GitHub refused the key. Check it has Actions: Read and write for ekhaya-fc-app.' : code === 'github-404' ? 'GitHub could not find the Send alert workflow. Push update 29 first.' : 'The test alert could not be sent. Check your connection.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return <Card className="admin-card">
    <div className="fz-card-heading"><BellRing size={18} /><div><h2>Push alerts</h2><span>{hasKey === null ? 'Checking…' : hasKey ? 'Set up. Alerts go out automatically.' : 'Not set up yet'}</span></div></div>
    <p className="fz-note">Free alerts are sent by GitHub. Paste a GitHub key that can only run actions on <strong>{GITHUB_REPO}</strong>.</p>
    <form className="admin-form" onSubmit={save}>
      <label className="admin-field"><span>{hasKey ? 'Replace GitHub key' : 'GitHub key'}</span><input name="token" type="password" autoComplete="off" placeholder="github_pat_…" required /></label>
      <Button type="submit" variant="secondary" disabled={busy}><KeyRound size={15} /> Save key</Button>
    </form>
    {hasKey && <Button type="button" disabled={busy} onClick={() => void test()}><Send size={15} /> Send test alert</Button>}
  </Card>
}
