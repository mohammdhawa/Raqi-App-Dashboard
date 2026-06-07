import { createContext, useContext, useState, useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import api from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(() => {
    try { return JSON.parse(localStorage.getItem('auth_user')) } catch { return null }
  })
  const [token, setToken]     = useState(() => localStorage.getItem('auth_token'))
  const [loading, setLoading] = useState(false)

  async function login(email, password) {
    setLoading(true)
    try {
      const res = await api.post('/login', { email, password })
      const { token: t, user: u } = res.data
      localStorage.setItem('auth_token', t)
      localStorage.setItem('auth_user', JSON.stringify(u))
      setToken(t)
      setUser(u)
      return { ok: true }
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        (err.response?.data?.errors
          ? Object.values(err.response.data.errors).flat().join('، ')
          : 'حدث خطأ، حاول مرة أخرى')
      return { ok: false, message: msg }
    } finally {
      setLoading(false)
    }
  }

  async function logout() {
    try { await api.post('/logout') } catch { /* ignore */ }
    localStorage.removeItem('auth_token')
    localStorage.removeItem('auth_user')
    setToken(null)
    setUser(null)
    window.location.href = '/login'
  }

  const isAuthenticated = Boolean(token)

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

export function RequireAuth({ children }) {
  const { isAuthenticated } = useAuth()
  const location = useLocation()
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  return children
}
