import { createContext, useContext, useState, useCallback } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import api from '../services/api'
import { readToken, readUser, persistSession, persistUser, clearSession } from '../services/authStorage'

const AuthContext = createContext(null)

// Identifies this client on the Sanctum token, so a web session is
// distinguishable from a phone in GET /devices. Kept stable — the backend
// stores it verbatim as the token name.
const WEB_DEVICE_NAME = 'Al-Raqi Web Dashboard'

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(() => readUser())
  const [token, setToken]     = useState(() => readToken())
  const [loading, setLoading] = useState(false)

  async function login(email, password, { remember = true } = {}) {
    setLoading(true)
    try {
      const res = await api.post('/login', {
        email,
        password,
        platform: 'web',
        device_name: WEB_DEVICE_NAME,
      })
      const { token: t, user: u } = res.data
      persistSession({ token: t, user: u, remember })
      setToken(t)
      setUser(u)
      return { ok: true, user: u }
    } catch (err) {
      const data = err.response?.data

      // The login throttle short-circuits the middleware, so its body is
      // assembled by LoginThrottle rather than the exception handler: `error`
      // is the stable code to branch on, `message` a ready-to-display Arabic
      // sentence, and `retry_after` the seconds still to wait (counting down,
      // not the full lockout).
      if (err.response?.status === 429) {
        const header = Number(err.response.headers?.['retry-after'])
        const body   = Number(data?.retry_after)
        const wait   = [body, header].find(v => Number.isFinite(v) && v > 0) ?? 60
        return {
          ok: false,
          code: data?.error ?? 'too_many_attempts',
          retryAfter: Math.ceil(wait),
          message: data?.message ?? 'تم تجاوز عدد محاولات تسجيل الدخول المسموح بها. يرجى المحاولة لاحقاً.',
        }
      }

      // Unknown email and wrong password answer identically by design — this
      // renders whatever the backend said without adding a second signal.
      const msg = data?.errors
        ? Object.values(data.errors).flat().join('، ')
        : (data?.message ?? 'حدث خطأ، حاول مرة أخرى')
      return { ok: false, code: data?.error, message: msg }
    } finally {
      setLoading(false)
    }
  }

  /**
   * Re-reads the authenticated user from GET /me and replaces the cached copy.
   *
   * Every permission below is derived from this object, and the route guards
   * read them through context, so refreshing it is what makes an admin who has
   * just edited their own role lose the pages they can no longer reach.
   */
  const refreshUser = useCallback(async () => {
    try {
      const res = await api.get('/me')
      const fresh = res.data?.user ?? res.data
      if (!fresh || typeof fresh !== 'object' || fresh.id == null) return null
      persistUser(fresh)
      setUser(fresh)
      return fresh
    } catch {
      return null
    }
  }, [])

  async function logout() {
    try { await api.post('/logout') } catch { /* ignore */ }
    clearSession()
    setToken(null)
    setUser(null)
    window.location.href = '/login'
  }

  const isAuthenticated = Boolean(token)
  const canViewAttendance = ['admin', 'manager', 'chief'].includes(user?.role) || !!user?.can_view_attendance
  // `attendance_check` is the backend permission behind every /api/attendance/*
  // write, so it gates the self-service pages verbatim — no role shortcut, or an
  // admin without the flag would reach a page that can only 403. Independent of
  // canViewAttendance, which is about seeing *other people's* records.
  const canCheckAttendance = !!user?.attendance_check

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated, loading, canViewAttendance, canCheckAttendance, login, logout, refreshUser }}>
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

export function RequireAttendanceAccess({ children }) {
  const { canViewAttendance } = useAuth()
  if (!canViewAttendance) {
    return <Navigate to="/dashboard" replace />
  }
  return children
}

export function RequireAttendanceCheck({ children }) {
  const { canCheckAttendance } = useAuth()
  if (!canCheckAttendance) {
    return <Navigate to="/dashboard" replace />
  }
  return children
}

export function RequireRole({ roles, children }) {
  const { user } = useAuth()
  const allowed = Array.isArray(roles) ? roles : [roles]
  if (!allowed.includes(user?.role)) {
    return <Navigate to="/dashboard" replace />
  }
  return children
}

export function RequireNotEmployee({ children }) {
  const { user } = useAuth()
  if (user?.role === 'employee') {
    return <Navigate to="/dashboard" replace />
  }
  return children
}
