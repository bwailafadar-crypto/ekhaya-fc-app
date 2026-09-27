import { useEffect, useState, type FormEvent } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import type { User } from 'firebase/auth'
import { ShieldCheck } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Button, Card, EmptyState, PageHeader, Skeleton } from '../components/UI'
import { useFirestoreCollection } from '../hooks/useFirestoreCollection'
import { db } from '../firebase'
import type { MembershipRecord, MembershipTier } from '../types'

type MembershipState = {
  uid: string | null
  membership: MembershipRecord | null
  loading: boolean
  error: string | null
}

const tierOrder = ['basic', 'silver', 'gold', 'premium']

async function paymentRequest(user: User, path: string, body: Record<string, string>) {
  const response = await fetch(`/.netlify/functions/${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${await user.getIdToken()}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const result = await response.json() as { error?: unknown; checkoutUrl?: unknown; status?: unknown }
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Payment request failed.')
  return result
}

export default function Membership() {
  const { user, profile } = useAuth()
  const [searchParams] = useSearchParams()
  const tiersResult = useFirestoreCollection<MembershipTier>('membershipTiers')
  const [selectedTierId, setSelectedTierId] = useState('')
  const [fullName, setFullName] = useState(profile?.fullName ?? user?.displayName ?? '')
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [email, setEmail] = useState(profile?.email ?? user?.email ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [formError, setFormError] = useState('')
  const [paymentMessage, setPaymentMessage] = useState('')
  const [paymentBusy, setPaymentBusy] = useState(false)
  const [membershipState, setMembershipState] = useState<MembershipState>({
    uid: null, membership: null, loading: true, error: null,
  })

  const uid = user?.uid
  useEffect(() => {
    if (!uid) return
    return onSnapshot(doc(db, 'memberships', uid), (snapshot) => {
      setMembershipState({
        uid,
        membership: snapshot.exists() ? snapshot.data() as MembershipRecord : null,
        loading: false,
        error: null,
      })
    }, () => setMembershipState({ uid, membership: null, loading: false, error: 'Could not load your membership request.' }))
  }, [uid])

  const tiers = tiersResult.items
    .filter((tier) => tier.active)
    .sort((left, right) => tierOrder.indexOf(left.id) - tierOrder.indexOf(right.id))
  const selectedTier = tiers.find((tier) => tier.id === selectedTierId)
  const isLoadingMembership = membershipState.uid !== (uid ?? null) || membershipState.loading
  const currentMembership = membershipState.uid === uid ? membershipState.membership : null
  const txRef = searchParams.get('tx_ref')

  useEffect(() => {
    if (!user || !txRef) return
    let cancelled = false
    void paymentRequest(user, 'pay-verify', { txRef })
      .then((result) => {
        if (cancelled) return
        setPaymentMessage(result.status === 'paid'
          ? 'Payment confirmed. Your membership is active.'
          : result.status === 'failed'
            ? 'Payment was not completed. You can try again below.'
            : 'Payment is still processing. Check again shortly.')
      })
      .catch((error: unknown) => {
        if (!cancelled) setPaymentMessage(error instanceof Error ? error.message : 'Could not verify payment status.')
      })
      .finally(() => {
        if (!cancelled) setPaymentBusy(false)
      })
    return () => { cancelled = true }
  }, [user, txRef])

  async function joinMembership(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user || !selectedTier) return
    setSubmitting(true)
    setFormError('')
    setMessage('')
    try {
      const result = await paymentRequest(user, 'pay-initiate', {
        tierId: selectedTier.id,
        fullName: fullName.trim(),
        phone: phone.trim(),
        email: email.trim(),
      })
      if (typeof result.checkoutUrl !== 'string' || !result.checkoutUrl.startsWith('https://')) {
        throw new Error('PayChangu returned an invalid checkout link.')
      }
      window.location.assign(result.checkoutUrl)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not start membership checkout.')
    } finally {
      setSubmitting(false)
    }
  }

  async function retryMembershipPayment() {
    if (!user || !currentMembership) return
    setPaymentBusy(true)
    setFormError('')
    try {
      const result = await paymentRequest(user, 'pay-initiate', {
        tierId: currentMembership.tierId,
        fullName: currentMembership.fullName,
        phone: currentMembership.phone,
        email: currentMembership.email,
      })
      if (typeof result.checkoutUrl !== 'string' || !result.checkoutUrl.startsWith('https://')) {
        throw new Error('PayChangu returned an invalid checkout link.')
      }
      window.location.assign(result.checkoutUrl)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not start membership checkout.')
    } finally {
      setPaymentBusy(false)
    }
  }

  return <>
    <PageHeader eyebrow="Join the club" title="Membership" description="Choose a tier and send a membership request." />
    {tiersResult.loading ? <div className="loading-list"><Skeleton /><Skeleton /></div>
      : tiersResult.error ? <p className="live-error" role="alert">Membership tiers could not be loaded: {tiersResult.error}</p>
        : tiers.length ? <section className="membership-tier-grid" aria-label="Membership tiers">
          {tiers.map((tier) => <Card className="membership-tier-card" key={tier.id} style={{ borderTop: `4px solid ${tier.colour || '#C9A227'}` }}>
            <div className="membership-tier-heading"><h2>{tier.name}</h2><span>{tier.durationMonths} months</span></div>
            <strong className="membership-price">MWK {Number(tier.priceMWK ?? 0).toLocaleString()}</strong>
            <ul className="membership-benefits">{(tier.benefits ?? []).map((benefit, index) => <li key={`${tier.id}-${index}`}>{benefit}</li>)}</ul>
            <Button type="button" disabled={isLoadingMembership || Boolean(currentMembership)} onClick={() => { setSelectedTierId(tier.id); setMessage(''); setFormError('') }}>Join {tier.name}</Button>
          </Card>)}
        </section>
          : <EmptyState icon={ShieldCheck} title="Membership unavailable" description="No active membership tiers are available right now." />}

    {membershipState.error && <p className="live-error" role="alert">{membershipState.error}</p>}
    {(paymentMessage || (txRef ? 'Checking payment status...' : '')) && <p className="membership-message" role="status">{paymentMessage || 'Checking payment status...'}</p>}
    {currentMembership && <Card className="membership-status-card">
      <h2>Membership request</h2>
      <p>Your {currentMembership.tierId} membership request is <strong>{currentMembership.status}</strong>.</p>
      {currentMembership.status === 'pending' && <Button type="button" disabled={paymentBusy} onClick={() => void retryMembershipPayment()}>{paymentBusy ? 'Checking payment...' : 'Continue to payment'}</Button>}
    </Card>}
    {message && <p className="membership-message" role="status">{message}</p>}
    {selectedTier && !currentMembership && <Card className="membership-join-card">
      <h2>Join {selectedTier.name}</h2>
      <p>MWK {Number(selectedTier.priceMWK ?? 0).toLocaleString()} for {selectedTier.durationMonths} months.</p>
      <form className="admin-form" onSubmit={(event) => void joinMembership(event)}>
        <label className="admin-field"><span>Full name</span><input name="fullName" autoComplete="name" required value={fullName} onChange={(event) => setFullName(event.target.value)} /></label>
        <label className="admin-field"><span>Phone</span><input name="phone" type="tel" autoComplete="tel" required value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
        <label className="admin-field"><span>Email</span><input name="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        {formError && <p className="live-error" role="alert">{formError}</p>}
        <div className="admin-actions"><Button type="submit" disabled={submitting || isLoadingMembership}>{submitting ? 'Submitting...' : 'Submit membership request'}</Button><Button type="button" variant="ghost" disabled={submitting} onClick={() => setSelectedTierId('')}>Cancel</Button></div>
      </form>
    </Card>}
  </>
}
