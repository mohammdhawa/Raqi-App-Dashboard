import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Mail, Eye, EyeOff, Lock, AlertCircle, Timer } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { readRemember } from '../services/authStorage'

/** mm:ss for the lockout countdown. */
function formatCountdown(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function LoginPage() {
  const { login, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(() => readRemember())
  const [showPw, setShowPw]     = useState(false)
  const [error, setError]       = useState('')
  const [submitting, setSubmitting] = useState(false)
  // Seconds left on a login-throttle lockout (429 `retry_after`). While this
  // is above zero the endpoint refuses the request before the credentials are
  // ever checked, so submitting is pointless — the form stays disabled.
  const [lockout, setLockout]   = useState(0)

  const requestedPath = location.state?.from?.pathname
  const locked = lockout > 0

  useEffect(() => {
    if (!locked) return
    const id = setInterval(() => setLockout(s => (s <= 1 ? 0 : s - 1)), 1000)
    return () => clearInterval(id)
  }, [locked])

  async function handleSubmit(e) {
    e.preventDefault()
    if (locked) return
    if (!email || !password) {
      setError('يرجى إدخال البريد الإلكتروني وكلمة المرور')
      return
    }
    setError('')
    setSubmitting(true)
    const result = await login(email, password, { remember })
    setSubmitting(false)
    if (result.ok) {
      setLockout(0)
      const defaultPath = result.user?.role === 'employee' && result.user?.attendance_check
        ? '/attendance'
        : '/dashboard'
      navigate(requestedPath || defaultPath, { replace: true })
    } else {
      if (result.code === 'too_many_attempts') setLockout(result.retryAfter ?? 60)
      setError(result.message)
    }
  }

  return (
    <div
      dir="rtl"
      className="flex flex-col lg:flex-row"
      style={{
        minHeight: '100vh',
        fontFamily: 'var(--font-sans)',
        background: 'var(--c-bg)',
      }}
    >
      {/* ── Right panel — brand (hidden on narrow screens) ──────────────── */}
      <div
        className="hidden lg:flex lg:flex-col lg:items-center lg:justify-center"
        style={{
          flex: '0 0 46%',
          background: 'var(--c-primary)',
          padding: '48px 40px',
          position: 'relative', overflow: 'hidden',
          /* Sunaa signature 05: bronze base rule under a dark block */
          borderBottom: '4px solid var(--c-accent)',
        }}
      >
        {/* Signature 02: hairline site grid */}
        <div className="site-grid-dark" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />

        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
          <img
            src="/assets/sunaa-mark-on-dark.png"
            alt="صنع للإنشاءات"
            style={{ width: 132, height: 132, objectFit: 'contain', display: 'block', margin: '0 auto 28px' }}
          />

          <h1 style={{ color: '#fff', fontSize: 30, fontWeight: 700, margin: '0 0 6px', letterSpacing: -0.3 }}>
            صنع للإنشاءات
          </h1>
          <div style={{
            color: 'var(--c-accent-on-dark)', fontFamily: 'var(--font-mono)',
            fontSize: 12, fontWeight: 500, letterSpacing: 3, marginBottom: 22,
          }}>
            SUNAA CONSTRUCTION
          </div>
          <p style={{
            color: 'rgba(255,255,255,0.85)', fontSize: 14.5, lineHeight: 1.7,
            maxWidth: 280, margin: '0 auto',
          }}>
            منصة إدارة المستندات والموافقات المؤسسية
          </p>

          {/* Signature 06: block progress as the divider */}
          <div style={{ display: 'flex', gap: 4, justifyContent: 'center', margin: '30px auto' }}>
            <span style={{ width: 28, height: 5, background: 'var(--c-accent)' }} />
            <span style={{ width: 28, height: 5, background: 'var(--c-accent)' }} />
            <span style={{ width: 28, height: 5, background: 'rgba(255,255,255,0.22)' }} />
          </div>

          <p style={{
            color: 'rgba(255,255,255,0.66)', fontSize: 13,
            lineHeight: 1.8, maxWidth: 240, margin: '0 auto',
          }}>
            اعتمد مستنداتك بأمان وكفاءة<br />مع سجل تدقيق كامل لكل خطوة
          </p>
        </div>
      </div>

      {/* ── Left panel — login form ─────────────────────────────────────── */}
      <div
        className="flex items-center justify-center px-6 py-10 sm:px-10 sm:py-12"
        style={{ flex: 1, background: '#fff' }}
      >
        <div style={{ width: '100%', maxWidth: 400 }}>
          {/* Mark, shown where the brand panel is hidden */}
          <img
            src="/assets/sunaa-mark.png" alt="صنع للإنشاءات" className="lg:hidden"
            style={{ width: 56, height: 56, objectFit: 'contain', marginBottom: 20 }}
          />
          {/* Form heading */}
          <div style={{ marginBottom: 32 }}>
            <h2 style={{
              fontSize: 22, fontWeight: 800, color: 'var(--c-text)',
              margin: '0 0 8px',
            }}>
              تسجيل الدخول
            </h2>
            <p style={{ fontSize: 13.5, color: 'var(--c-text-2)', margin: 0 }}>
              أدخل بريدك الإلكتروني وكلمة المرور للمتابعة
            </p>
          </div>

          {/* Error alert */}
          {error && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '12px 14px', borderRadius: 8,
              background: 'var(--c-rejected-bg)',
              border: '1px solid rgba(211,47,47,0.25)',
              marginBottom: 20,
            }}>
              <AlertCircle size={16} style={{ color: 'var(--c-rejected)', flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 13, color: 'var(--c-rejected)', lineHeight: 1.5 }}>
                {error}
                {locked && (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6,
                    fontWeight: 800, fontVariantNumeric: 'tabular-nums',
                  }}>
                    <Timer size={14} />
                    يمكنك المحاولة بعد {formatCountdown(lockout)}
                  </div>
                )}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            {/* Email */}
            <div style={{ marginBottom: 16 }}>
              <label style={{
                display: 'block', fontSize: 12.5, fontWeight: 700,
                color: 'var(--c-text)', marginBottom: 7,
              }}>
                البريد الإلكتروني
              </label>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 9, height: 46,
                background: '#fff', border: `1.5px solid ${error ? 'rgba(211,47,47,0.4)' : 'var(--c-border)'}`,
                borderRadius: 8, padding: '0 14px',
                transition: 'border-color .15s',
              }}>
                <Mail size={15} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
                <input
                  type="email"
                  placeholder="example@company.com"
                  value={email}
                  onChange={e => { setEmail(e.target.value); if (!locked) setError('') }}
                  autoComplete="email"
                  style={{
                    flex: 1, border: 0, outline: 0, background: 'transparent',
                    fontFamily: 'var(--font-sans)', fontSize: 13.5,
                    color: 'var(--c-text)', direction: 'ltr', textAlign: 'left',
                  }}
                />
              </div>
            </div>

            {/* Password */}
            <div style={{ marginBottom: 20 }}>
              <label style={{
                display: 'block', fontSize: 12.5, fontWeight: 700,
                color: 'var(--c-text)', marginBottom: 7,
              }}>
                كلمة المرور
              </label>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 9, height: 46,
                background: '#fff', border: `1.5px solid ${error ? 'rgba(211,47,47,0.4)' : 'var(--c-border)'}`,
                borderRadius: 8, padding: '0 14px',
                transition: 'border-color .15s',
              }}>
                <Lock size={15} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
                <input
                  type={showPw ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => { setPassword(e.target.value); if (!locked) setError('') }}
                  autoComplete="current-password"
                  style={{
                    flex: 1, border: 0, outline: 0, background: 'transparent',
                    fontFamily: 'var(--font-sans)', fontSize: 13.5,
                    color: 'var(--c-text)', direction: 'ltr', textAlign: 'left',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  style={{
                    background: 'none', border: 0, padding: 2, cursor: 'pointer',
                    color: 'var(--c-text-3)', display: 'flex', alignItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Remember me */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 9,
              marginBottom: 24,
            }}>
              <input
                id="remember"
                type="checkbox"
                checked={remember}
                onChange={e => setRemember(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: 'var(--c-primary)', cursor: 'pointer' }}
              />
              <label
                htmlFor="remember"
                style={{ fontSize: 13, color: 'var(--c-text-2)', cursor: 'pointer' }}
              >
                تذكرني على هذا الجهاز
              </label>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting || loading || locked}
              style={{
                width: '100%', height: 46, borderRadius: 8, border: 0,
                background: (submitting || locked) ? 'rgba(29,84,70,0.7)' : 'var(--c-primary)',
                color: '#fff', fontSize: 14, fontWeight: 800,
                fontFamily: 'var(--font-sans)',
                cursor: locked ? 'not-allowed' : submitting ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'background .15s, transform .1s',
                boxShadow: 'none',
              }}
            >
              {locked ? (
                <>
                  <Timer size={16} />
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                    المحاولة متاحة بعد {formatCountdown(lockout)}
                  </span>
                </>
              ) : submitting ? (
                <>
                  <span style={{
                    width: 16, height: 16, borderRadius: '50%',
                    border: '2.5px solid rgba(255,255,255,0.3)',
                    borderTopColor: '#fff',
                    display: 'inline-block',
                    animation: 'spin .7s linear infinite',
                  }} />
                  جارٍ تسجيل الدخول...
                </>
              ) : 'تسجيل الدخول'}
            </button>
          </form>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>
    </div>
  )
}
