import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BadgeCheck, Eye, EyeOff, ShieldCheck, Sparkles } from 'lucide-react'
import { authAPI } from '../api/client'
import agsLogo from '../assets/ags-logo-hero-dark.png'
import agsIcon from '../assets/ags-icon-512.png'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
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
          <img className="brand-logo" src={agsLogo} alt="American Green Solutions" />
          <p className="brand-sub">SolarOps intelligence layer</p>
        </div>

        <div className="login-headline">
          <h1>Run solar SOP work with faster, cited answers.</h1>
          <p>
            A focused internal assistant for Clean Leaf procedures, case workflows,
            alerts, scheduling, reports, and operational review.
          </p>
          <div className="hero-badge">
            <Sparkles size={16} />
            RAG assistant for AGS operations
          </div>
        </div>

        <div className="hero-signal-grid">
          <div>
            <BadgeCheck size={18} />
            <strong>Source cited</strong>
            <span>Answers stay grounded in indexed SOPs, operating notes, and uploaded source material.</span>
          </div>
          <div>
            <ShieldCheck size={18} />
            <strong>Role gated</strong>
            <span>Admins manage documents and access while SolarOps users stay focused in the assistant.</span>
          </div>
          <div>
            <Sparkles size={18} />
            <strong>Fast SOP lookup</strong>
            <span>Find case steps, alert handling, reports, and escalation guidance without searching PDFs.</span>
          </div>
          <div>
            <ShieldCheck size={18} />
            <strong>Ops ready</strong>
            <span>Built for repeated SolarOps workflows with saved chats, scoped knowledge, and model controls.</span>
          </div>
        </div>
      </section>

      <section className="login-panel" aria-label="Sign in">
        <div className="auth-card">
          <div className="auth-card-header">
            <img className="login-mark" src={agsIcon} alt="American Green Solutions" />
            <h1>
              <strong>AGS</strong>
              <span>Astra</span>
            </h1>
            <p>Where energy meets intelligence</p>
          </div>

          <form onSubmit={handleLogin} className="auth-form">
            <label>
              <span>Email</span>
              <div className="input-shell">
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
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={22} /> : <Eye size={22} />}
                </button>
              </div>
            </label>

            {error && <div className="error-banner">{error}</div>}

            <button type="submit" className="cta-button" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="login-footer">© 2026 American Green Solutions</p>
      </section>
    </main>
  )
}
