import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

/* ─── helper: invoke an edge function and follow the redirect URL if present ─ */
async function invokeEdgeFn(name, body = {}) {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) throw error
  return data
}

export default function Dashboard({ session }) {
  const user = session.user

  const [message,        setMessage]        = useState(null)   // { type, text }
  const [connectLoading, setConnectLoading] = useState(false)
  const [checkoutLoading,setCheckoutLoading]= useState(false)
  const [portalLoading,  setPortalLoading]  = useState(false)

  // Pick up Stripe Connect redirect result from URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const connect = params.get('connect')
    if (connect === 'success') {
      setMessage({ type: 'success', text: '✓ Stripe account connected successfully!' })
      window.history.replaceState({}, '', '/dashboard')
    } else if (connect === 'refresh') {
      setMessage({ type: 'warning', text: '⚠ Connection link expired. Please try again.' })
      window.history.replaceState({}, '', '/dashboard')
    }
  }, [])

  const handleSignOut = () => supabase.auth.signOut()

  /* ── Stripe Connect ──────────────────────────────────────────────────────── */
  const handleConnect = async () => {
    setConnectLoading(true)
    setMessage(null)
    try {
      const data = await invokeEdgeFn('stripe-connect', { userId: user.id })
      if (data?.url) window.location.href = data.url
      else throw new Error('No redirect URL returned from edge function.')
    } catch (err) {
      setMessage({ type: 'error', text: `Connect failed: ${err.message}` })
    } finally {
      setConnectLoading(false)
    }
  }

  /* ── Stripe Checkout ─────────────────────────────────────────────────────── */
  const handleCheckout = async () => {
    setCheckoutLoading(true)
    setMessage(null)
    try {
      const data = await invokeEdgeFn('stripe-checkout', {
        userId: user.id,
        // Add your priceId / lineItems here when you wire up the real function
        // priceId: 'price_xxx',
      })
      if (data?.url) window.location.href = data.url
      else throw new Error('No checkout URL returned from edge function.')
    } catch (err) {
      setMessage({ type: 'error', text: `Checkout failed: ${err.message}` })
    } finally {
      setCheckoutLoading(false)
    }
  }

  /* ── Customer Portal ─────────────────────────────────────────────────────── */
  const handlePortal = async () => {
    setPortalLoading(true)
    setMessage(null)
    try {
      const data = await invokeEdgeFn('stripe-portal', { userId: user.id })
      if (data?.url) window.location.href = data.url
      else throw new Error('No portal URL returned from edge function.')
    } catch (err) {
      setMessage({ type: 'error', text: `Portal failed: ${err.message}` })
    } finally {
      setPortalLoading(false)
    }
  }

  const firstName = user.email?.split('@')[0] ?? 'there'

  return (
    <div className="dash-layout">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="dash-header">
        <div className="dash-logo">
          <div className="dash-logo-icon">⚡</div>
          Stripe Demo
        </div>
        <div className="dash-user">
          <span className="dash-user-email">{user.email}</span>
          <button className="btn btn-danger" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </header>

      {/* ── Main ────────────────────────────────────────────────────────────── */}
      <main className="dash-main">

        <div className="dash-greeting">
          <h1>Hey, {firstName} 👋</h1>
          <p>Trigger your Stripe edge functions below.</p>
        </div>

        {/* Status banner */}
        {message && (
          <div className={`alert alert-${message.type} dash-alert`}>
            {message.text}
          </div>
        )}

        {/* ── Integration cards ──────────────────────────────────────────── */}
        <p className="section-label">Stripe Integrations</p>

        <div className="int-grid">

          {/* Card 1 — Stripe Connect */}
          <div className="int-card">
            <div className="int-card-icon icon-purple">🔗</div>
            <div className="int-card-body">
              <h3>Stripe Connect</h3>
              <p>
                Onboard a connected Stripe account via Express OAuth. Opens
                the Stripe Connect flow and redirects back on completion.
              </p>
              <span className="fn-badge">fn: stripe-connect</span>
            </div>
            <button
              className="btn btn-stripe"
              onClick={handleConnect}
              disabled={connectLoading}
            >
              {connectLoading ? 'Redirecting…' : 'Connect Stripe Account'}
            </button>
          </div>

          {/* Card 2 — Checkout */}
          <div className="int-card">
            <div className="int-card-icon icon-green">🛒</div>
            <div className="int-card-body">
              <h3>Checkout Session</h3>
              <p>
                Create a Stripe Checkout session and redirect the user to
                the hosted payment page to complete a purchase.
              </p>
              <span className="fn-badge">fn: stripe-checkout</span>
            </div>
            <button
              className="btn btn-outline-stripe"
              onClick={handleCheckout}
              disabled={checkoutLoading}
            >
              {checkoutLoading ? 'Creating session…' : 'Start Checkout'}
            </button>
          </div>

          {/* Card 3 — Customer Portal */}
          <div className="int-card">
            <div className="int-card-icon icon-orange">📋</div>
            <div className="int-card-body">
              <h3>Customer Portal</h3>
              <p>
                Open the Stripe Billing Portal so the customer can manage
                their subscription, invoices, and payment methods.
              </p>
              <span className="fn-badge">fn: stripe-portal</span>
            </div>
            <button
              className="btn btn-outline-stripe"
              onClick={handlePortal}
              disabled={portalLoading}
            >
              {portalLoading ? 'Opening portal…' : 'Open Billing Portal'}
            </button>
          </div>

        </div>

        {/* ── Session info ───────────────────────────────────────────────── */}
        <p className="section-label">Session Info</p>

        <div className="info-panel">
          <div className="info-panel-heading">
            <span className="status-dot status-active">Active session</span>
          </div>

          <div className="info-row">
            <span className="info-row-label">User ID</span>
            <span className="info-row-value">{user.id}</span>
          </div>
          <div className="info-row">
            <span className="info-row-label">Email</span>
            <span className="info-row-value">{user.email}</span>
          </div>
          <div className="info-row">
            <span className="info-row-label">Provider</span>
            <span className="info-row-value">
              {user.app_metadata?.provider ?? 'email'}
            </span>
          </div>
          <div className="info-row">
            <span className="info-row-label">Supabase URL</span>
            <span className="info-row-value">
              {import.meta.env.VITE_SUPABASE_URL}
            </span>
          </div>
        </div>

      </main>
    </div>
  )
}
