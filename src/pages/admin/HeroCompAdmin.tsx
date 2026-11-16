import { RefreshCw, Shirt } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { useToast } from '../../components/ToastContext'
import { Button, Card } from '../../components/UI'
import { useMyDoc } from '../../hooks/useCounts'
import type { HeroComp } from '../../types'
import { dispatchWorkflow } from '../../utils/githubAlerts'

/** Superadmin: view the Matchday Hero competition and score it on demand. */
export default function HeroCompAdmin() {
  const { role } = useAuth()
  const { showToast } = useToast()
  const comp = useMyDoc<HeroComp>(['heroComp', 'current'])
  const [busy, setBusy] = useState(false)
  if (role !== 'superadmin') return null

  const round = comp.data
  const ranked = Object.entries(round?.standings ?? {}).map(([uid, s]) => ({ uid, ...s })).sort((a, b) => b.points - a.points)
  const played = round?.countedFixtureIds?.length ?? 0

  async function scoreNow() {
    setBusy(true)
    try {
      await dispatchWorkflow('hero-comp.yml')
      showToast('Scoring started. The board updates in about a minute.')
    } catch (error) {
      const code = error instanceof Error ? error.message : ''
      showToast(code === 'no-key' ? 'Set the GitHub key in Push alerts first.' : code.startsWith('github-') ? 'GitHub refused the request. Check the key.' : 'Could not start scoring. Check your connection.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return <Card className="admin-card">
    <div className="fz-card-heading"><Shirt size={18} /><div><h2>Matchday Hero competition</h2><span>{round ? `Round ${round.roundNumber} · ${played} of ${round.matchesInRound ?? 5} matches scored · prize: ${round.prize ?? 'Ekhaya FC jersey'}` : 'No round yet — it starts after the first scored match.'}</span></div></div>
    <p className="fz-note">Scores by itself every hour after men's matches: ⚽ goal +5, 👟 assist +3. The top fan after 5 matches wins the jersey, then a new round starts.</p>
    {ranked.length > 0
      ? <div className="mh-board mh-board-admin">
          {ranked.map((row, index) => <div key={row.uid} className="mh-row"><span className="mh-rank">{index + 1}</span><span className="mh-row-name">{row.name}</span><span className="mh-row-pts">{row.points}</span></div>)}
        </div>
      : <p className="fz-note">No points scored in this round yet.</p>}
    <Button type="button" variant="secondary" disabled={busy} onClick={() => void scoreNow()}><RefreshCw size={15} /> Score now</Button>
  </Card>
}
