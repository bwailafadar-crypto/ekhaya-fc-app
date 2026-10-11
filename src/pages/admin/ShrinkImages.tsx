import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { Gauge } from 'lucide-react'
import { useState } from 'react'
import { useToast } from '../../components/ToastContext'
import { Button, Card } from '../../components/UI'
import { db } from '../../firebase'
import type { Player, Team } from '../../types'
import { dataUrlBytes, IMAGE_SIZES, shrinkDataUrl } from '../../utils/compressImage'

const kb = (bytes: number) => `${Math.round(bytes / 1024).toLocaleString()} KB`

/**
 * Re-saves team logos and player photos at fan-friendly sizes. Fans download
 * every logo on each visit, so big logos make the app slow on mobile data.
 */
export default function ShrinkImages({ teams, players }: { teams: Team[]; players: Player[] }) {
  const { showToast } = useToast()
  const [progress, setProgress] = useState('')
  const logoBytes = teams.reduce((sum, team) => sum + dataUrlBytes(team.logoDataUrl), 0)
  const photoBytes = players.reduce((sum, player) => sum + dataUrlBytes(player.photoDataUrl), 0)
  const bigLogos = teams.filter((team) => dataUrlBytes(team.logoDataUrl) > IMAGE_SIZES.logo.maxBytes * 1.2)
  const bigPhotos = players.filter((player) => dataUrlBytes(player.photoDataUrl) > IMAGE_SIZES.player.maxBytes * 1.2)
  const todo = bigLogos.length + bigPhotos.length

  async function run() {
    let done = 0
    let saved = 0
    let failed = 0
    for (const team of bigLogos) {
      setProgress(`Making logos smaller… ${done + 1} of ${todo}`)
      try {
        const small = await shrinkDataUrl(team.logoDataUrl ?? '', IMAGE_SIZES.logo)
        saved += dataUrlBytes(team.logoDataUrl) - dataUrlBytes(small)
        await updateDoc(doc(db, 'teams', team.id), { logoDataUrl: small, updatedAt: serverTimestamp() })
      } catch { failed += 1 }
      done += 1
    }
    for (const player of bigPhotos) {
      setProgress(`Making player photos smaller… ${done + 1} of ${todo}`)
      try {
        const small = await shrinkDataUrl(player.photoDataUrl ?? '', IMAGE_SIZES.player)
        saved += dataUrlBytes(player.photoDataUrl) - dataUrlBytes(small)
        await updateDoc(doc(db, 'players', player.id), { photoDataUrl: small, updatedAt: serverTimestamp() })
      } catch { failed += 1 }
      done += 1
    }
    setProgress('')
    showToast(`Done: ${kb(saved)} less for every fan to download${failed ? ` (${failed} image${failed === 1 ? '' : 's'} could not be changed)` : ''}.`, failed ? 'error' : 'success')
  }

  return <Card className="admin-card shrink-images">
    <div className="sq-head"><Gauge size={18} aria-hidden="true" /><div><h2>App speed: image sizes</h2><span>Logos {kb(logoBytes)} · player photos {kb(photoBytes)}</span></div></div>
    {todo
      ? <><p className="live-help">{bigLogos.length} logo{bigLogos.length === 1 ? '' : 's'} and {bigPhotos.length} player photo{bigPhotos.length === 1 ? '' : 's'} are bigger than they need to be. Fans download them on mobile data, so making them smaller makes the app faster and cheaper. They will look the same in the app.</p>
        <Button type="button" disabled={Boolean(progress)} onClick={() => void run()}>{progress || `Make ${todo} image${todo === 1 ? '' : 's'} smaller`}</Button></>
      : <p className="live-help">✔ All logos and player photos are already small.</p>}
  </Card>
}
