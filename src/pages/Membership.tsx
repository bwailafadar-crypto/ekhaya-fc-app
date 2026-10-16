import { useEffect, useState, type FormEvent } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import type { User } from 'firebase/auth'
import { Clock, ShieldCheck } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Button, Card, EmptyState, PageHeader, Skeleton } from '../components/UI'
import { useFirestoreCollection } from '../hooks/useFirestoreCollection'
import { useFlag } from '../hooks/useFlag'
import { db } from '../firebase'
import type { MembershipRecord, MembershipTier } from '../types'

type MembershipState = {
  uid: string | null
  membership: MembershipRecord | null
  loading: boolean
  error: string | null
}

type PaymentMethod = 'card' | 'bank_transfer' | 'airtel_money' | 'tnm_mpamba'

type InAppBrowserWindow = Window & {
  cordova?: {
    InAppBrowser?: {
      open: (url: string, target?: string, options?: string) => {
        addEventListener: (type: string, callback: (event: { url: string }) => void) => void
        close: () => void
      }
    }
  }
}

const tierOrder = ['basic', 'silver', 'gold', 'premium']
const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '')

function openCheckout(checkoutUrl: string, onReturn: (txRef: string) => void) {
  const inAppBrowser = (window as InAppBrowserWindow).cordova?.InAppBrowser
  if (!inAppBrowser) {
    window.location.assign(checkoutUrl)
    return
  }

  const browser = inAppBrowser.open(checkoutUrl, '_blank', 'location=yes')
  const appOrigin = new URL(apiBaseUrl || window.location.origin, window.location.href).origin
  browser.addEventListener('loadstart', ({ url }) => {
    try {
      const destination = new URL(url)
      if (destination.origin !== appOrigin) return
      const hashQuery = destination.hash.includes('?') ? destination.hash.slice(destination.hash.indexOf('?') + 1) : ''
      const txRef = new URLSearchParams(hashQuery).get('tx_ref') ?? destination.searchParams.get('tx_ref')
      if (!txRef) return
      browser.close()
      onReturn(txRef)
    } catch {
      return
    }
  })
}

async function paymentRequest(user: User, path: string, body: Record<string, string>) {
  const response = await fetch(`${apiBaseUrl}/.netlify/functions/${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${await user.getIdToken()}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const result = await response.json() as { error?: unknown; checkoutUrl?: unknown; status?: unknown; txRef?: unknown }
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Payment request failed.')
  return result
}

export default function Membership() {
  // Payments stay off ("Coming soon") until a superadmin switches them on in Admin → App health.
  const open = useFlag('membershipPayments')
  if (!open) return <MembershipComingSoon />
  return <MembershipJoin />
}

function MembershipComingSoon() {
  const tiersResult = useFirestoreCollection<MembershipTier>('membershipTiers')
  const tiers = tiersResult.items
    .filter((tier) => tier.active)
    .sort((left, right) => tierOrder.indexOf(left.id) - tierOrder.indexOf(right.id))
  return <div className="membership-page">
    <div className="membership-glow" aria-hidden="true"><span /><span /><span /></div>
    <PageHeader eyebrow="Join the club" title="Membership" />
    <Card className="membership-soon">
      <span className="membership-soon-badge"><Clock size={15} aria-hidden="true" /> Coming soon</span>
      <h2>Official Ekhaya FC membership is on its way</h2>
      <p>Soon you will join here and pay with Airtel Money, TNM Mpamba or card, and get your digital member card in the app. We will send an alert when it opens.</p>
      <p className="membership-soon-note">Already a club member from before the app? Your card is in <a href="#/profile">Fan Profile</a>.</p>
    </Card>
    {tiersResult.loading ? <div className="loading-list"><Skeleton /><Skeleton /></div>
      : tiers.length > 0 && <section className="membership-tier-grid" aria-label="Membership tiers (coming soon)">
        {tiers.map((tier) => <Card className={`membership-tier-card membership-tier-soon${tier.id === 'gold' ? ' recommended' : ''}`} key={tier.id}>
          <div className="membership-tier-heading"><h2>{tier.name}</h2><span>{tier.durationMonths} months</span></div>
          <strong className="membership-price">MWK {Number(tier.priceMWK ?? 0).toLocaleString()}</strong>
          <ul className="membership-benefits">{(Array.isArray(tier.benefits) ? tier.benefits : []).map((benefit, index) => <li key={`${tier.id}-${index}`}>{benefit}</li>)}</ul>
          <Button type="button" disabled>Coming soon</Button>
        </Card>)}
      </section>}
  </div>
}

function MembershipJoin() {
  const { user, profile } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const tiersResult = useFirestoreCollection<MembershipTier>('membershipTiers')
  const [selectedTierId, setSelectedTierId] = useState('')
  const [fullName, setFullName] = useState(profile?.fullName ?? user?.displayName ?? '')
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [email, setEmail] = useState(profile?.email ?? user?.email ?? '')
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>('card')
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
  const paymentMethodParam = searchParams.get('method')

  useEffect(() => {
    if (!user || !txRef) return
    const activeUser = user
    const activeTxRef = txRef
    let cancelled = false
    let timer: number | undefined
    let attempts = 0
    const isMobileMoney = paymentMethodParam === 'airtel_money' || paymentMethodParam === 'tnm_mpamba'

    async function checkPayment() {
      try {
        const result = await paymentRequest(activeUser, 'pay-verify', { txRef: activeTxRef })
        if (cancelled) return
        if (result.status === 'paid') {
          setPaymentMessage('Payment confirmed. Your membership is active.')
          setPaymentBusy(false)
        } else if (result.status === 'failed') {
          setPaymentMessage('Payment was not completed. You can try again below.')
          setPaymentBusy(false)
        } else if (isMobileMoney && attempts < 20) {
          attempts += 1
          setPaymentMessage('Approve the payment request on your phone. Checking status...')
          timer = window.setTimeout(() => void checkPayment(), 3000)
        } else {
          setPaymentMessage('Payment is still processing. Check again shortly.')
          setPaymentBusy(false)
        }
      } catch (error) {
        if (cancelled) return
        if (isMobileMoney && attempts < 20) {
          attempts += 1
          setPaymentMessage('Could not confirm the payment yet. Checking again...')
          timer = window.setTimeout(() => void checkPayment(), 3000)
        } else {
          setPaymentMessage(error instanceof Error ? error.message : 'Could not verify payment status.')
          setPaymentBusy(false)
        }
      }
    }

    void checkPayment()
    return () => {
      cancelled = true
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [user, txRef, paymentMethodParam])

  async function joinMembership(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user || !selectedTier) return
    setSubmitting(true)
    setFormError('')
    setMessage('')
    try {
      const isMobileMoney = selectedPaymentMethod === 'airtel_money' || selectedPaymentMethod === 'tnm_mpamba'
      const result = await paymentRequest(user, isMobileMoney ? 'pay-momo-initiate' : 'pay-initiate', {
        tierId: selectedTier.id,
        fullName: fullName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        method: selectedPaymentMethod,
      })
      if (isMobileMoney) {
        if (typeof result.txRef !== 'string') throw new Error('PayChangu did not return a payment reference.')
        setSearchParams({ tx_ref: result.txRef, method: selectedPaymentMethod })
        return
      }
      if (typeof result.checkoutUrl !== 'string' || !result.checkoutUrl.startsWith('https://')) {
        throw new Error('PayChangu returned an invalid checkout link.')
      }
      openCheckout(result.checkoutUrl, (returnedTxRef) => setSearchParams({ tx_ref: returnedTxRef, method: selectedPaymentMethod }))
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
        method: 'card',
      })
      if (typeof result.checkoutUrl !== 'string' || !result.checkoutUrl.startsWith('https://')) {
        throw new Error('PayChangu returned an invalid checkout link.')
      }
      openCheckout(result.checkoutUrl, (returnedTxRef) => setSearchParams({ tx_ref: returnedTxRef, method: 'card' }))
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not start membership checkout.')
    } finally {
      setPaymentBusy(false)
    }
  }

  return <div className="membership-page">
    <div className="membership-glow" aria-hidden="true"><span /><span /><span /></div>
    <PageHeader eyebrow="Join the club" title="Membership" description="Choose a tier and send a membership request." />
    {tiersResult.loading ? <div className="loading-list"><Skeleton /><Skeleton /></div>
      : tiersResult.error ? <p className="live-error" role="alert">Membership tiers could not be loaded: {tiersResult.error}</p>
        : tiers.length ? <section className="membership-tier-grid" aria-label="Membership tiers">
          {tiers.map((tier) => <Card className={`membership-tier-card${selectedTierId === tier.id ? ' selected' : ''}${tier.id === 'gold' ? ' recommended' : ''}`} key={tier.id}>
            <div className="membership-tier-heading"><h2>{tier.name}</h2>{tier.id === 'gold' && <span className="membership-tier-badge">Most popular</span>}<span>{tier.durationMonths} months</span></div>
            <strong className="membership-price">MWK {Number(tier.priceMWK ?? 0).toLocaleString()}</strong>
            <ul className="membership-benefits">{(Array.isArray(tier.benefits) ? tier.benefits : []).map((benefit, index) => <li key={`${tier.id}-${index}`}>{benefit}</li>)}</ul>
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
        <label className="admin-field"><span>Full name</span><input name="fullName" autoComplete="name" maxLength={120} required value={fullName} onChange={(event) => setFullName(event.target.value)} /></label>
        <label className="admin-field"><span>Phone</span><input name="phone" type="tel" autoComplete="tel" maxLength={32} required value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
        <label className="admin-field"><span>Email</span><input name="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <fieldset className="membership-payment-methods">
          <legend>Payment method</legend>
          {([
            ['card', 'Card'],
            ['bank_transfer', 'Bank transfer'],
            ['airtel_money', 'Airtel Money'],
            ['tnm_mpamba', 'TNM Mpamba'],
          ] as const).map(([value, label]) => <label key={value}>
            <input type="radio" name="paymentMethod" value={value} checked={selectedPaymentMethod === value} onChange={() => setSelectedPaymentMethod(value)} />
            <span>{label}</span>
          </label>)}
        </fieldset>
        {formError && <p className="live-error" role="alert">{formError}</p>}
        <div className="admin-actions"><Button type="submit" disabled={submitting || isLoadingMembership}>{submitting ? 'Submitting...' : 'Submit membership request'}</Button><Button type="button" variant="ghost" disabled={submitting} onClick={() => setSelectedTierId('')}>Cancel</Button></div>
      </form>
    </Card>}
  </div>
}
