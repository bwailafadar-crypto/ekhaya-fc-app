import { useState, type FormEvent, type ChangeEvent } from 'react'
import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { CalendarDays, ImagePlus, ShieldCheck, Table2, Users } from 'lucide-react'
import { db } from '../firebase'
import { useToast } from '../components/ToastContext'
import { Button, Card, EmptyState, PageHeader, Skeleton } from '../components/UI'
import { useFirestoreCollection } from '../hooks/useFirestoreCollection'
import { compressImage } from '../utils/compressImage'
import type { Fixture, Player, PlayerStats, Standing, Team } from '../types'

type Section = 'players' | 'teams' | 'standings' | 'fixtures'
const sections: Array<{ key: Section; label: string; icon: typeof Users }> = [
  { key: 'players', label: 'Players', icon: Users },
  { key: 'teams', label: 'Teams', icon: ShieldCheck },
  { key: 'standings', label: 'Table', icon: Table2 },
  { key: 'fixtures', label: 'Fixtures', icon: CalendarDays },
]

const emptyStats: PlayerStats = {
  appearances: 0, starts: 0, minutes: 0, goals: 0, assists: 0,
  yellowCards: 0, redCards: 0, cleanSheets: 0,
}

function documentId(name: string) {
  const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `${slug || 'club-item'}-${Date.now().toString(36)}`
}

function numberValue(value: FormDataEntryValue | null, nullable = false) {
  if (value == null || value === '') return nullable ? null : 0
  const number = Number(value)
  return Number.isFinite(number) ? number : nullable ? null : 0
}

function Field({
  label,
  name,
  type = 'text',
  defaultValue,
  required = false,
  min,
  max,
}: {
  label: string
  name: string
  type?: string
  defaultValue?: string | number | null
  required?: boolean
  min?: number
  max?: number
}) {
  return <label className="admin-field"><span>{label}</span><input name={name} type={type} defaultValue={defaultValue ?? ''} required={required} min={min} max={max} /></label>
}

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : 'Could not save this change. Check your connection and try again.'
}

export default function AdminPanel() {
  const [section, setSection] = useState<Section>('players')
  const [selectedPlayerId, setSelectedPlayerId] = useState('')
  const [selectedTeamId, setSelectedTeamId] = useState('')
  const [selectedStandingId, setSelectedStandingId] = useState('')
  const [selectedFixtureId, setSelectedFixtureId] = useState('')
  const [playerPhotoDraft, setPlayerPhotoDraft] = useState<{ id: string; dataUrl: string | null } | null>(null)
  const [teamLogoDraft, setTeamLogoDraft] = useState<{ id: string; dataUrl: string | null } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const { showToast } = useToast()
  const players = useFirestoreCollection<Player>('players')
  const teams = useFirestoreCollection<Team>('teams')
  const standings = useFirestoreCollection<Standing>('standings')
  const fixtures = useFirestoreCollection<Fixture>('fixtures')
  const selectedPlayer = players.items.find((item) => item.id === selectedPlayerId)
  const selectedTeam = teams.items.find((item) => item.id === selectedTeamId)
    ?? (selectedTeamId ? undefined : teams.items[0])
  const selectedStanding = standings.items.find((item) => item.id === selectedStandingId)
  const selectedFixture = fixtures.items.find((item) => item.id === selectedFixtureId)
  const playerPhotoId = selectedPlayer?.id ?? ''
  const teamLogoId = selectedTeam?.id ?? ''
  const playerPhoto = playerPhotoDraft?.id === playerPhotoId ? playerPhotoDraft.dataUrl : selectedPlayer?.photoDataUrl ?? null
  const teamLogo = teamLogoDraft?.id === teamLogoId ? teamLogoDraft.dataUrl : selectedTeam?.logoDataUrl ?? null
  const setPlayerPhoto = (dataUrl: string | null) => setPlayerPhotoDraft({ id: playerPhotoId, dataUrl })
  const setTeamLogo = (dataUrl: string | null) => setTeamLogoDraft({ id: teamLogoId, dataUrl })

  async function handleImage(event: ChangeEvent<HTMLInputElement>, setImage: (value: string | null) => void) {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      setImage(await compressImage(file))
      showToast('Image ready to save.')
    } catch (error) {
      showToast(messageFrom(error), 'error')
    } finally {
      setUploading(false)
      input.value = ''
    }
  }

  async function savePlayer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (uploading) return
    setSaving(true)
    const form = new FormData(event.currentTarget)
    const name = String(form.get('name') ?? '').trim()
    const id = selectedPlayer?.id ?? documentId(name)
    const stats: PlayerStats = {
      appearances: numberValue(form.get('appearances')) ?? 0,
      starts: numberValue(form.get('starts')) ?? 0,
      minutes: numberValue(form.get('minutes')) ?? 0,
      goals: numberValue(form.get('goals')) ?? 0,
      assists: numberValue(form.get('assists')) ?? 0,
      yellowCards: numberValue(form.get('yellowCards')) ?? 0,
      redCards: numberValue(form.get('redCards')) ?? 0,
      cleanSheets: numberValue(form.get('cleanSheets')) ?? 0,
    }
    try {
      await setDoc(doc(db, 'players', id), {
        id,
        name,
        number: numberValue(form.get('number'), true),
        team: String(form.get('team') ?? 'senior'),
        position: String(form.get('position') ?? '') || null,
        dob: String(form.get('dob') ?? '') || null,
        nationality: String(form.get('nationality') ?? '') || null,
        preferredFoot: String(form.get('preferredFoot') ?? '') || null,
        heightCm: numberValue(form.get('heightCm'), true),
        photoDataUrl: playerPhoto,
        stats,
        updatedAt: serverTimestamp(),
        ...(selectedPlayer ? {} : { createdAt: serverTimestamp() }),
      }, { merge: true })
      setSelectedPlayerId(id)
      showToast(selectedPlayer ? 'Player updated.' : 'Player added.')
    } catch (error) {
      showToast(messageFrom(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function deletePlayer() {
    if (!selectedPlayer || !window.confirm(`Delete ${selectedPlayer.name} from the squad?`)) return
    try {
      await deleteDoc(doc(db, 'players', selectedPlayer.id))
      setSelectedPlayerId('')
      setPlayerPhotoDraft(null)
      showToast('Player deleted.')
    } catch (error) {
      showToast(messageFrom(error), 'error')
    }
  }

  async function saveTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedTeam || uploading) return
    setSaving(true)
    const form = new FormData(event.currentTarget)
    try {
      await setDoc(doc(db, 'teams', selectedTeam.id), {
        id: selectedTeam.id,
        name: String(form.get('name') ?? '').trim(),
        shortName: String(form.get('shortName') ?? '').trim(),
        homeGround: String(form.get('homeGround') ?? '').trim() || null,
        logoDataUrl: teamLogo,
        updatedAt: serverTimestamp(),
      }, { merge: true })
      showToast('Team updated.')
    } catch (error) {
      showToast(messageFrom(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function saveStanding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedStanding) return
    setSaving(true)
    const form = new FormData(event.currentTarget)
    const goalsFor = numberValue(form.get('goalsFor')) ?? 0
    const goalsAgainst = numberValue(form.get('goalsAgainst')) ?? 0
    const formValues = String(form.get('form') ?? '').toUpperCase().split('').filter((value): value is 'W' | 'D' | 'L' => value === 'W' || value === 'D' || value === 'L').slice(-5)
    try {
      await setDoc(doc(db, 'standings', selectedStanding.id), {
        ...selectedStanding,
        position: numberValue(form.get('position')) ?? 0,
        team: String(form.get('team') ?? '').trim(),
        played: numberValue(form.get('played')) ?? 0,
        won: numberValue(form.get('won')) ?? 0,
        drawn: numberValue(form.get('drawn')) ?? 0,
        lost: numberValue(form.get('lost')) ?? 0,
        goalsFor,
        goalsAgainst,
        goalDifference: goalsFor - goalsAgainst,
        points: numberValue(form.get('points')) ?? 0,
        form: formValues,
        updatedAt: serverTimestamp(),
      }, { merge: true })
      showToast('League table row updated.')
    } catch (error) {
      showToast(messageFrom(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function saveFixture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    const form = new FormData(event.currentTarget)
    const id = selectedFixture?.id ?? documentId(`${form.get('home')} v ${form.get('away')}`)
    const dateInput = String(form.get('date') ?? '')
    try {
      await setDoc(doc(db, 'fixtures', id), {
        id,
        competition: String(form.get('competition') ?? '').trim(),
        season: String(form.get('season') ?? '').trim(),
        date: dateInput ? `${dateInput}:00+02:00` : '',
        home: String(form.get('home') ?? '').trim(),
        away: String(form.get('away') ?? '').trim(),
        venue: String(form.get('venue') ?? '').trim() || null,
        status: String(form.get('status') ?? 'upcoming'),
        homeScore: numberValue(form.get('homeScore'), true),
        awayScore: numberValue(form.get('awayScore'), true),
        updatedAt: serverTimestamp(),
        ...(selectedFixture ? {} : { createdAt: serverTimestamp() }),
      }, { merge: true })
      setSelectedFixtureId(id)
      showToast(selectedFixture ? 'Fixture updated.' : 'Fixture added.')
    } catch (error) {
      showToast(messageFrom(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function deleteFixture() {
    if (!selectedFixture || !window.confirm('Delete this fixture and its result?')) return
    try {
      await deleteDoc(doc(db, 'fixtures', selectedFixture.id))
      setSelectedFixtureId('')
      showToast('Fixture deleted.')
    } catch (error) {
      showToast(messageFrom(error), 'error')
    }
  }

  const isLoading = section === 'players' ? players.loading : section === 'teams' ? teams.loading : section === 'standings' ? standings.loading : fixtures.loading
  const hasItems = section === 'players' ? players.items.length > 0 : section === 'teams' ? teams.items.length > 0 : section === 'standings' ? standings.items.length > 0 : fixtures.items.length > 0

  return <>
    <PageHeader eyebrow="Club operations" title="Admin panel" description="Changes are shared with fans as soon as they are saved." />
    <div className="admin-tabs" role="tablist" aria-label="Admin sections">
      {sections.map(({ key, label, icon: Icon }) => <button key={key} type="button" role="tab" aria-selected={section === key} className={section === key ? 'admin-tab active' : 'admin-tab'} onClick={() => setSection(key)}><Icon size={16} />{label}</button>)}
    </div>
    {isLoading ? <div className="loading-list"><Skeleton /><Skeleton /><Skeleton /></div>
      : !hasItems && section !== 'players' && section !== 'fixtures' ? <EmptyState icon={ImagePlus} title="No records loaded" description="Seed the club data before editing this section." />
        : section === 'players' ? <Card className="admin-card">
          <div className="admin-card-heading"><h2>Player details</h2><select aria-label="Choose player" value={selectedPlayerId} onChange={(event) => setSelectedPlayerId(event.target.value)}><option value="">Add a player</option>{players.items.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></div>
          <form className="admin-form" key={selectedPlayer?.id ?? 'new-player'} onSubmit={savePlayer}>
            <div className="admin-form-grid">
              <Field label="Name" name="name" defaultValue={selectedPlayer?.name} required />
              <Field label="Jersey number" name="number" type="number" defaultValue={selectedPlayer?.number} min={1} />
              <label className="admin-field"><span>Position</span><select name="position" defaultValue={selectedPlayer?.position ?? ''}><option value="">Squad / not set</option><option value="GK">Goalkeeper</option><option value="DEF">Defender</option><option value="MID">Midfielder</option><option value="FWD">Forward</option></select></label>
              <Field label="Team" name="team" defaultValue={selectedPlayer?.team ?? 'senior'} required />
              <Field label="Date of birth" name="dob" type="date" defaultValue={selectedPlayer?.dob} />
              <Field label="Nationality" name="nationality" defaultValue={selectedPlayer?.nationality ?? 'Malawian'} />
              <label className="admin-field"><span>Preferred foot</span><select name="preferredFoot" defaultValue={selectedPlayer?.preferredFoot ?? ''}><option value="">Not set</option><option value="Left">Left</option><option value="Right">Right</option><option value="Both">Both</option></select></label>
              <Field label="Height (cm)" name="heightCm" type="number" defaultValue={selectedPlayer?.heightCm} min={1} />
            </div>
            <fieldset className="admin-stats"><legend>Season statistics</legend><div className="admin-form-grid">
              {(Object.keys(emptyStats) as Array<keyof PlayerStats>).map((key) => <Field key={key} label={key.replace(/([A-Z])/g, ' $1')} name={key} type="number" min={0} defaultValue={selectedPlayer?.stats?.[key] ?? 0} />)}
            </div></fieldset>
            <label className="admin-upload"><input type="file" accept="image/*" onChange={(event) => void handleImage(event, setPlayerPhoto)} /><ImagePlus size={17} />Upload player photo <small>Compressed under 200 KB</small></label>
            {playerPhoto && <img className="admin-image-preview" src={playerPhoto} alt="Player upload preview" />}
            <div className="admin-actions"><Button type="submit" disabled={saving || uploading}>{saving ? 'Saving...' : selectedPlayer ? 'Save player' : 'Add player'}</Button>{selectedPlayer && <Button type="button" variant="danger" onClick={() => void deletePlayer()}>Delete player</Button>}</div>
          </form>
        </Card>
          : section === 'teams' ? <Card className="admin-card">
            <div className="admin-card-heading"><h2>Team and logo</h2><select aria-label="Choose team" value={selectedTeam?.id ?? ''} onChange={(event) => setSelectedTeamId(event.target.value)}>{teams.items.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></div>
            {selectedTeam && <form className="admin-form" key={selectedTeam.id} onSubmit={saveTeam}>
              <div className="admin-form-grid"><Field label="Team name" name="name" defaultValue={selectedTeam.name} required /><Field label="Short name" name="shortName" defaultValue={selectedTeam.shortName} required /><Field label="Home ground" name="homeGround" defaultValue={selectedTeam.homeGround} /></div>
              <label className="admin-upload"><input type="file" accept="image/*" onChange={(event) => void handleImage(event, setTeamLogo)} /><ImagePlus size={17} />Upload team logo <small>Compressed under 200 KB</small></label>
              {teamLogo && <img className="admin-image-preview" src={teamLogo} alt={`${selectedTeam.name} logo preview`} />}
              <div className="admin-actions"><Button type="submit" disabled={saving || uploading}>Save team</Button><Button type="button" variant="ghost" onClick={() => setTeamLogo(null)}>Remove logo</Button></div>
            </form>}
          </Card>
            : section === 'standings' ? <Card className="admin-card">
              <div className="admin-card-heading"><h2>League table row</h2><select aria-label="Choose team row" value={selectedStandingId} onChange={(event) => setSelectedStandingId(event.target.value)}><option value="">Select team</option>{standings.items.map((row) => <option key={row.id} value={row.id}>{row.position}. {row.team}</option>)}</select></div>
              {selectedStanding && <form className="admin-form" key={selectedStanding.id} onSubmit={saveStanding}>
                <div className="admin-form-grid"><Field label="Position" name="position" type="number" min={1} defaultValue={selectedStanding.position} required /><Field label="Team" name="team" defaultValue={selectedStanding.team} required /><Field label="Played" name="played" type="number" min={0} defaultValue={selectedStanding.played} /><Field label="Won" name="won" type="number" min={0} defaultValue={selectedStanding.won} /><Field label="Drawn" name="drawn" type="number" min={0} defaultValue={selectedStanding.drawn} /><Field label="Lost" name="lost" type="number" min={0} defaultValue={selectedStanding.lost} /><Field label="Goals for" name="goalsFor" type="number" defaultValue={selectedStanding.goalsFor} /><Field label="Goals against" name="goalsAgainst" type="number" defaultValue={selectedStanding.goalsAgainst} /><Field label="Points" name="points" type="number" min={0} defaultValue={selectedStanding.points} /><Field label="Last five form (e.g. WDLWW)" name="form" defaultValue={selectedStanding.form.join('')} /></div>
                <div className="admin-actions"><Button type="submit" disabled={saving}>Save table row</Button></div>
              </form>}
            </Card>
              : <Card className="admin-card">
                <div className="admin-card-heading"><h2>Fixture and result</h2><select aria-label="Choose fixture" value={selectedFixtureId} onChange={(event) => setSelectedFixtureId(event.target.value)}><option value="">Add a fixture</option>{fixtures.items.map((fixture) => <option key={fixture.id} value={fixture.id}>{fixture.date.slice(0, 10)} · {fixture.home} v {fixture.away}</option>)}</select></div>
                <form className="admin-form" key={selectedFixture?.id ?? 'new-fixture'} onSubmit={saveFixture}>
                  <div className="admin-form-grid"><Field label="Competition" name="competition" defaultValue={selectedFixture?.competition ?? 'TNM Super League'} required /><Field label="Season" name="season" defaultValue={selectedFixture?.season ?? '2026'} required /><Field label="Date and CAT kick-off" name="date" type="datetime-local" defaultValue={selectedFixture?.date?.slice(0, 16)} required /><Field label="Venue" name="venue" defaultValue={selectedFixture?.venue} /><Field label="Home team" name="home" defaultValue={selectedFixture?.home} required /><Field label="Away team" name="away" defaultValue={selectedFixture?.away} required /></div>
                  <div className="admin-actions"><Button type="submit" disabled={saving}>{saving ? 'Saving...' : selectedFixture ? 'Save fixture' : 'Add fixture'}</Button>{selectedFixture && <Button type="button" variant="danger" onClick={() => void deleteFixture()}>Delete fixture</Button>}</div>
                </form>
              </Card>}
  </>
}