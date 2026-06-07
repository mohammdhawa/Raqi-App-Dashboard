import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Mail, Eye, EyeOff, Lock, AlertCircle, Shield } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
  const { login, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [showPw, setShowPw]     = useState(false)
  const [error, setError]       = useState('')
  const [submitting, setSubmitting] = useState(false)

  const from = location.state?.from?.pathname || '/dashboard'

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email || !password) {
      setError('يرجى إدخال البريد الإلكتروني وكلمة المرور')
      return
    }
    setError('')
    setSubmitting(true)
    const result = await login(email, password)
    setSubmitting(false)
    if (result.ok) {
      navigate(from, { replace: true })
    } else {
      setError(result.message)
    }
  }

  return (
    <div
      dir="rtl"
      style={{
        minHeight: '100vh', display: 'flex',
        fontFamily: 'var(--font-sans)',
        background: 'var(--c-bg)',
      }}
    >
      {/* ── Right panel — brand ─────────────────────────────────────────── */}
      <div style={{
        flex: '0 0 46%',
        background: 'linear-gradient(160deg, #1A3354 0%, #224167 55%, #1C3A5E 100%)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '48px 40px',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Decorative circles */}
        <div style={{
          position: 'absolute', top: -80, right: -80,
          width: 320, height: 320, borderRadius: '50%',
          background: 'rgba(200,163,107,0.07)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: -100, left: -60,
          width: 280, height: 280, borderRadius: '50%',
          background: 'rgba(255,255,255,0.04)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: 120, right: 30,
          width: 140, height: 140, borderRadius: '50%',
          background: 'rgba(200,163,107,0.05)',
          pointerEvents: 'none',
        }} />

        {/* Logo */}
        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
          <div style={{
            width: 80, height: 80, borderRadius: 22,
            background: 'linear-gradient(135deg, var(--c-accent) 0%, #a8883a 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 28px',
            boxShadow: '0 8px 32px rgba(200,163,107,0.35)',
          }}>
            <Shield size={38} color="#fff" strokeWidth={1.8} />
          </div>

          <h1 style={{
            color: '#fff', fontSize: 26, fontWeight: 800, margin: '0 0 10px',
            letterSpacing: -0.3,
          }}>
            الراقي للاعتمادات
          </h1>
          <p style={{
            color: 'rgba(255,255,255,0.65)', fontSize: 14, lineHeight: 1.7,
            maxWidth: 260, margin: '0 auto',
          }}>
            منصة إدارة المستندات والموافقات المؤسسية
          </p>

          {/* Divider */}
          <div style={{
            margin: '32px auto',
            width: 48, height: 3, borderRadius: 3,
            background: 'var(--c-accent)',
            opacity: 0.8,
          }} />

          <p style={{
            color: 'rgba(255,255,255,0.4)', fontSize: 12.5,
            lineHeight: 1.8, maxWidth: 240, margin: '0 auto',
          }}>
            اعتمد مستنداتك بأمان وكفاءة<br />مع سجل تدقيق كامل لكل خطوة
          </p>
        </div>
      </div>

      {/* ── Left panel — login form ─────────────────────────────────────── */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '48px 40px', background: '#fff',
      }}>
        <div style={{ width: '100%', maxWidth: 400 }}>
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
              padding: '12px 14px', borderRadius: 12,
              background: 'var(--c-rejected-bg)',
              border: '1px solid rgba(211,47,47,0.25)',
              marginBottom: 20,
            }}>
              <AlertCircle size={16} style={{ color: 'var(--c-rejected)', flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 13, color: 'var(--c-rejected)', lineHeight: 1.5 }}>{error}</span>
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
                background: 'var(--c-surface)', border: `1.5px solid ${error ? 'rgba(211,47,47,0.4)' : 'var(--c-border)'}`,
                borderRadius: 12, padding: '0 14px',
                transition: 'border-color .15s',
              }}>
                <Mail size={15} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
                <input
                  type="email"
                  placeholder="example@company.com"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError('') }}
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
                background: 'var(--c-surface)', border: `1.5px solid ${error ? 'rgba(211,47,47,0.4)' : 'var(--c-border)'}`,
                borderRadius: 12, padding: '0 14px',
                transition: 'border-color .15s',
              }}>
                <Lock size={15} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
                <input
                  type={showPw ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError('') }}
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
                تذكرني
              </label>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting || loading}
              style={{
                width: '100%', height: 46, borderRadius: 12, border: 0,
                background: submitting ? 'rgba(34,65,103,0.7)' : 'var(--c-primary)',
                color: '#fff', fontSize: 14, fontWeight: 800,
                fontFamily: 'var(--font-sans)', cursor: submitting ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'background .15s, transform .1s',
                boxShadow: '0 4px 14px rgba(34,65,103,0.28)',
              }}
            >
              {submitting ? (
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
