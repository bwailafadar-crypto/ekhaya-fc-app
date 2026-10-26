import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { Landmark, Pencil, Star, Trophy } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'
import TeamLogo from '../components/TeamLogo'
import { useToast } from '../components/ToastContext'
import { Button, Card, PageHeader } from '../components/UI'
import { db } from '../firebase'
import { useFirestoreCollection } from '../hooks/useFirestoreCollection'
import type { Fixture } from '../types'
import { competitionLabel, competitionOf } from '../utils/competitions'
import { isEkhaya, TROPHY_PHOTOS } from '../utils/cupSeason'
import { ekhayaOutcome } from '../utils/football'

type Honour = { title: string; year: string; note?: string }
type Legend = { name: string; note?: string }
type ClubInfo = { founded?: string; ground?: string; nickname?: string; story?: string; honours?: Honour[]; legends?: Legend[] }

/** Cup finals Ekhaya won, straight from the results (nothing typed twice). */
function wonFinals(fixtures: Fixture[]): Array<Honour & { photo?: { src: string; caption: string } }> {
  return fixtures
    .filter((fixture) => !fixture.isTest && fixture.status === 'finished' && /^final$/i.test(fixture.round ?? '') && (isEkhaya(fixture.home) || isEkhaya(fixture.away))
      && (ekhayaOutcome(fixture) === 'W' || /ekhaya (won|win)/i.test(fixture.note ?? '')))
    .map((fixture) => {
      const year = fixture.season ?? fixture.date.slice(0, 4)
      return { title: competitionLabel(fixture.competition), year, note: `Final: ${fixture.home} ${fixture.homeScore ?? 0}–${fixture.awayScore ?? 0} ${fixture.away}`, photo: TROPHY_PHOTOS[`${competitionOf(fixture.competition).id}-${year}`] }
    })
    .sort((a, b) => b.year.localeCompare(a.year))
}

// "Title | Year | Note" per line — easy to type on a phone.
const toLines = (rows: Array<Record<string, string | undefined>>, keys: string[]) => rows.map((row) => keys.map((key) => row[key] ?? '').join(' | ').replace(/( \| )+$/, '')).join('\n')
const fromLines = (text: string, keys: string[]) => text.split('\n').map((line) => line.split('|').map((part) => part.trim())).filter((parts) => parts[0])
  .slice(0, 40).map((parts) => Object.fromEntries(keys.map((key, i) => [key, (parts[i] ?? '').slice(0, 160)]).filter(([, value]) => value)))

function EditClub({ info, onDone }: { info: ClubInfo; onDone: () => void }) {
  const { showToast } = useToast()
  const [busy, setBusy] = useState(false)
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const text = (name: string, max: number) => String(form.get(name) ?? '').trim().slice(0, max)
    setBusy(true)
    try {
      await setDoc(doc(db, 'clubInfo', 'history'), {
        founded: text('founded', 40), ground: text('ground', 80), nickname: text('nickname', 60), story: text('story', 4000),
        honours: fromLines(text('honours', 4000), ['title', 'year', 'note']), legends: fromLines(text('legends', 4000), ['name', 'note']),
        updatedAt: serverTimestamp(),
      })
      showToast('Club page saved.')
      onDone()
    } catch (error) { showToast(error instanceof Error ? `Not saved: ${error.message}` : 'Not saved.', 'error') } finally { setBusy(false) }
  }
  return <Card className="admin-card">
    <h2>Edit club page</h2>
    <form className="admin-form" onSubmit={(event) => void save(event)}>
      <div className="admin-form-grid">
        <label className="admin-field"><span>Founded (year)</span><input name="founded" defaultValue={info.founded ?? ''} placeholder="e.g. 2022" /></label>
        <label className="admin-field"><span>Nickname</span><input name="nickname" defaultValue={info.nickname ?? ''} /></label>
      </div>
      <label className="admin-field"><span>Home ground</span><input name="ground" defaultValue={info.ground ?? 'Chiwembe Stadium, Blantyre'} /></label>
      <label className="admin-field"><span>Our story</span><textarea name="story" rows={6} defaultValue={info.story ?? ''} placeholder="How the club started, key moments…" /></label>
      <label className="admin-field"><span>Other honours: one per line, "Title | Year | Note"</span><textarea name="honours" rows={4} defaultValue={toLines(info.honours ?? [], ['title', 'year', 'note'])} placeholder="Promotion to FDH Championship | 2024" /></label>
      <label className="admin-field"><span>Legends: one per line, "Name | Why"</span><textarea name="legends" rows={4} defaultValue={toLines(info.legends ?? [], ['name', 'note'])} placeholder="Name | First captain, 120 games" /></label>
      <p className="live-help">Cup finals Ekhaya win are added to the trophy cabinet automatically from the results.</p>
      <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save club page'}</Button>
    </form>
  </Card>
}

export default function Club() {
  const { role } = useAuth()
  const isAdmin = role === 'admin' || role === 'superadmin'
  const fixtures = useFirestoreCollection<Fixture>('fixtures')
  const [info, setInfo] = useState<ClubInfo | null>(null)
  const [editing, setEditing] = useState(false)
  useEffect(() => onSnapshot(doc(db, 'clubInfo', 'history'), (snap) => setInfo((snap.data() as ClubInfo | undefined) ?? {}), () => setInfo({})), [])
  const trophies = wonFinals(fixtures.items)
  const honours = info?.honours ?? []
  const legends = info?.legends ?? []

  return <>
    <PageHeader eyebrow="Our club" title="Club & honours" action={isAdmin ? <Button type="button" variant="secondary" icon={<Pencil size={15} />} onClick={() => setEditing((value) => !value)}>{editing ? 'Close' : 'Edit'}</Button> : undefined} />
    {editing && info && <EditClub info={info} onDone={() => setEditing(false)} />}
    <section className="club-hero">
      <TeamLogo name="Ekhaya FC" crest />
      <div><h2>Ekhaya FC</h2><span>{[info?.nickname, info?.founded ? `Founded ${info.founded}` : '', info?.ground || 'Chiwembe Stadium, Blantyre'].filter(Boolean).join(' · ')}</span></div>
    </section>

    <div className="matchday-section-title"><h2><Trophy size={18} aria-hidden="true" /> Trophy cabinet</h2><span>{trophies.length + honours.length || ''}</span></div>
    {trophies.length + honours.length === 0 ? <Card><p className="live-help">Trophies will appear here.</p></Card>
      : <div className="trophy-cabinet">
        {trophies.map((trophy) => <article key={`${trophy.title}-${trophy.year}`} className="trophy-item won">
          {trophy.photo ? <img src={trophy.photo.src} alt={trophy.photo.caption} loading="lazy" /> : <span className="trophy-icon">🏆</span>}
          <div><strong>{trophy.title}</strong><b>{trophy.year}</b>{trophy.note && <small>{trophy.note}</small>}</div>
        </article>)}
        {honours.map((honour, index) => <article key={index} className="trophy-item"><span className="trophy-icon">🏅</span><div><strong>{honour.title}</strong>{honour.year && <b>{honour.year}</b>}{honour.note && <small>{honour.note}</small>}</div></article>)}
      </div>}

    <div className="matchday-section-title"><h2><Landmark size={18} aria-hidden="true" /> Our story</h2></div>
    <Card className="club-story">{info?.story ? info.story.split(/\n{2,}/).map((para, index) => <p key={index}>{para}</p>) : <p className="live-help">{isAdmin ? 'Tap Edit to write the club\'s story.' : 'The club\'s story is coming soon.'}</p>}</Card>

    {legends.length > 0 && <>
      <div className="matchday-section-title"><h2><Star size={18} aria-hidden="true" /> Legends</h2></div>
      <ul className="club-legends">{legends.map((legend, index) => <li key={index}><strong>{legend.name}</strong>{legend.note && <span>{legend.note}</span>}</li>)}</ul>
    </>}
  </>
}
