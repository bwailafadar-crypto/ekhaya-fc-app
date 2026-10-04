import { useEffect, useRef, useState, type FormEvent, type ChangeEvent } from 'react'
import { collection, deleteDoc, doc, documentId as firestoreDocumentId, getDoc, getDocs, limit, orderBy, query, runTransaction, serverTimestamp, setDoc, startAfter, Timestamp, writeBatch, type DocumentData, type QueryDocumentSnapshot } from 'firebase/firestore'
import { ArrowRight, CalendarDays, Download, ImagePlus, Newspaper, ShieldCheck, Table2, UserRound, Users } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import FansManager from './admin/FansManager'
import { db } from '../firebase'
import { useToast } from '../components/ToastContext'
import { Button, Card, EmptyState, PageHeader, Skeleton } from '../components/UI'
import { useAuth } from '../auth/AuthContext'
import TeamLogo from '../components/TeamLogo'
import NewsArticleEditor from '../components/NewsArticleEditor'
import { useFirestoreCollection } from '../hooks/useFirestoreCollection'
import { compressImage } from '../utils/compressImage'
import { matchMinute } from '../utils/matchClock'
import type { Fixture, LegacyFan, MembershipRecord, MembershipTier, Player, PlayerStats, Standing, Team } from '../types'

type Section = 'fans' | 'players' | 'teams' | 'standings' | 'fixtures' | 'news' | 'membershipTiers' | 'members'
const superadminSections: Section[] = ['fans', 'membershipTiers', 'members']
const sections: Array<{ key: Section; label: string; icon: typeof Users }> = [
  { key: 'fans', label: 'Fans', icon: UserRound },
  { key: 'players', label: 'Players', icon: Users },
  { key: 'teams', label: 'Teams', icon: ShieldCheck },
  { key: 'standings', label: 'Table', icon: Table2 },
  { key: 'fixtures', label: 'Fixtures', icon: CalendarDays },
  { key: 'news', label: 'News', icon: Newspaper },
  { key: 'membershipTiers', label: 'Membership Tiers', icon: ShieldCheck },
  { key: 'members', label: 'Membership requests', icon: Users },
]

type AdminCollectionState<T> = { items: T[]; loading: boolean; error: string | null }
type StoredMembership = { id: string; data: MembershipRecord }
type MemberRow = {
  id: string
  uid: string | null
  legacyFanId: string | null
  email: string
  fullName: string
  phone: string
  tierId: string
  status: 'pending' | 'active' | 'suspended'
  fanId: string | null
  startDate: Timestamp | string | null
  expiryDate: Timestamp | string | null
}

const MEMBER_PAGE_SIZE = 20

type MemberPageCursors = {
  memberships: QueryDocumentSnapshot<DocumentData> | null
  legacyFans: QueryDocumentSnapshot<DocumentData> | null
  membershipsHasMore: boolean
  legacyFansHasMore: boolean
}

function emptyMemberPageCursors(): MemberPageCursors {
  return { memberships: null, legacyFans: null, membershipsHasMore: true, legacyFansHasMore: true }
}

async function readMemberPage(cursors: MemberPageCursors) {
  const pageQuery = (path: 'memberships' | 'fans', cursor: MemberPageCursors['memberships']) => cursor
    ? query(collection(db, path), orderBy(firestoreDocumentId()), startAfter(cursor), limit(MEMBER_PAGE_SIZE + 1))
    : query(collection(db, path), orderBy(firestoreDocumentId()), limit(MEMBER_PAGE_SIZE + 1))
  const [membershipSnapshot, legacyFanSnapshot] = await Promise.all([
    cursors.membershipsHasMore ? getDocs(pageQuery('memberships', cursors.memberships)) : null,
    cursors.legacyFansHasMore ? getDocs(pageQuery('fans', cursors.legacyFans)) : null,
  ])
  const membershipDocs = membershipSnapshot?.docs.slice(0, MEMBER_PAGE_SIZE) ?? []
  const legacyFanDocs = legacyFanSnapshot?.docs.slice(0, MEMBER_PAGE_SIZE) ?? []

  return {
    memberships: membershipDocs.map((item) => ({ id: item.id, data: item.data() as MembershipRecord })),
    legacyFans: legacyFanDocs.map((item) => ({ ...item.data(), id: item.id }) as LegacyFan),
    cursors: {
      memberships: membershipDocs.at(-1) ?? cursors.memberships,
      legacyFans: legacyFanDocs.at(-1) ?? cursors.legacyFans,
      membershipsHasMore: Boolean(membershipSnapshot && membershipSnapshot.docs.length > MEMBER_PAGE_SIZE),
      legacyFansHasMore: Boolean(legacyFanSnapshot && legacyFanSnapshot.docs.length > MEMBER_PAGE_SIZE),
    },
  }
}

function emailKey(email: string) {
  return email.trim().toLocaleLowerCase()
}

function memberStatus(status: string | undefined): MemberRow['status'] {
  return status === 'active' || status === 'suspended' ? status : 'pending'
}

function memberDate(value: unknown) {
  if (value instanceof Timestamp) return value.toDate()
  if (typeof value === 'string') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }
  return null
}

function addMonths(date: Date, months: number) {
  const result = new Date(date)
  const day = result.getDate()
  result.setDate(1)
  result.setMonth(result.getMonth() + months)
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate()
  result.setDate(Math.min(day, lastDay))
  return result
}

function fanNumber(fanId: string | null | undefined) {
  const match = fanId?.match(/^EKH-FAN-(\d+)$/)
  return match ? Number(match[1]) : 0
}

function tierIdFor(label: string | undefined, tiers: MembershipTier[]) {
  const key = (label ?? '').trim().toLocaleLowerCase()
  return tiers.find((tier) => tier.id.toLocaleLowerCase() === key || tier.name.toLocaleLowerCase() === key)?.id ?? ''
}

const defaultMembershipTiers: MembershipTier[] = [
  { id: 'basic', name: 'Basic', priceMWK: 5000, durationMonths: 12, benefits: ['Digital membership card', 'Club news and updates'], colour: '#28764B', active: true },
  { id: 'silver', name: 'Silver', priceMWK: 10000, durationMonths: 12, benefits: ['Basic benefits', 'Priority ticket access'], colour: '#8B9299', active: true },
  { id: 'gold', name: 'Gold', priceMWK: 20000, durationMonths: 12, benefits: ['Silver benefits', 'Exclusive matchday offers'], colour: '#C9A227', active: true },
  { id: 'premium', name: 'Premium', priceMWK: 50000, durationMonths: 12, benefits: ['Gold benefits', 'Invitations to club events'], colour: '#242424', active: true },
]

const emptyStats: PlayerStats = {
  appearances: 0, starts: 0, minutes: 0, goals: 0, assists: 0,
  yellowCards: 0, redCards: 0, cleanSheets: 0,
}

const officialTeams: Record<string, { name: string; image: string; aliases?: string[] }> = {
  'blue-eagles': { name: 'Blue Eagles', image: '/team-logos/blue-eagles.png' },
  'big-bullets': { name: 'FCB Nyasa Big Bullets', image: '/team-logos/big-bullets.png', aliases: ['Big Bullets'] },
  'mighty-wanderers': { name: 'Mighty Wanderers', image: '/team-logos/mighty-wanderers.png' },
  'silver-strikers': { name: 'Silver Strikers', image: 'https://fam.mw/wp-content/uploads/2022/03/Silver-Strikers.png' },
  'masters-fc': { name: 'Masters FC', image: '/team-logos/masters-fc.png' },
  'moyale-barracks': { name: 'Moyale Barracks', image: '/team-logos/moyale-barracks.png' },
  'chitipa-united': { name: 'Chitipa United', image: '/team-logos/chitipa-united.png' },
  'red-lions': { name: 'Red Lions', image: 'https://fam.mw/wp-content/uploads/2022/03/Red-Lions.png' },
  'mitundu-baptist': { name: 'Luanar Mitundu', image: '/team-logos/mitundu-baptist.png', aliases: ['Mitundu Baptist'] },
  'civo-united': { name: 'Civil Service United', image: 'https://fam.mw/wp-content/uploads/2022/03/Civo.png', aliases: ['Civo United'] },
  'ekhaya-fc': { name: 'Ekhaya FC', image: '/team-logos/ekhaya-fc.png' },
  'dedza-dynamos': { name: 'Goshen City Dedza Dynamos', image: '/team-logos/dedza-dynamos.png', aliases: ['Dedza Dynamos'] },
  'karonga-united': { name: 'Karonga United', image: '/team-logos/karonga-united.png' },
  mafco: { name: 'MAFCO F.C', image: '/team-logos/mafco.png', aliases: ['MAFCO'] },
  'kamuzu-barracks': { name: 'Kamuzu Barracks', image: '/team-logos/kamuzu-barracks.png' },
  'creck-sporting': { name: 'Creck Sporting', image: '/team-logos/creck-sporting.png' },
}

function teamNameAliases() {
  const aliases = new Map<string, string>()
  for (const { name, aliases: oldNames = [] } of Object.values(officialTeams)) {
    aliases.set(name.toLocaleLowerCase(), name)
    for (const alias of oldNames) aliases.set(alias.toLocaleLowerCase(), name)
  }
  return aliases
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
  const { role } = useAuth()
  const isSuperadmin = role === 'superadmin'
  const [searchParams] = useSearchParams()
  const requestedSection = searchParams.get('section') as Section | null
  const allowedRequest = requestedSection && sections.some(({ key }) => key === requestedSection) && (isSuperadmin || !superadminSections.includes(requestedSection))
    ? requestedSection : null
  const [section, setSection] = useState<Section>(() => allowedRequest ?? (isSuperadmin ? 'fans' : 'players'))
  // The top-bar bell links to ?section=fans; follow it even when already on this page.
  const [handledRequest, setHandledRequest] = useState(allowedRequest)
  if (allowedRequest !== handledRequest) {
    setHandledRequest(allowedRequest)
    if (allowedRequest) setSection(allowedRequest)
  }
  const [selectedPlayerId, setSelectedPlayerId] = useState('')
  const [selectedTeamId, setSelectedTeamId] = useState('')
  const [selectedStandingId, setSelectedStandingId] = useState('')
  const [selectedFixtureId, setSelectedFixtureId] = useState('')
  const [playerPhotoDraft, setPlayerPhotoDraft] = useState<{ id: string; dataUrl: string | null } | null>(null)
  const [teamLogoDraft, setTeamLogoDraft] = useState<{ id: string; dataUrl: string | null } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [importingLogos, setImportingLogos] = useState(false)
  const [logoImportFailures, setLogoImportFailures] = useState<string[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [seedingTiers, setSeedingTiers] = useState(false)
  const [selectedTierId, setSelectedTierId] = useState('')
  const [tierFilter, setTierFilter] = useState('all')
  const [memberStatusFilter, setMemberStatusFilter] = useState('all')
  const [memberActionBusy, setMemberActionBusy] = useState('')
  const [memberPageLoading, setMemberPageLoading] = useState(false)
  const [membersHasMore, setMembersHasMore] = useState(false)
  const memberPageCursors = useRef(emptyMemberPageCursors())
  const memberPageRequest = useRef(0)
  const memberPageBusy = useRef(false)
  const [membershipRecords, setMembershipRecords] = useState<AdminCollectionState<StoredMembership>>({ items: [], loading: true, error: null })
  const [legacyFans, setLegacyFans] = useState<AdminCollectionState<LegacyFan>>({ items: [], loading: true, error: null })
  const [clockNow, setClockNow] = useState(0)
  const { showToast } = useToast()
  const players = useFirestoreCollection<Player>('players')
  const teams = useFirestoreCollection<Team>('teams')
  const standings = useFirestoreCollection<Standing>('standings')
  const fixtures = useFirestoreCollection<Fixture>('fixtures')
  const membershipTiers = useFirestoreCollection<MembershipTier>('membershipTiers')
  const liveFixtures = fixtures.items.filter((fixture) => fixture.status === 'live')
  const selectedPlayer = players.items.find((item) => item.id === selectedPlayerId)
  const selectedTeam = teams.items.find((item) => item.id === selectedTeamId)
    ?? (selectedTeamId ? undefined : teams.items[0])
  const selectedStanding = standings.items.find((item) => item.id === selectedStandingId)
  const selectedFixture = fixtures.items.find((item) => item.id === selectedFixtureId)
  const selectedTier = membershipTiers.items.find((item) => item.id === selectedTierId)
    ?? (selectedTierId ? undefined : membershipTiers.items[0])
  useEffect(() => {
    if (!isSuperadmin || section !== 'members') return
    let active = true
    const requestId = ++memberPageRequest.current
    const cursors = emptyMemberPageCursors()
    memberPageCursors.current = cursors
    memberPageBusy.current = true

    void readMemberPage(cursors).then((page) => {
      if (!active || requestId !== memberPageRequest.current) return
      memberPageCursors.current = page.cursors
      setMembershipRecords({ items: page.memberships, loading: false, error: null })
      setLegacyFans({ items: page.legacyFans, loading: false, error: null })
      setMembersHasMore(page.cursors.membershipsHasMore || page.cursors.legacyFansHasMore)
    }).catch(() => {
      if (!active || requestId !== memberPageRequest.current) return
      setMembershipRecords({ items: [], loading: false, error: 'Membership requests could not be loaded.' })
      setLegacyFans({ items: [], loading: false, error: 'Legacy fan records could not be loaded.' })
    }).finally(() => {
      if (!active || requestId !== memberPageRequest.current) return
      memberPageBusy.current = false
      setMemberPageLoading(false)
    })

    return () => {
      active = false
      memberPageRequest.current += 1
      memberPageBusy.current = false
    }
  }, [isSuperadmin, section])

  async function loadMoreMembers() {
    if (memberPageBusy.current || !membersHasMore) return
    memberPageBusy.current = true
    setMemberPageLoading(true)
    const requestId = memberPageRequest.current
    try {
      const page = await readMemberPage(memberPageCursors.current)
      if (requestId !== memberPageRequest.current) return
      memberPageCursors.current = page.cursors
      setMembershipRecords((current) => ({ ...current, items: [...current.items, ...page.memberships], error: null }))
      setLegacyFans((current) => ({ ...current, items: [...current.items, ...page.legacyFans], error: null }))
      setMembersHasMore(page.cursors.membershipsHasMore || page.cursors.legacyFansHasMore)
    } catch {
      if (requestId === memberPageRequest.current) {
        setMembershipRecords((current) => ({ ...current, error: 'More membership requests could not be loaded.' }))
      }
    } finally {
      if (requestId === memberPageRequest.current) {
        memberPageBusy.current = false
        setMemberPageLoading(false)
      }
    }
  }
  const legacyByEmail = new Map(legacyFans.items.filter((fan) => fan.email).map((fan) => [emailKey(fan.email), fan]))
  const linkedLegacyIds = new Set<string>()
  const accountMembers: MemberRow[] = membershipRecords.items.map(({ id, data }) => {
    const legacy = data.email ? legacyByEmail.get(emailKey(data.email)) : undefined
    if (legacy) linkedLegacyIds.add(legacy.id)
    return {
      id,
      uid: id,
      legacyFanId: legacy?.id ?? null,
      email: data.email || legacy?.email || '',
      fullName: data.fullName || legacy?.fullName || '',
      phone: data.phone || legacy?.phone || '',
      tierId: data.tierId || tierIdFor(legacy?.tier, membershipTiers.items),
      status: memberStatus(data.status || legacy?.status),
      fanId: data.fanId || legacy?.fanId || null,
      startDate: data.startDate ?? legacy?.memberSince ?? null,
      expiryDate: data.expiryDate ?? legacy?.expiryDate ?? null,
    }
  })
  const legacyMembers: MemberRow[] = legacyFans.items.filter((fan) => !linkedLegacyIds.has(fan.id)).map((fan) => ({
    id: `legacy-${fan.id}`,
    uid: null,
    legacyFanId: fan.id,
    email: fan.email || '',
    fullName: fan.fullName || '',
    phone: fan.phone || '',
    tierId: tierIdFor(fan.tier, membershipTiers.items),
    status: memberStatus(fan.status),
    fanId: fan.fanId,
    startDate: fan.memberSince ?? null,
    expiryDate: fan.expiryDate ?? null,
  }))
  const memberRows = [...accountMembers, ...legacyMembers].sort((left, right) => left.fullName.localeCompare(right.fullName))
  const visibleMembers = memberRows.filter((member) => (tierFilter === 'all' || member.tierId === tierFilter)
    && (memberStatusFilter === 'all' || member.status === memberStatusFilter))
  const membersLoading = membershipRecords.loading || legacyFans.loading || membershipTiers.loading
  const membersError = [membershipRecords.error, legacyFans.error, membershipTiers.error].filter(Boolean).join(' ')
  useEffect(() => {
    if (!liveFixtures.length) return
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [liveFixtures.length])
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

  async function seedMembershipTiers() {
    setSeedingTiers(true)
    try {
      const existing = await getDocs(collection(db, 'membershipTiers'))
      const existingIds = new Set(existing.docs.map((item) => item.id))
      const missing = defaultMembershipTiers.filter((tier) => !existingIds.has(tier.id))
      const batch = writeBatch(db)
      missing.forEach(({ id, ...tier }) => batch.set(doc(db, 'membershipTiers', id), tier))
      if (missing.length) await batch.commit()
      showToast(missing.length ? 'Default membership tiers created with placeholder prices.' : 'All default tiers already exist.')
    } catch (error) {
      showToast(messageFrom(error), 'error')
    } finally {
      setSeedingTiers(false)
    }
  }

  async function saveMembershipTier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedTier) return
    setSaving(true)
    const form = new FormData(event.currentTarget)
    const benefits = String(form.get('benefits') ?? '').split('\n').map((benefit) => benefit.trim()).filter(Boolean)
    try {
      const { id } = selectedTier
      await setDoc(doc(db, 'membershipTiers', id), {
        name: String(form.get('name') ?? '').trim(),
        priceMWK: numberValue(form.get('priceMWK')) ?? 0,
        durationMonths: numberValue(form.get('durationMonths')) ?? 0,
        benefits,
        colour: String(form.get('colour') ?? '#C9A227'),
        active: form.get('active') === 'on',
      }, { merge: true })
      showToast('Membership tier updated.')
    } catch (error) {
      showToast(messageFrom(error), 'error')
    } finally {
      setSaving(false)
    }
  }

  async function updateMember(member: MemberRow, action: 'approve' | 'suspend' | 'renew') {
    const tier = membershipTiers.items.find((item) => item.id === member.tierId)
    if (action !== 'suspend' && !tier) {
      showToast('Select a valid membership tier before approval or renewal.', 'error')
      return
    }
    setMemberActionBusy(member.id)
    try {
      const membershipRef = member.uid ? doc(db, 'memberships', member.uid) : null
      const legacyRef = member.legacyFanId ? doc(db, 'fans', member.legacyFanId) : null
      const counterRef = doc(db, 'settings', 'fanIdCounter')
      let knownFanNumber = 0
      if (action !== 'suspend' && !member.fanId) {
        const counter = await getDoc(counterRef)
        const counterValue = Number(counter.data()?.lastNumber ?? 0)
        if (counter.exists() && Number.isSafeInteger(counterValue) && counterValue >= 0) {
          knownFanNumber = counterValue
        } else {
          const [membersSnapshot, fansSnapshot] = await Promise.all([
            getDocs(collection(db, 'memberships')),
            getDocs(collection(db, 'fans')),
          ])
          knownFanNumber = membersSnapshot.docs.reduce((highest, item) => Math.max(highest, fanNumber(item.data().fanId)), 0)
          knownFanNumber = fansSnapshot.docs.reduce((highest, item) => Math.max(highest, fanNumber(item.data().fanId)), knownFanNumber)
        }
      }
      let nextStartDate: Timestamp | undefined
      let nextExpiryDate: Timestamp | undefined
      let nextFanId = member.fanId

      await runTransaction(db, async (transaction) => {
        const refs = [membershipRef, legacyRef].filter((ref): ref is NonNullable<typeof ref> => ref !== null)
        const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)))
        const counterSnapshot = action === 'suspend' ? null : await transaction.get(counterRef)
        const membershipSnapshot = membershipRef ? snapshots[refs.indexOf(membershipRef)] : null
        const legacySnapshot = legacyRef ? snapshots[refs.indexOf(legacyRef)] : null
        if (membershipRef && !membershipSnapshot?.exists()) throw new Error('This membership request no longer exists.')
        if (legacyRef && !legacySnapshot?.exists()) throw new Error('This legacy fan record no longer exists.')

        const update: Record<string, unknown> = { status: action === 'suspend' ? 'suspended' : 'active', updatedAt: serverTimestamp() }
        let fanId = member.fanId
        if (action !== 'suspend') {
          const now = new Date()
          const priorExpiry = memberDate(member.expiryDate)
          const expiryBase = action === 'renew' && priorExpiry && priorExpiry > now ? priorExpiry : now
          const duration = Math.max(1, Number(tier?.durationMonths ?? 12))
          nextStartDate = Timestamp.fromDate(now)
          nextExpiryDate = Timestamp.fromDate(addMonths(expiryBase, duration))
          update.startDate = nextStartDate
          update.expiryDate = nextExpiryDate
          if (!fanId) {
            const counterValue = Number(counterSnapshot?.data()?.lastNumber ?? 0)
            const nextNumber = Math.max(Number.isSafeInteger(counterValue) && counterValue >= 0 ? counterValue : 0, knownFanNumber) + 1
            fanId = `EKH-FAN-${String(nextNumber).padStart(6, '0')}`
            transaction.set(counterRef, { lastNumber: nextNumber, updatedAt: serverTimestamp() }, { merge: true })
          }
          update.fanId = fanId
          if (tier) update.tierId = tier.id
        }
        nextFanId = fanId
        if (membershipRef) transaction.update(membershipRef, update)
        if (legacyRef) {
          const legacyUpdate: Record<string, unknown> = {
            status: update.status,
            updatedAt: serverTimestamp(),
            ...(nextFanId ? { fanId: nextFanId } : {}),
          }
          if (action !== 'suspend') {
            legacyUpdate.memberSince = memberDate(update.startDate)?.toISOString().slice(0, 10)
            legacyUpdate.expiryDate = memberDate(update.expiryDate)?.toISOString().slice(0, 10)
            if (tier) legacyUpdate.tier = tier.name
          }
          transaction.update(legacyRef, legacyUpdate)
        }
      })
      const nextStatus = action === 'suspend' ? 'suspended' : 'active'
      if (membershipRef) {
        const patch: Partial<MembershipRecord> = {
          status: nextStatus,
          ...(action !== 'suspend' ? {
            tierId: tier!.id,
            startDate: nextStartDate,
            expiryDate: nextExpiryDate,
            ...(nextFanId ? { fanId: nextFanId } : {}),
          } : {}),
        }
        setMembershipRecords((current) => ({
          ...current,
          items: current.items.map((item) => item.id === member.uid ? { ...item, data: { ...item.data, ...patch } } : item),
        }))
      }
      if (member.legacyFanId) {
        const patch: Partial<LegacyFan> = {
          status: nextStatus,
          ...(nextFanId ? { fanId: nextFanId } : {}),
          ...(action !== 'suspend' ? {
            tier: tier!.name,
            memberSince: nextStartDate?.toDate().toISOString().slice(0, 10) ?? null,
            expiryDate: nextExpiryDate?.toDate().toISOString().slice(0, 10) ?? null,
          } : {}),
        }
        setLegacyFans((current) => ({
          ...current,
          items: current.items.map((item) => item.id === member.legacyFanId ? { ...item, ...patch } : item),
        }))
      }
      showToast(action === 'approve' ? 'Membership approved.' : action === 'renew' ? 'Membership renewed.' : 'Membership suspended.')
    } catch (error) {
      showToast(messageFrom(error), 'error')
    } finally {
      setMemberActionBusy('')
    }
  }

  async function importTeamLogos() {
    setImportingLogos(true)
    setLogoImportFailures(null)
    const batch = writeBatch(db)
    const failed: string[] = []
    let imported = 0
    let alreadyPresent = 0
    try {
      const [standingSnapshot, fixtureSnapshot] = await Promise.all([
        getDocs(collection(db, 'standings')),
        getDocs(collection(db, 'fixtures')),
      ])
      for (const [id, team] of Object.entries(officialTeams)) {
        const existing = teams.items.find((item) => item.id === id)
        let logoDataUrl = existing?.logoDataUrl ?? null
        if (logoDataUrl) alreadyPresent += 1
        else {
          try {
            const response = await fetch(team.image)
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            const blob = await response.blob()
            const file = new File([blob], `${id}.png`, { type: blob.type || 'image/png' })
            logoDataUrl = await compressImage(file)
            imported += 1
          } catch {
            failed.push(team.name)
          }
        }
        batch.set(doc(db, 'teams', id), {
          id,
          name: team.name,
          shortName: team.name,
          logoDataUrl,
          updatedAt: serverTimestamp(),
        }, { merge: true })
      }

      for (const standing of standingSnapshot.docs) {
        const official = officialTeams[standing.id]
        if (official && standing.data().team !== official.name) batch.update(standing.ref, { team: official.name, updatedAt: serverTimestamp() })
      }
      const aliases = teamNameAliases()
      for (const fixture of fixtureSnapshot.docs) {
        const data = fixture.data()
        const home = typeof data.home === 'string' ? aliases.get(data.home.toLocaleLowerCase()) : undefined
        const away = typeof data.away === 'string' ? aliases.get(data.away.toLocaleLowerCase()) : undefined
        const changes: Record<string, string | ReturnType<typeof serverTimestamp>> = {}
        if (home && home !== data.home) changes.home = home
        if (away && away !== data.away) changes.away = away
        if (Object.keys(changes).length) {
          changes.updatedAt = serverTimestamp()
          batch.update(fixture.ref, changes)
        }
      }
      await batch.commit()
      setLogoImportFailures(failed)
      showToast(failed.length
        ? `Imported ${imported} logos. ${failed.length} need manual upload.`
        : `Team names updated. ${imported} logos imported${alreadyPresent ? `; ${alreadyPresent} existing logos preserved` : ''}.`)
    } catch (error) {
      showToast(messageFrom(error), 'error')
    } finally {
      setImportingLogos(false)
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

  const isLoading = section === 'fans' ? false : section === 'players' ? players.loading : section === 'teams' ? teams.loading : section === 'standings' ? standings.loading : section === 'fixtures' ? fixtures.loading : section === 'membershipTiers' ? membershipTiers.loading : section === 'news' ? false : membersLoading
  const sectionError = section === 'fans' ? null : section === 'players' ? players.error : section === 'teams' ? teams.error : section === 'standings' ? standings.error : section === 'fixtures' ? fixtures.error : section === 'membershipTiers' ? membershipTiers.error : section === 'news' ? null : membersError
  const collectionErrors = [
    { name: 'Players', error: players.error },
    { name: 'Teams', error: teams.error },
    { name: 'Standings', error: standings.error },
    { name: 'Fixtures', error: fixtures.error },
    ...(isSuperadmin ? [{ name: 'Membership tiers', error: membershipTiers.error }, { name: 'Members', error: membersError }] : []),
  ].filter(({ error }) => error)
  const hasItems = section === 'players' ? players.items.length > 0 : section === 'teams' ? teams.items.length > 0 : section === 'standings' ? standings.items.length > 0 : section === 'fixtures' ? fixtures.items.length > 0 : section === 'membershipTiers' ? membershipTiers.items.length > 0 : visibleMembers.length > 0

  return <>
    <PageHeader eyebrow="Club operations" title="Admin panel" description="Changes are shared with fans as soon as they are saved." />
    {collectionErrors.map(({ name, error }) => <p className="live-error" role="alert" key={name}>{name} could not be loaded: {error}</p>)}
    {liveFixtures.map((fixture) => <section className="home-live-banner admin-live-banner" key={fixture.id}>
      <span className="home-live-label"><i className="live-pulse-dot" />LIVE NOW</span>
      <span className="home-live-teams"><span><TeamLogo name={fixture.home} />{fixture.home}</span><strong>{fixture.homeScore ?? 0} – {fixture.awayScore ?? 0}</strong><span><TeamLogo name={fixture.away} />{fixture.away}</span></span>
      <span className="home-live-clock">{matchMinute(fixture, clockNow)}</span>
      <Link className="button button-secondary admin-live-manage" to="/live">Manage match <ArrowRight size={15} /></Link>
    </section>)}
    <div className="admin-tabs" role="tablist" aria-label="Admin sections">
      {sections.filter(({ key }) => !superadminSections.includes(key) || isSuperadmin).map(({ key, label, icon: Icon }) => <button key={key} type="button" role="tab" aria-selected={section === key} className={section === key ? 'admin-tab active' : 'admin-tab'} onClick={() => setSection(key)}><Icon size={16} />{label}</button>)}
    </div>
    {isLoading ? <div className="loading-list"><Skeleton /><Skeleton /><Skeleton /></div>
      : sectionError ? null
      : section === 'fans' ? <FansManager onOpenRequests={() => setSection('members')} />
      : section === 'members' ? <section className="admin-members">
          <div className="member-filters">
            <label className="admin-field"><span>Tier</span><select value={tierFilter} onChange={(event) => setTierFilter(event.target.value)}><option value="all">All tiers</option>{membershipTiers.items.map((tier) => <option key={tier.id} value={tier.id}>{tier.name}</option>)}</select></label>
            <label className="admin-field"><span>Status</span><select value={memberStatusFilter} onChange={(event) => setMemberStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="pending">Pending</option><option value="active">Active</option><option value="suspended">Suspended</option></select></label>
          </div>
          {visibleMembers.length ? <div className="member-list">{visibleMembers.map((member) => {
            const tier = membershipTiers.items.find((item) => item.id === member.tierId)
            const expiry = memberDate(member.expiryDate)
            return <Card className="member-row" key={member.id}>
              <div className="member-row-heading"><div><h2>{member.fullName || 'Unnamed member'}</h2><span>{member.email || 'No email'}</span></div><span className={`member-status member-status-${member.status}`}>{member.status}</span></div>
              <dl className="member-details"><div><dt>Tier</dt><dd>{tier?.name ?? member.tierId ?? 'Unassigned'}</dd></div><div><dt>Phone</dt><dd>{member.phone || 'Not provided'}</dd></div><div><dt>Fan ID</dt><dd>{member.fanId ?? 'Pending approval'}</dd></div><div><dt>Expiry</dt><dd>{expiry ? expiry.toLocaleDateString() : 'Not set'}</dd></div></dl>
              {!member.uid && <p className="member-legacy-note">Legacy fan record; no app account linked.</p>}
              <div className="admin-actions">
                {member.status !== 'active' && <Button type="button" disabled={memberActionBusy === member.id} onClick={() => void updateMember(member, 'approve')}>{member.status === 'pending' ? 'Approve' : 'Reactivate'}</Button>}
                {member.status === 'active' && <Button type="button" variant="secondary" disabled={memberActionBusy === member.id} onClick={() => void updateMember(member, 'suspend')}>Suspend</Button>}
                {member.status === 'active' && <Button type="button" variant="secondary" disabled={memberActionBusy === member.id} onClick={() => void updateMember(member, 'renew')}>Renew</Button>}
              </div>
            </Card>
          })}</div> : <EmptyState icon={Users} title={membersHasMore ? 'No matches on this page' : 'No members match these filters'} description={membersHasMore ? 'Load more records to continue searching.' : undefined} />}
          {membersHasMore && <div className="member-pagination"><span>{membershipRecords.items.length + legacyFans.items.length} records loaded; filters apply to loaded records.</span><Button type="button" variant="secondary" disabled={memberPageLoading} onClick={() => void loadMoreMembers()}>{memberPageLoading ? 'Loading members...' : 'Load more members'}</Button></div>}
        </section>
      : section === 'membershipTiers' ? <>
          {!hasItems && <Card className="admin-card"><h2>No membership tiers yet</h2><p>Create the four placeholder tiers to start, then set their prices and benefits.</p><Button type="button" disabled={seedingTiers} onClick={() => void seedMembershipTiers()}>{seedingTiers ? 'Creating tiers...' : 'Create default tiers'}</Button></Card>}
          {hasItems && <Card className="admin-card">
            <div className="admin-card-heading"><h2>Membership tier</h2><select aria-label="Choose membership tier" value={selectedTier?.id ?? ''} onChange={(event) => setSelectedTierId(event.target.value)}>{membershipTiers.items.map((tier) => <option key={tier.id} value={tier.id}>{tier.name}</option>)}</select></div>
            {selectedTier && <form className="admin-form" key={selectedTier.id} onSubmit={saveMembershipTier}>
              <div className="admin-form-grid"><Field label="Name" name="name" defaultValue={selectedTier.name} required /><Field label="Price (MWK)" name="priceMWK" type="number" min={0} defaultValue={selectedTier.priceMWK} required /><Field label="Duration (months)" name="durationMonths" type="number" min={1} defaultValue={selectedTier.durationMonths} required /><Field label="Colour" name="colour" type="color" defaultValue={selectedTier.colour} /></div>
              <label className="admin-field"><span>Benefits (one per line)</span><textarea className="membership-benefits-input" name="benefits" rows={5} defaultValue={(selectedTier.benefits ?? []).join('\n')} /></label>
              <label className="membership-active-field"><input type="checkbox" name="active" defaultChecked={selectedTier.active} /><span>Available to fans</span></label>
              <div className="admin-actions"><Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save tier'}</Button><Button type="button" variant="secondary" disabled={seedingTiers} onClick={() => void seedMembershipTiers()}>{seedingTiers ? 'Creating...' : 'Add missing defaults'}</Button></div>
            </form>}
          </Card>}
        </>
      : section === 'news' ? <NewsArticleEditor />
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
          : section === 'teams' ? <>
            <Card className="admin-card logo-import-card">
              <div className="admin-card-heading"><h2>Official club badges</h2></div>
              <p className="live-help">Import the league badges into Firestore once. Existing uploaded logos are kept; unavailable badges stay as initials.</p>
              <Button type="button" variant="secondary" disabled={importingLogos || saving || uploading} onClick={() => void importTeamLogos()} icon={<Download size={16} />}>{importingLogos ? 'Importing logos...' : 'Import logos'}</Button>
              {logoImportFailures && <div className={logoImportFailures.length ? 'logo-import-report failed' : 'logo-import-report'} role="status">
                {logoImportFailures.length
                  ? <><strong>Upload these logos manually:</strong><span>{logoImportFailures.join(', ')}</span></>
                  : <strong>All team logos are in Firestore. The app now uses Firestore logos only.</strong>}
              </div>}
            </Card>
            <Card className="admin-card">
            <div className="admin-card-heading"><h2>Team and logo</h2><select aria-label="Choose team" value={selectedTeam?.id ?? ''} onChange={(event) => setSelectedTeamId(event.target.value)}>{teams.items.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></div>
            {selectedTeam && <form className="admin-form" key={selectedTeam.id} onSubmit={saveTeam}>
              <div className="admin-form-grid"><Field label="Team name" name="name" defaultValue={selectedTeam.name} required /><Field label="Short name" name="shortName" defaultValue={selectedTeam.shortName} required /><Field label="Home ground" name="homeGround" defaultValue={selectedTeam.homeGround} /></div>
              <label className="admin-upload"><input type="file" accept="image/*" onChange={(event) => void handleImage(event, setTeamLogo)} /><ImagePlus size={17} />Upload team logo <small>Compressed under 200 KB</small></label>
              {teamLogo && <img className="admin-image-preview" src={teamLogo} alt={`${selectedTeam.name} logo preview`} />}
              <div className="admin-actions"><Button type="submit" disabled={saving || uploading || importingLogos}>Save team</Button><Button type="button" variant="ghost" disabled={importingLogos} onClick={() => setTeamLogo(null)}>Remove logo</Button></div>
            </form>}
          </Card></>
            : section === 'standings' ? <Card className="admin-card">
              <div className="admin-card-heading"><h2>League table row</h2><select aria-label="Choose team row" value={selectedStandingId} onChange={(event) => setSelectedStandingId(event.target.value)}><option value="">Select team</option>{standings.items.map((row) => <option key={row.id} value={row.id}>{row.position ?? 0}. {row.team}</option>)}</select></div>
              {selectedStanding && <form className="admin-form" key={selectedStanding.id} onSubmit={saveStanding}>
                <div className="admin-form-grid"><Field label="Position" name="position" type="number" min={1} defaultValue={selectedStanding.position ?? 0} required /><Field label="Team" name="team" defaultValue={selectedStanding.team} required /><Field label="Played" name="played" type="number" min={0} defaultValue={selectedStanding.played ?? 0} /><Field label="Won" name="won" type="number" min={0} defaultValue={selectedStanding.won ?? 0} /><Field label="Drawn" name="drawn" type="number" min={0} defaultValue={selectedStanding.drawn ?? 0} /><Field label="Lost" name="lost" type="number" min={0} defaultValue={selectedStanding.lost ?? 0} /><Field label="Goals for" name="goalsFor" type="number" defaultValue={selectedStanding.goalsFor ?? 0} /><Field label="Goals against" name="goalsAgainst" type="number" defaultValue={selectedStanding.goalsAgainst ?? 0} /><Field label="Points" name="points" type="number" min={0} defaultValue={selectedStanding.points ?? 0} /><Field label="Last five form (e.g. WDLWW)" name="form" defaultValue={(selectedStanding.form ?? []).join('')} /></div>
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