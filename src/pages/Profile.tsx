import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore'
import { QRCodeSVG } from 'qrcode.react'
import { useAuth } from '../auth/AuthContext'
import { LeaderboardBadge } from '../components/Leaderboard'
import { FanLevelChip } from '../components/FanLevel'
import VerificationBanner from '../components/VerificationBanner'
import LogoutButton from '../components/LogoutButton'
import PushSettings from '../components/PushSettings'
import TeamLogo from '../components/TeamLogo'
import { Card, PageHeader, Skeleton } from '../components/UI'
import { db } from '../firebase'
import { useFirestoreCollection } from '../hooks/useFirestoreCollection'
import { useFlag } from '../hooks/useFlag'
import DeleteAccount from '../components/DeleteAccount'
import ChangePassword from '../components/ChangePassword'
import SignedInDevices from '../components/SignedInDevices'
import type { LegacyFan, MembershipRecord, MembershipTier } from '../types'

function dateLabel(value: unknown) {
  const date = value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function'
    ? value.toDate() as Date
    : typeof value === 'string' ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString() : null
}

function matchingTier(value: string | undefined, tiers: MembershipTier[]) {
  const key = value?.trim().toLocaleLowerCase()
  return tiers.find((tier) => tier.id.toLocaleLowerCase() === key || tier.name.toLocaleLowerCase() === key)
}

export default function Profile() {
  const { user, profile } = useAuth()
  const tiers = useFirestoreCollection<MembershipTier>('membershipTiers')
  const membershipOpen = useFlag('membershipPayments')
  const [membershipState, setMembershipState] = useState<{ uid: string | null; value: MembershipRecord | null; loading: boolean; error: string | null }>({ uid: null, value: null, loading: true, error: null })
  const [legacyState, setLegacyState] = useState<{ email: string | null; value: LegacyFan | null; loading: boolean; error: string | null }>({ email: null, value: null, loading: true, error: null })
  const uid = user?.uid ?? null
  const email = user?.email ?? null

  useEffect(() => {
    if (!uid) return
    return onSnapshot(doc(db, 'memberships', uid), (snapshot) => {
      setMembershipState({ uid, value: snapshot.exists() ? snapshot.data() as MembershipRecord : null, loading: false, error: null })
    }, () => setMembershipState({ uid, value: null, loading: false, error: 'Membership details could not be loaded.' }))
  }, [uid])

  useEffect(() => {
    if (!email) return
    return onSnapshot(query(collection(db, 'fans'), where('email', '==', email)), (snapshot) => {
      const fan = snapshot.docs[0]
      setLegacyState({ email, value: fan ? { ...fan.data(), id: fan.id } as LegacyFan : null, loading: false, error: null })
    }, () => setLegacyState({ email, value: null, loading: false, error: 'Linked membership details could not be loaded.' }))
  }, [email])

  const loading = membershipState.uid !== uid || membershipState.loading || legacyState.email !== email || legacyState.loading || tiers.loading
  const membership = membershipState.uid === uid ? membershipState.value : null
  const legacyFan = legacyState.email === email ? legacyState.value : null
  const tier = matchingTier(membership?.tierId ?? legacyFan?.tier, tiers.items)
  const status = membership?.status ?? (legacyFan?.status?.toLowerCase?.() === 'active' ? 'active' : 'pending')
  const fullName = membership?.fullName || legacyFan?.fullName || profile?.fullName || user?.displayName || 'Ekhaya supporter'
  const fanId = membership?.fanId || legacyFan?.fanId || null
  const expiry = dateLabel(membership?.expiryDate ?? legacyFan?.expiryDate)
  const joinedAt = dateLabel(membership?.startDate ?? legacyFan?.memberSince)
  const tierBenefits = (Array.isArray(tier?.benefits) ? tier.benefits : []).slice(0, 3)
  const qrValue = fanId && email ? `EKHAYA-FC|${fanId}|${email}` : ''

  return (
    <>
      <PageHeader eyebrow="Your account" title="Fan Profile" />
      <Card className="profile-card">
        <h2>{fullName}</h2>
        <p>{user?.email}</p>
        <FanLevelChip />
      </Card>
      {/* Email check lives here now, not at the top of every page. */}
      <VerificationBanner />
      <LeaderboardBadge />
      {!loading && !membership && !legacyFan && !membershipOpen ? <Card className="membership-soon">
        <span className="membership-soon-badge">Coming soon</span>
        <h2>Your digital member card</h2>
        <p>Membership opens soon. When you join, your member card with its QR code will appear here.</p>
      </Card> : <section className="digital-membership-card" aria-label="Digital membership card">
        <div className="digital-membership-header"><TeamLogo name="Ekhaya FC" crest /><div><span>EKHAYA FC</span><strong>OFFICIAL SUPPORTER CLUB</strong></div><span className={`digital-membership-status digital-membership-${status}`}>{status === 'active' ? 'ACTIVE' : status.toUpperCase()}</span></div>
        {loading ? <div className="digital-membership-loading"><Skeleton /><Skeleton /></div> : <>
          <div className="digital-membership-name"><span>Member</span><strong>{fullName}</strong><FanLevelChip /></div>
          <div className="digital-membership-details"><div><span>Fan ID</span><strong>{fanId ?? 'Pending approval'}</strong></div><div><span>Tier</span><strong>{tier?.name ?? 'Pending'}</strong></div><div><span>Expires</span><strong>{status === 'active' ? expiry ?? 'Not set' : 'Pending approval'}</strong></div></div>
          <div className="digital-membership-meta"><span>Joined {joinedAt ?? 'on approval'}</span>{tierBenefits.length ? <strong>{tierBenefits.join(' • ')}</strong> : null}</div>
          <div className="digital-membership-qr">{status === 'active' && qrValue ? <QRCodeSVG value={qrValue} size={104} level="M" includeMargin aria-label={`Membership QR for ${fanId}`} /> : <p>QR available after approval</p>}</div>
        </>}
      </section>}
      {(membershipState.error || legacyState.error || tiers.error) && <p className="live-error" role="alert">{membershipState.error || legacyState.error || tiers.error}</p>}
      <PushSettings />
      <LogoutButton />
      <ChangePassword />
      <SignedInDevices />
      <DeleteAccount />
      <p className="legal-links"><a href="/privacy.html" target="_blank" rel="noreferrer">Privacy Policy</a> · <a href="/delete-account.html" target="_blank" rel="noreferrer">How account deletion works</a></p>
    </>
  )
}
