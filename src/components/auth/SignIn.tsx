import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../integrations/supabase/client'

export default function SignIn() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) setError(error.message)
    setLoading(false)
    // On success, App.jsx picks up the session change and redirects automatically
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">

        <div className="auth-brand">
          <div className="auth-brand-icon">⚡</div>
          <span className="auth-brand-name">Stripe Demo</span>
        </div>

        <h1 className="auth-heading">Welcome back</h1>
        <p className="auth-sub">Sign in to access the integration dashboard.</p>

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
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="auth-footer">
          No account?{' '}
          <Link to="/signup">Create one</Link>
        </p>
      </div>
    </div>
  )
}
