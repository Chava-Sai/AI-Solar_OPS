import { useMemo, useState } from 'react'
import { ArrowLeft, CheckCircle2, KeyRound, LogOut, Save, UserRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { authAPI } from '../api/client'
import agsLogo from '../assets/ags-logo-hero-dark.png'

export default function Settings() {
  const navigate = useNavigate()
  const initialUser = useMemo(() => JSON.parse(localStorage.getItem('astra_user') || '{}'), [])
  const [user, setUser] = useState(initialUser)
  const [name, setName] = useState(initialUser.name || '')
  const [nameState, setNameState] = useState({ saving: false, error: '', done: false })
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' })
  const [passwordState, setPasswordState] = useState({ saving: false, error: '', done: false })
  const mustChangePassword = Boolean(user.must_change_password)

  function storeSession(data) {
    localStorage.setItem('astra_token', data.access_token)
    localStorage.setItem('astra_user', JSON.stringify(data.user))
    setUser(data.user)
  }

  async function saveName(event) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setNameState({ saving: false, error: "Name can't be empty.", done: false })
      return
    }

    setNameState({ saving: true, error: '', done: false })
    try {
      const { data } = await authAPI.updateProfile(trimmed)
      storeSession(data)
      setNameState({ saving: false, error: '', done: true })
    } catch (error) {
      setNameState({
        saving: false,
        error: error.response?.data?.detail || 'Could not update your name.',
        done: false,
      })
    }
  }

  async function savePassword(event) {
    event.preventDefault()
    if (passwords.next.length < 10) {
      setPasswordState({ saving: false, error: 'Use at least 10 characters.', done: false })
      return
    }
    if (passwords.next === passwords.current) {
      setPasswordState({ saving: false, error: 'Choose a password different from the temporary password.', done: false })
      return
    }
    if (passwords.next !== passwords.confirm) {
      setPasswordState({ saving: false, error: 'New passwords do not match.', done: false })
      return
    }

    setPasswordState({ saving: true, error: '', done: false })
    try {
      const { data } = await authAPI.changePassword(passwords.current, passwords.next)
      storeSession(data)
      setPasswords({ current: '', next: '', confirm: '' })
      setPasswordState({ saving: false, error: '', done: true })
      if (mustChangePassword) setTimeout(() => navigate('/', { replace: true }), 700)
    } catch (error) {
      setPasswordState({
        saving: false,
        error: error.response?.data?.detail || 'Could not update your password.',
        done: false,
      })
    }
  }

  function logout() {
    localStorage.removeItem('astra_token')
    localStorage.removeItem('astra_user')
    navigate('/login', { replace: true })
  }

  return (
    <main className="settings-page">
      <header className="settings-suitebar">
        <button
          className="suite-round"
          onClick={() => navigate('/')}
          disabled={mustChangePassword}
          title={mustChangePassword ? 'Change your temporary password first' : 'Back to chat'}
          aria-label="Back to chat"
        >
          <ArrowLeft size={19} />
        </button>
        <div className="suite-title"><strong>AGS</strong><span>Astra</span></div>
        <button className="settings-logout" onClick={logout}>
          <LogOut size={16} />
          Sign out
        </button>
      </header>

      <section className="settings-content">
        <div className="settings-heading">
          <img src={agsLogo} alt="American Green Solutions" />
          <div>
            <p>Account security</p>
            <h1>{mustChangePassword ? 'Set your private password' : 'Account settings'}</h1>
            <span>
              {mustChangePassword
                ? 'Replace the temporary password before entering SolarOps.'
                : 'Manage your profile and sign-in password.'}
            </span>
          </div>
        </div>

        <div className={`settings-grid ${mustChangePassword ? 'single' : ''}`}>
          {!mustChangePassword && (
            <section className="ops-card settings-card">
              <div className="card-heading">
                <div className="card-icon"><UserRound size={20} /></div>
                <div>
                  <h2>Profile</h2>
                  <p>Update the name shown in Astra.</p>
                </div>
              </div>
              <form className="auth-form" onSubmit={saveName}>
                <label>
                  <span>Display name</span>
                  <input value={name} onChange={(event) => setName(event.target.value)} />
                </label>
                <label>
                  <span>Email</span>
                  <input value={user.email || ''} disabled />
                </label>
                {nameState.error && <div className="error-banner">{nameState.error}</div>}
                {nameState.done && <div className="success-banner"><CheckCircle2 size={16} />Name saved.</div>}
                <button className="cta-button" type="submit" disabled={nameState.saving}>
                  <Save size={16} />
                  {nameState.saving ? 'Saving...' : 'Save profile'}
                </button>
              </form>
            </section>
          )}

          <section className="ops-card settings-card">
            <div className="card-heading">
              <div className="card-icon"><KeyRound size={20} /></div>
              <div>
                <h2>{mustChangePassword ? 'Create password' : 'Change password'}</h2>
                <p>Use at least 10 characters and avoid shared team passwords.</p>
              </div>
            </div>
            <form className="auth-form" onSubmit={savePassword}>
              <label>
                <span>{mustChangePassword ? 'Temporary password' : 'Current password'}</span>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={passwords.current}
                  onChange={(event) => setPasswords((value) => ({ ...value, current: event.target.value }))}
                />
              </label>
              <label>
                <span>New password</span>
                <input
                  type="password"
                  required
                  minLength={10}
                  autoComplete="new-password"
                  value={passwords.next}
                  onChange={(event) => setPasswords((value) => ({ ...value, next: event.target.value }))}
                />
              </label>
              <label>
                <span>Confirm new password</span>
                <input
                  type="password"
                  required
                  minLength={10}
                  autoComplete="new-password"
                  value={passwords.confirm}
                  onChange={(event) => setPasswords((value) => ({ ...value, confirm: event.target.value }))}
                />
              </label>
              {passwordState.error && <div className="error-banner">{passwordState.error}</div>}
              {passwordState.done && <div className="success-banner"><CheckCircle2 size={16} />Password updated.</div>}
              <button className="cta-button" type="submit" disabled={passwordState.saving}>
                <KeyRound size={16} />
                {passwordState.saving ? 'Updating...' : mustChangePassword ? 'Set password and continue' : 'Update password'}
              </button>
            </form>
          </section>
        </div>
      </section>
    </main>
  )
}
