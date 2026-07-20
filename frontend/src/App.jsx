import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Chat  from './pages/Chat'
import Admin from './pages/Admin'

const PrivateRoute = ({ children }) => {
  const token = localStorage.getItem('astra_token')
  return token ? children : <Navigate to="/login" replace />
}

const AdminRoute = ({ children }) => {
  const token = localStorage.getItem('astra_token')
  const user  = JSON.parse(localStorage.getItem('astra_user') || '{}')
  if (!token) return <Navigate to="/login" replace />
  if (!['manager', 'lead_analyst'].includes(user.role)) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/"      element={<PrivateRoute><Chat /></PrivateRoute>} />
      <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
      <Route path="*"      element={<Navigate to="/" replace />} />
    </Routes>
  )
}
