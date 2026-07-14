import { useState, useEffect } from 'react'
import api from '../services/api'
import { useToast } from '../components/ui/Toast'
import { extractErrorMessage } from '../components/documents/shared'
import {
  Megaphone, Send, AlertTriangle, Bell, Loader2, CheckCircle2, Users, X,
} from 'lucide-react'

// POST /admin/notifications/broadcast — admin-only. Answers 202 (not 200): the
// per-user rows and pushes are produced by a queued job, so recipients don't
// appear in /notifications until a worker drains the queue.
const MAX_TITLE = 255
const MAX_BODY = 1500

const cardStyle = {
  background: '#fff', border: '1px solid var(--c-border)', borderRadius: 16,
  boxShadow: 'var(--sh-card)', overflow: 'hidden', marginBottom: 20,
}
const cardHeaderStyle = {
  padding: '14px 20px', borderBottom: '1px solid var(--c-border)',
  display: 'flex', alignItems: 'center', gap: 9,
}

function FieldWrap({ label, required, error, hint, count, max, children }) {
  const over = count > max
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 7 }}>
        <label style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--c-text)' }}>
          {label}
          {required && <span style={{ color: 'var(--c-rejected)', marginInlineStart: 3 }}>*</span>}
        </label>
        {max != null && (
          <span style={{
            fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
            color: over ? 'var(--c-rejected)' : 'var(--c-text-3)',
          }}>
            {count} / {max}
          </span>
        )}
      </div>
      {children}
      {hint && !error && <div style={{ fontSize: 11.5, color: 'var(--c-text-3)', marginTop: 5, lineHeight: 1.6 }}>{hint}</div>}
      {error && <div style={{ fontSize: 11.5, color: 'var(--c-rejected)', marginTop: 5 }}>{error}</div>}
    </div>
  )
}

const inputBase = {
  width: '100%', boxSizing: 'border-box', background: 'var(--c-surface)',
  borderRadius: 10, padding: '11px 12px', outline: 'none',
  fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--c-text)',
}

// ── Live preview — mirrors how a row renders in the Topbar notifications panel ─

function Preview({ title, body }) {
  return (
    <div style={{ ...cardStyle, marginBottom: 0 }}>
      <div style={cardHeaderStyle}>
        <Bell size={15} style={{ color: 'var(--c-text-3)' }} />
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--c-text)' }}>معاينة الإشعار</span>
      </div>
      <div style={{ padding: 20 }}>
        <div style={{
          display: 'flex', gap: 10, padding: '12px 14px', borderRadius: 12,
          background: 'var(--c-primary-light)', border: '1px solid var(--c-border)',
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 9, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--c-accent-tint)', color: '#8A6A23',
          }}>
            <Megaphone size={15} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{
              fontSize: 13, fontWeight: 700, color: 'var(--c-text)',
              lineHeight: 1.5, overflowWrap: 'anywhere',
            }}>
              {title.trim() || <span style={{ color: 'var(--c-text-3)', fontWeight: 400 }}>عنوان الإشعار…</span>}
            </div>
            {body.trim() && (
              <div style={{
                fontSize: 12, color: 'var(--c-text-2)', marginTop: 4,
                lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
              }}>
                {body.trim()}
              </div>
            )}
            <div style={{ fontSize: 11, color: 'var(--c-text-3)', marginTop: 6 }}>الآن</div>
          </div>
        </div>
        <p style={{ margin: '14px 0 0', fontSize: 11.5, color: 'var(--c-text-3)', lineHeight: 1.7 }}>
          يظهر الإشعار بهذا الشكل داخل التطبيق، ويُرسل أيضاً كإشعار فوري (Push) على أجهزة
          المستخدمين.
        </p>
      </div>
    </div>
  )
}

// ── Confirmation modal ────────────────────────────────────────────────────────

function ConfirmModal({ title, body, sending, onClose, onConfirm }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && !sending) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, sending])

  return (
    <div
      onClick={() => !sending && onClose()}
      style={{
        position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(20,32,50,0.5)',
        backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        role="dialog" aria-modal="true" aria-label="تأكيد إرسال إشعار عام"
        onClick={e => e.stopPropagation()}
        style={{ width: 'min(460px, 100%)', background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: 'var(--sh-card-lg)' }}
      >
        <div style={{ padding: '26px 26px 20px', textAlign: 'center' }}>
          <div style={{
            width: 60, height: 60, borderRadius: 16, margin: '0 auto 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--c-accent-tint)', color: '#8A6A23',
          }}>
            <Megaphone size={26} />
          </div>
          <h3 style={{ margin: '0 0 8px', fontSize: 19, fontWeight: 800, color: 'var(--c-text)' }}>
            إرسال إشعار عام؟
          </h3>
          <p style={{ margin: '0 auto', maxWidth: 360, fontSize: 13, color: 'var(--c-text-2)', lineHeight: 1.7 }}>
            سيصل هذا الإشعار إلى <strong>جميع مستخدمي النظام</strong> داخل التطبيق وكإشعار فوري
            على أجهزتهم. لا يمكن التراجع عن الإرسال.
          </p>
          <div style={{
            marginTop: 16, padding: '12px 14px', borderRadius: 12, textAlign: 'start',
            background: 'var(--c-surface)', border: '1px solid var(--c-border)',
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-text)', overflowWrap: 'anywhere' }}>{title}</div>
            <div style={{
              fontSize: 12, color: 'var(--c-text-2)', marginTop: 4, lineHeight: 1.6,
              whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
            }}>
              {body}
            </div>
          </div>
        </div>
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--c-border)', display: 'flex', gap: 10 }}>
          <button
            onClick={onConfirm} disabled={sending}
            style={{
              flex: 1, height: 44, borderRadius: 12, border: 0,
              background: 'var(--c-primary)', color: '#fff',
              fontFamily: 'var(--font-sans)', fontSize: 13.5, fontWeight: 700,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              cursor: sending ? 'default' : 'pointer', opacity: sending ? 0.7 : 1,
            }}
          >
            {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            {sending ? 'جارٍ الإرسال…' : 'تأكيد الإرسال'}
          </button>
          <button
            onClick={onClose} disabled={sending}
            style={{
              flex: 1, height: 44, borderRadius: 12,
              border: '1px solid var(--c-border)', background: '#fff', color: 'var(--c-text-2)',
              fontFamily: 'var(--font-sans)', fontSize: 13.5, fontWeight: 700,
              cursor: sending ? 'default' : 'pointer', opacity: sending ? 0.6 : 1,
            }}
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Queued-result panel ───────────────────────────────────────────────────────

function QueuedPanel({ result, onNew }) {
  return (
    <div style={{ ...cardStyle, padding: '32px 26px', textAlign: 'center' }}>
      <div style={{
        width: 62, height: 62, borderRadius: 17, margin: '0 auto 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--c-approved-bg)', color: 'var(--c-approved)',
      }}>
        <CheckCircle2 size={28} />
      </div>
      <h3 style={{ margin: '0 0 8px', fontSize: 19, fontWeight: 800, color: 'var(--c-text)' }}>
        تم قبول الإشعار وجارٍ إرساله
      </h3>
      {/* 202 = accepted, not delivered. Say so plainly: rows appear only as the
          queue worker processes them, so an admin checking immediately sees none. */}
      <p style={{ margin: '0 auto', maxWidth: 420, fontSize: 13, color: 'var(--c-text-2)', lineHeight: 1.7 }}>
        يجري إرسال الإشعار في الخلفية إلى المستخدمين، وقد يستغرق ظهوره لديهم بضع دقائق.
      </p>

      {result.recipients != null && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 16,
          padding: '10px 16px', borderRadius: 12,
          background: 'var(--c-primary-light)', color: 'var(--c-primary)',
        }}>
          <Users size={16} />
          <span style={{ fontSize: 13.5, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
            {result.recipients} مستخدماً
          </span>
        </div>
      )}

      {result.broadcast_id && (
        <div style={{ marginTop: 16, fontSize: 11, color: 'var(--c-text-3)' }}>
          معرّف الإرسال:{' '}
          <span style={{ fontFamily: "'Courier New', Courier, monospace" }}>{result.broadcast_id}</span>
        </div>
      )}

      <div style={{ marginTop: 22 }}>
        <button
          onClick={onNew}
          style={{
            height: 42, padding: '0 20px', borderRadius: 11,
            border: '1px solid var(--c-border)', background: '#fff', color: 'var(--c-text-2)',
            fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}
        >
          إرسال إشعار آخر
        </button>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BroadcastPage() {
  const toast = useToast()

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [errors, setErrors] = useState({})
  const [confirming, setConfirming] = useState(false)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)

  const validate = () => {
    const next = {}
    if (!title.trim()) next.title = 'عنوان الإشعار مطلوب.'
    else if (title.trim().length > MAX_TITLE) next.title = `العنوان يجب ألا يتجاوز ${MAX_TITLE} حرفاً.`
    if (!body.trim()) next.body = 'نص الإشعار مطلوب.'
    else if (body.trim().length > MAX_BODY) next.body = `النص يجب ألا يتجاوز ${MAX_BODY} حرفاً.`
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const openConfirm = () => { if (validate()) setConfirming(true) }

  const send = async () => {
    setSending(true)
    try {
      const res = await api.post('/admin/notifications/broadcast', {
        title: title.trim(),
        body: body.trim(),
      })
      setResult({
        broadcast_id: res.data?.broadcast_id ?? null,
        recipients: res.data?.recipients ?? null,
      })
      setConfirming(false)
      setTitle(''); setBody(''); setErrors({})
      toast.success('تم قبول الإشعار وجارٍ إرساله للمستخدمين')
    } catch (e) {
      // 422 comes back per-field; surface it on the inputs, not just as a toast.
      const fieldErrors = e?.response?.data?.errors
      if (fieldErrors && typeof fieldErrors === 'object') {
        setErrors({
          title: fieldErrors.title?.[0],
          body: fieldErrors.body?.[0],
        })
        setConfirming(false)
      }
      toast.error(extractErrorMessage(e, 'تعذّر إرسال الإشعار، حاول مرة أخرى.'))
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ padding: '28px clamp(16px, 4vw, 28px) 48px', maxWidth: 980, margin: '0 auto' }}>
      {result ? (
        <QueuedPanel result={result} onNew={() => setResult(null)} />
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>

          {/* Form */}
          <div style={{ flex: '1 1 460px', minWidth: 0 }}>
            <div style={cardStyle}>
              <div style={cardHeaderStyle}>
                <Megaphone size={15} style={{ color: 'var(--c-text-3)' }} />
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--c-text)' }}>إشعار عام لجميع المستخدمين</span>
              </div>
              <div style={{ padding: 20 }}>

                <div style={{
                  display: 'flex', gap: 10, padding: '12px 14px', borderRadius: 12, marginBottom: 20,
                  background: 'var(--c-accent-tint)', color: '#8A6A23',
                }}>
                  <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                  <div style={{ fontSize: 12, lineHeight: 1.7 }}>
                    يصل الإشعار إلى <strong>كل مستخدمي النظام</strong> داخل التطبيق وكإشعار فوري على
                    أجهزتهم. لا يمكن التراجع بعد الإرسال.
                  </div>
                </div>

                <FieldWrap
                  label="العنوان" required error={errors.title}
                  count={title.trim().length} max={MAX_TITLE}
                >
                  <input
                    value={title}
                    onChange={e => { setTitle(e.target.value); setErrors(x => ({ ...x, title: undefined })) }}
                    placeholder="مثال: تعطيل الدوام يوم الخميس"
                    style={{
                      ...inputBase, height: 42,
                      border: `1.5px solid ${errors.title ? 'var(--c-rejected)' : 'var(--c-border)'}`,
                    }}
                  />
                </FieldWrap>

                <FieldWrap
                  label="النص" required error={errors.body}
                  count={body.trim().length} max={MAX_BODY}
                  hint="اكتب رسالة واضحة ومختصرة — تظهر أسفل العنوان مباشرة."
                >
                  <textarea
                    value={body} rows={7}
                    onChange={e => { setBody(e.target.value); setErrors(x => ({ ...x, body: undefined })) }}
                    placeholder="تفاصيل الإشعار…"
                    style={{
                      ...inputBase, resize: 'vertical', lineHeight: 1.7,
                      border: `1.5px solid ${errors.body ? 'var(--c-rejected)' : 'var(--c-border)'}`,
                    }}
                  />
                </FieldWrap>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  {(title || body) && (
                    <button
                      onClick={() => { setTitle(''); setBody(''); setErrors({}) }}
                      style={{
                        height: 42, padding: '0 16px', borderRadius: 11,
                        border: '1px solid var(--c-border)', background: '#fff', color: 'var(--c-text-2)',
                        fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
                        display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer',
                      }}
                    >
                      <X size={14} />
                      مسح
                    </button>
                  )}
                  <button
                    onClick={openConfirm}
                    style={{
                      height: 42, padding: '0 20px', borderRadius: 11, border: 'none',
                      background: 'var(--c-primary)', color: '#fff',
                      fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
                      display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer',
                    }}
                  >
                    <Send size={14} />
                    مراجعة وإرسال
                  </button>
                </div>

              </div>
            </div>
          </div>

          {/* Preview */}
          <div style={{ flex: '0 1 320px', minWidth: 260 }}>
            <Preview title={title} body={body} />
          </div>

        </div>
      )}

      {confirming && (
        <ConfirmModal
          title={title.trim()} body={body.trim()} sending={sending}
          onClose={() => setConfirming(false)} onConfirm={send}
        />
      )}
    </div>
  )
}
