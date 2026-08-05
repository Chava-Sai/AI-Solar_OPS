import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { authAPI } from '../api/client'

const AuthContext = createContext(null)

/**
 * The session lives entirely in an httpOnly cookie the browser controls —
 * this app never sees the token itself. On mount it asks the backend who's
 * signed in via /auth/me; a 401 just means logged out, not an error.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    authAPI.me()
      .then(({ data }) => { if (!cancelled) setUser(data.user) })
      .catch(() => { if (!cancelled) setUser(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const refreshUser = useCallback((nextUser) => setUser(nextUser), [])

  const logout = useCallback(async () => {
    try { await authAPI.logout() } catch { /* cookie may already be gone — fine either way */ }
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, refreshUser, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
