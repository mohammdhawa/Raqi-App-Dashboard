import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { CheckCircle, XCircle, Info, X } from 'lucide-react'

const ToastContext = createContext(null)

const VARIANTS = {
  success: {
    icon: CheckCircle,
    bg: 'var(--c-approved-bg)',
    border: 'var(--c-approved)',
    color: 'var(--c-approved)',
    label: 'نجاح',
  },
  error: {
    icon: XCircle,
    bg: 'var(--c-rejected-bg)',
    border: 'var(--c-rejected)',
    color: 'var(--c-rejected)',
    label: 'خطأ',
  },
  info: {
    icon: Info,
    bg: 'rgba(34,65,103,0.06)',
    border: 'var(--c-primary)',
    color: 'var(--c-primary)',
    label: 'معلومة',
  },
}

let _id = 0

function ToastItem({ toast, onRemove }) {
  const [visible, setVisible] = useState(false)
  const v = VARIANTS[toast.variant] ?? VARIANTS.info
  const Icon = v.icon

  useEffect(() => {
    const show = requestAnimationFrame(() => setVisible(true))
    const hide = setTimeout(() => {
      setVisible(false)
      setTimeout(() => onRemove(toast.id), 320)
    }, toast.duration ?? 4000)
    return () => { cancelAnimationFrame(show); clearTimeout(hide) }
  }, [toast.id, toast.duration, onRemove])

  return (
    <div
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '12px 14px', borderRadius: 12, maxWidth: 340,
        background: '#fff',
        border: `1px solid ${v.border}`,
        boxShadow: '0 4px 16px rgba(27,42,65,0.13)',
        transform: visible ? 'translateX(0)' : 'translateX(30px)',
        opacity: visible ? 1 : 0,
        transition: 'transform .28s cubic-bezier(.22,.68,0,1.2), opacity .24s ease',
        direction: 'rtl',
      }}
    >
      <div style={{
        width: 32, height: 32, borderRadius: 9, flexShrink: 0,
        background: v.bg, color: v.color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={16} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: v.color, marginBottom: 2 }}>{v.label}</div>
        <div style={{ fontSize: 12.5, color: 'var(--c-text)', lineHeight: 1.5 }}>{toast.message}</div>
      </div>
      <button
        onClick={() => { setVisible(false); setTimeout(() => onRemove(toast.id), 320) }}
        style={{
          width: 22, height: 22, borderRadius: 6, border: 0, background: 'transparent',
          color: 'var(--c-text-3)', cursor: 'pointer', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 0,
        }}
      >
        <X size={13} />
      </button>
    </div>
  )
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const remove = useCallback(id => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const push = useCallback((message, variant = 'info', duration = 4000) => {
    const id = ++_id
    setToasts(prev => [...prev, { id, message, variant, duration }])
  }, [])

  const toast = {
    success: (msg, dur) => push(msg, 'success', dur),
    error:   (msg, dur) => push(msg, 'error', dur),
    info:    (msg, dur) => push(msg, 'info', dur),
  }

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div style={{
        position: 'fixed', bottom: 24, left: 24, zIndex: 9999,
        display: 'flex', flexDirection: 'column', gap: 10,
        pointerEvents: 'none',
      }}>
        {toasts.map(t => (
          <div key={t.id} style={{ pointerEvents: 'auto' }}>
            <ToastItem toast={t} onRemove={remove} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
