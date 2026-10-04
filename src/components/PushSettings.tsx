import { BellOff, BellRing } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { DEFAULT_PREFS, disablePush, enablePush, pushSupport, savedPrefs, savedToken, updatePushPrefs, type PushPrefs, type PushSupport } from '../utils/push'
import { useToast } from './ToastContext'
import { Button, Card } from './UI'

const reasons: Record<Exclude<PushSupport, 'ok'>, string> = {
  'no-key': 'Alerts are being set up by the club. Check back soon.',
  apk: 'Alerts are not available in the Android download yet. Open ekhaya-fc-app.web.app in Chrome to turn them on.',
  'ios-install': 'On iPhone, first add the app to your Home Screen (Share → Add to Home Screen), then open it from there to turn on alerts.',
  unsupported: 'This browser cannot receive alerts. Try Chrome on Android or a computer.',
  blocked: 'Alerts are blocked for this site. Allow notifications in your browser settings, then come back here.',
}

function errorText(error: unknown) {
  const code = error instanceof Error ? error.message : ''
  if (code === 'blocked') return 'You blocked notifications. Allow them in your browser settings to turn on alerts.'
  if (code === 'dismissed') return 'Alerts were not turned on.'
  return 'Alerts could not be turned on. Check your connection and try again.'
}

/** Alert on/off switch with match and news choices. `compact` is the Fan Zone prompt. */
export default function PushSettings({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [support, setSupport] = useState<PushSupport | null>(null)
  const [enabled, setEnabled] = useState(() => Boolean(savedToken()))
  const [prefs, setPrefs] = useState<PushPrefs>(savedPrefs)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    void pushSupport().then((result) => { if (active) setSupport(result) })
    return () => { active = false }
  }, [])

  if (support === null) return null
  if (compact && (enabled || support !== 'ok')) return null

  async function turnOn() {
    if (!user) return
    setBusy(true)
    try {
      await enablePush(user.uid, prefs.match || prefs.news ? prefs : DEFAULT_PREFS)
      setEnabled(true)
      showToast('Alerts are on. You will hear about goals and club news.')
    } catch (error) {
      showToast(errorText(error), 'error')
      void pushSupport().then(setSupport)
    } finally {
      setBusy(false)
    }
  }

  async function turnOff() {
    setBusy(true)
    try { await disablePush(); setEnabled(false); showToast('Alerts are off on this device.') } catch { showToast('Alerts could not be turned off.', 'error') } finally { setBusy(false) }
  }

  async function toggle(key: keyof PushPrefs) {
    const next = { ...prefs, [key]: !prefs[key] }
    setPrefs(next)
    try { await updatePushPrefs(next) } catch { showToast('Your choice was not saved.', 'error'); setPrefs(prefs) }
  }

  if (compact) {
    return <Card className="push-prompt">
      <BellRing size={20} aria-hidden="true" />
      <div><strong>Never miss a goal</strong><span>Get alerts for kick-off, goals and full time.</span></div>
      <Button type="button" disabled={busy} onClick={() => void turnOn()}>{busy ? 'Turning on...' : 'Turn on'}</Button>
    </Card>
  }

  return <Card className="push-settings">
    <div className="fz-card-heading">{enabled ? <BellRing size={18} aria-hidden="true" /> : <BellOff size={18} aria-hidden="true" />}<div><h2>Alerts</h2><span>{enabled ? 'On for this device' : 'Goals, kick-off and club news on your phone'}</span></div></div>
    {support !== 'ok' && !enabled ? <p className="fz-note">{reasons[support]}</p>
      : enabled ? <>
          <label className="push-toggle"><input type="checkbox" checked={prefs.match} onChange={() => void toggle('match')} /><span><strong>Match alerts</strong><small>Kick-off, goals, half-time and full time</small></span></label>
          <label className="push-toggle"><input type="checkbox" checked={prefs.news} onChange={() => void toggle('news')} /><span><strong>Club news</strong><small>When a new article is published</small></span></label>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => void turnOff()}>Turn off alerts on this device</Button>
        </>
      : <Button type="button" disabled={busy} onClick={() => void turnOn()}><BellRing size={15} aria-hidden="true" /> {busy ? 'Turning on...' : 'Turn on alerts'}</Button>}
  </Card>
}
