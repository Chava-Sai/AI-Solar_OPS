import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Chat  from './pages/Chat'
import Admin from './pages/Admin'
import Settings from './pages/Settings'
import { useAuth } from './context/AuthContext'

// Session state resolves async now (a GET /auth/me round trip against the
// httpOnly cookie, not a synchronous localStorage read) — every guard has to
// wait for that before it can decide anything.
function SessionGate({ children }) {
  const { loading } = useAuth()
  if (loading) return <div className="session-loading" aria-hidden="true" />
  return children
}

const PrivateRoute = ({ children }) => {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (user.must_change_password) return <Navigate to="/settings" replace />
  return children
}

const AuthenticatedRoute = ({ children }) => {
  const { user } = useAuth()
  return user ? children : <Navigate to="/login" replace />
}

const AdminRoute = ({ children }) => {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (user.must_change_password) return <Navigate to="/settings" replace />
  if (user.role !== 'admin') return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <SessionGate>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/settings" element={<AuthenticatedRoute><Settings /></AuthenticatedRoute>} />
        <Route path="/"      element={<PrivateRoute><Chat /></PrivateRoute>} />
        <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
        <Route path="*"      element={<Navigate to="/" replace />} />
      </Routes>
    </SessionGate>
  )
}
