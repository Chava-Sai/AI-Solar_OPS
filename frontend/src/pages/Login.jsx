import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, BadgeCheck, LockKeyhole, Mail, ShieldCheck, Sparkles, Zap } from 'lucide-react'
import { authAPI } from '../api/client'

const ROLE_LABELS = {
  manager: 'Manager',
  lead_analyst: 'Lead Analyst',
  solar_analyst: 'Analyst',
}

const DEMO_USERS = [
  { email: 'test1@ags.com', role: 'manager' },
  { email: 'test2@ags.com', role: 'lead_analyst' },
  { email: 'test4@ags.com', role: 'solar_analyst' },
]

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await authAPI.login(email, password)
      localStorage.setItem('astra_token', data.access_token)
      localStorage.setItem('astra_user', JSON.stringify(data.user))
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed. Check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-hero">
        <div className="brand-lockup large">
          <div className="brand-mark">
            <Zap size={23} />
          </div>
          <div>
            <p className="brand-name">Astra AI</p>
            <p className="brand-sub">SolarOps intelligence layer</p>
          </div>
        </div>

        <div className="login-headline">
          <div className="hero-badge">
            <Sparkles size={16} />
            RAG assistant for AGS operations
          </div>
          <h1>Run solar SOP work with faster, cited answers.</h1>
          <p>
            A focused internal assistant for Clean Leaf procedures, case workflows,
            alerts, scheduling, reports, and operational review.
          </p>
        </div>

        <div className="hero-signal-grid">
          <div>
            <BadgeCheck size={18} />
            <strong>Source cited</strong>
            <span>Every response can trace back to ingested SOP content.</span>
          </div>
          <div>
            <ShieldCheck size={18} />
            <strong>Role gated</strong>
            <span>Managers and leads manage documents; analysts stay in chat.</span>
          </div>
        </div>
      </section>

      <section className="login-panel" aria-label="Sign in">
        <div className="auth-card">
          <div className="auth-card-header">
            <p className="eyebrow">Secure workspace</p>
            <h2>Sign in</h2>
            <span>Use the demo accounts below for the Vercel walkthrough.</span>
          </div>

          <form onSubmit={handleLogin} className="auth-form">
            <label>
              <span>Email</span>
              <div className="input-shell">
                <Mail size={17} />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@ags.com"
                />
              </div>
            </label>

            <label>
              <span>Password</span>
              <div className="input-shell">
                <LockKeyhole size={17} />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="test1234"
                />
              </div>
            </label>

            {error && <div className="error-banner">{error}</div>}

            <button type="submit" className="cta-button" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in'}
              <ArrowRight size={17} />
            </button>
          </form>

          <div className="demo-box">
            <div className="demo-box-header">
              <span>Demo accounts</span>
              <small>Password: test1234</small>
            </div>
            {DEMO_USERS.map((u) => (
              <button
                key={u.email}
                className="demo-account"
                onClick={() => {
                  setEmail(u.email)
                  setPassword('test1234')
                }}
              >
                <span>{u.email}</span>
                <strong>{ROLE_LABELS[u.role]}</strong>
              </button>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}
