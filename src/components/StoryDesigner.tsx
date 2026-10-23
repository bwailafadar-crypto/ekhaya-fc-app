// "Club poster" stories: pick a design and a match, the app draws a poster in
// the club's gold style (crests, kick-off, venue, line-up, scorer...). Post it
// as a story, or save the picture for WhatsApp and Facebook.
import { Download, ImagePlus, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTeams } from '../data/TeamContext'
import { useFirestoreCollection } from '../hooks/useFirestoreCollection'
import { useLiveDocs } from '../hooks/useLiveDocs'
import type { Fixture, MatchEvent, Player } from '../types'
import { formatMalawiDate, sortByDate } from '../utils/football'
import { DESIGNS, drawDesign, H, loadDesignFonts, loadImage, W, type DesignKind } from '../utils/storyDesign'
import { STORY_LINKS, type StoryLabel } from '../utils/stories'
import { Button } from './UI'

const isClub = (name: string) => /ekhaya/i.test(name)
const slug = (name: string) => name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** The design that fits the match right now. */
function suggested(fixture: Fixture | undefined): DesignKind {
  if (!fixture) return 'matchday'
  if (fixture.status === 'finished') return 'fulltime'
  if (fixture.status === 'live') return fixture.period === 'half-time' ? 'halftime' : 'goal'
  return fixture.lineupConfirmed ? 'lineup' : 'matchday'
}

export default function StoryDesigner({ fixtures, busy, onPost }: { fixtures: Fixture[]; busy: boolean; onPost: (image: File, label: StoryLabel, path: string) => Promise<boolean> }) {
  const { teams } = useTeams()
  const players = useFirestoreCollection<Player>('players').items
  // Ekhaya matches around today: live first, then the next ones, then the latest results.
  const matches = useMemo(() => {
    const club = fixtures.filter((fixture) => !fixture.isTest && (isClub(fixture.home) || isClub(fixture.away)))
    const live = club.filter((fixture) => fixture.status === 'live')
    const next = sortByDate(club.filter((fixture) => fixture.status === 'upcoming'), 'asc').slice(0, 4)
    const done = sortByDate(club.filter((fixture) => fixture.status === 'finished'), 'desc').slice(0, 4)
    return [...live, ...next, ...done]
  }, [fixtures])
  const [fixtureId, setFixtureId] = useState('')
  const fixture = matches.find((item) => item.id === fixtureId) ?? matches[0]
  const [chosenKind, setKind] = useState<DesignKind | null>(null)
  const kind = chosenKind ?? suggested(fixture)
  const events = useLiveDocs<Omit<MatchEvent, 'id'>>(fixture ? ['fixtures', fixture.id, 'events'] : null).items as MatchEvent[]
  const goals = events.filter((event) => event.kind === 'goal' && isClub(event.team)).sort((a, b) => b.minute - a.minute)
  const [goalId, setGoalId] = useState('')
  const goal = goals.find((event) => event.id === goalId) ?? goals[0] ?? null
  const squad = players.filter((player) => player.team === 'senior').sort((a, b) => a.name.localeCompare(b.name))
  const [playerId, setPlayerId] = useState('')
  // Featured player: the one chosen, else the scorer (goal design), else none.
  const featured = squad.find((player) => player.id === playerId) ?? (kind === 'goal' && goal?.playerId ? squad.find((player) => player.id === goal.playerId) : undefined)
  const [upload, setUpload] = useState<{ url: string; name: string } | null>(null)
  const [headline, setHeadline] = useState('')
  const [path, setPath] = useState('/live')
  const [ready, setReady] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => { void loadDesignFonts().then(() => setReady(true)) }, [])
  useEffect(() => () => { if (upload) URL.revokeObjectURL(upload.url) }, [upload])

  const crestSrc = (name: string) => {
    const key = name.trim().toLowerCase()
    const team = teams.find((item) => item.name.toLowerCase() === key || item.shortName?.toLowerCase() === key)
    if (team?.logoDataUrl) return team.logoDataUrl
    return isClub(name) ? './team-logos/ekhaya-fc.png' : `./team-logos/${slug(name.replace(/\bfc\b/i, ''))}.png`
  }

  // Redraw whenever anything changes.
  const goalKey = goal ? `${goal.id}${goal.minute}${goal.playerName}` : ''
  useEffect(() => {
    if (!ready || !fixture || !canvas.current) return
    let active = true
    const ctx = canvas.current.getContext('2d')
    if (!ctx) return
    void Promise.all([loadImage(crestSrc(fixture.home)), loadImage(crestSrc(fixture.away)), loadImage(upload?.url ?? featured?.photoDataUrl ?? null)]).then(([homeCrest, awayCrest, photo]) => {
      if (!active) return
      drawDesign(ctx, { kind, fixture, homeCrest, awayCrest, photo, players, events, goal, headline })
    })
    return () => { active = false }
    // crestSrc depends on teams only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, fixture, kind, upload, featured?.id, featured?.photoDataUrl, players.length, events.length, goalKey, headline, teams])

  function toFile(): Promise<File | null> {
    return new Promise((resolve) => {
      if (!canvas.current) { resolve(null); return }
      canvas.current.toBlob((blob) => resolve(blob ? new File([blob], `ekhaya-${kind}.jpg`, { type: 'image/jpeg' }) : null), 'image/jpeg', 0.9)
    })
  }

  async function save() {
    const file = await toFile()
    if (!file) return
    // Phones: share sheet (WhatsApp, Facebook, gallery). Computers: download.
    const shareable = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })
    if (shareable) { try { await navigator.share({ files: [file], title: 'Ekhaya FC' }); return } catch (error) { if ((error as { name?: string }).name === 'AbortError') return } }
    const link = document.createElement('a')
    link.href = URL.createObjectURL(file); link.download = file.name; link.click()
    window.setTimeout(() => URL.revokeObjectURL(link.href), 4000)
  }

  async function post() {
    const file = await toFile()
    if (!file) return
    const label = DESIGNS.find((item) => item.kind === kind)?.story ?? 'Match day'
    await onPost(file, label, path || (fixture ? `/live?match=${fixture.id}` : ''))
  }

  if (!matches.length) return <p className="story-design-empty">Add Ekhaya's fixtures first: posters are made from a match.</p>

  return <div className="story-design">
    <div className="story-design-kinds" role="radiogroup" aria-label="Design">
      {DESIGNS.map((item) => <button type="button" key={item.kind} role="radio" aria-checked={kind === item.kind} className={kind === item.kind ? 'active' : ''} onClick={() => setKind(item.kind)}>{item.label}</button>)}
    </div>
    <div className="story-design-preview">
      <canvas ref={canvas} width={W} height={H} aria-label="Poster preview" />
      {!ready && <span className="story-design-loading">Preparing…</span>}
    </div>
    <div className="admin-form-grid">
      <label className="admin-field"><span>Match</span><select value={fixture?.id ?? ''} onChange={(event) => { setFixtureId(event.target.value); setKind(null); setGoalId('') }}>
        {matches.map((item) => <option key={item.id} value={item.id}>{item.status === 'live' ? 'LIVE · ' : ''}{item.home} v {item.away} · {formatMalawiDate(item.date)}</option>)}
      </select></label>
      {kind === 'goal' && <label className="admin-field"><span>Goal</span><select value={goal?.id ?? ''} onChange={(event) => setGoalId(event.target.value)}>
        {goals.length ? goals.map((item) => <option key={item.id} value={item.id}>{item.minute}' {item.playerName || 'Goal'}</option>) : <option value="">No Ekhaya goal yet</option>}
      </select></label>}
    </div>
    {kind !== 'lineup' && <div className="story-design-photo">
      <label className="admin-field"><span>Player photo</span><select value={playerId} onChange={(event) => { setPlayerId(event.target.value); setUpload(null) }}>
        <option value="">{kind === 'goal' ? 'The scorer' : 'No player'}</option>
        {squad.map((player) => <option key={player.id} value={player.id}>{player.name}{player.photoDataUrl ? '' : ' (no photo)'}</option>)}
      </select></label>
      <label className="story-design-upload">
        <input type="file" accept="image/*" onChange={(event) => { const chosen = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (chosen) setUpload({ url: URL.createObjectURL(chosen), name: chosen.name }) }} />
        <ImagePlus size={16} aria-hidden="true" /> {upload ? 'Change photo' : 'Use a big photo'}
      </label>
      {upload && <button type="button" className="story-design-clear" onClick={() => setUpload(null)}><X size={14} aria-hidden="true" /> {upload.name.slice(0, 24)}</button>}
    </div>}
    <div className="admin-form-grid">
      {kind !== 'lineup' && <label className="admin-field"><span>Big title (optional)</span><input value={headline} maxLength={20} placeholder={kind === 'matchday' ? 'MATCH DAY' : kind === 'goal' ? 'GOAL!' : kind === 'halftime' ? 'HALF TIME' : 'FULL TIME'} onChange={(event) => setHeadline(event.target.value)} /></label>}
      <label className="admin-field"><span>Open button</span><select value={path} onChange={(event) => setPath(event.target.value)}>{STORY_LINKS.map((link) => <option key={link.path} value={link.path}>{link.label}</option>)}</select></label>
    </div>
    <p className="live-help">A big photo from your phone looks best (player photos in the squad are small). The poster uses the match's time and stadium: fix them in Admin → Fixtures if they're wrong.</p>
    <div className="story-design-actions">
      <Button type="button" disabled={busy || !ready} onClick={() => void post()}>{busy ? 'Posting…' : 'Post story (24 hours)'}</Button>
      <button type="button" className="story-design-save" disabled={!ready} onClick={() => void save()}><Download size={16} aria-hidden="true" /> Save / share picture</button>
    </div>
  </div>
}
