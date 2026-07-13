import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../integrations/supabase/client'

export default function SignUp() {
  const [email,     setEmail]     = useState('')
  const [password,  setPassword]  = useState('')
  const [confirm,   setConfirm]   = useState('')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)
  const [success,   setSuccess]   = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (password.length < 6) {
      return setError('Password must be at least 6 characters.')
    }
    if (password !== confirm) {
      return setError('Passwords do not match.')
    }

    setLoading(true)

    const { error } = await supabase.auth.signUp({ email, password })

    if (error) {
      setError(error.message)
    } else {
      setSuccess(true)
    }
    setLoading(false)
  }

  if (success) {
    return (
      <div className="auth-wrap">
        <div className="auth-card">
          <div className="auth-brand">
            <div className="auth-brand-icon">⚡</div>
            <span className="auth-brand-name">Stripe Demo</span>
          </div>
          <div className="alert alert-success" style={{ marginBottom: 0 }}>
            <span>✓</span>
            <div>
              <strong>Account created.</strong>
              <br />
              Check <strong>{email}</strong> to confirm your address, then{' '}
              <Link to="/signin">sign in</Link>.
              <br />
              <small style={{ opacity: 0.8 }}>
                (Local Supabase: email confirmation can be disabled in{' '}
                <code>supabase/config.toml</code>)
              </small>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">

        <div className="auth-brand">
          <div className="auth-brand-icon">⚡</div>
          <span className="auth-brand-name">Stripe Demo</span>
        </div>

        <h1 className="auth-heading">Create an account</h1>
        <p className="auth-sub">Get started with the Stripe integration demo.</p>

        {error && (
          <div className="alert alert-error">
            <span>⚠</span> {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 6 characters"
              required
              autoComplete="new-password"
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirm">Confirm password</label>
            <input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="new-password"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="auth-footer">
          Already have an account?{' '}
          <Link to="/signin">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
