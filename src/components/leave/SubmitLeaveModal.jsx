// Leave-request submission form (POST /attendance/leave-requests) plus the
// approver picker it feeds from GET /attendance/leave-managers.
// Only components are exported from this module (react-refresh).

import { useState, useEffect, useRef, useMemo } from 'react'
import {
  CalendarPlus, Loader2, Search, ChevronDown, Check, AlertTriangle, UserCheck,
} from 'lucide-react'
import api from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { LEAVE_COPY, leaveApiMessage, readLeaveBalance } from '../../utils/leave'
import LeaveTypeSelect from './LeaveTypeSelect'

const MAX_REASON = 2000

// Segregation of duties: v10 refuses a request whose approver is its own
// author, for every role, because the review gate only asks whether the caller
// IS the named approver — so a self-assigned request would be a complete
// approval with no second party. Mirrored here so the choice is never offered.
const SELF_APPROVAL_MESSAGE = 'لا يمكنك اعتماد إجازتك بنفسك. اختر مديراً أو رئيساً آخر.'

const ROLE_LABELS = { manager: 'مدير', chief: 'الرئيس الأعلى' }

const inputStyle = {
  width: '100%', boxSizing: 'border-box', height: 42,
  background: 'var(--c-surface)', border: '1.5px solid var(--c-border)',
  borderRadius: 10, padding: '0 12px', outline: 'none',
  fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--c-text)',
}

function Field({ label, required, error, hint, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--c-text)', marginBottom: 7 }}>
        {label}
        {required && <span style={{ color: 'var(--c-rejected)', marginInlineStart: 3 }}>*</span>}
      </label>
      {children}
      {hint && !error && <div style={{ fontSize: 11.5, color: 'var(--c-text-3)', marginTop: 5, lineHeight: 1.6 }}>{hint}</div>}
      {error && <div style={{ fontSize: 11.5, color: 'var(--c-rejected)', marginTop: 5 }}>{error}</div>}
    </div>
  )
}

// ── Approver picker ───────────────────────────────────────────────────────────

/**
 * Single-select combobox over GET /attendance/leave-managers (managers + chiefs).
 * The endpoint pages at 100, which covers a typical org in one page, so this
 * fetches once and filters client-side; `search` is only re-issued when the
 * result was truncated.
 */
function ManagerPicker({ value, onChange, error, excludeId }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [managers, setManagers] = useState([])
  const [loading, setLoading] = useState(true)
  const [serverSearchEnabled, setServerSearchEnabled] = useState(false)
  const [selectedManager, setSelectedManager] = useState(null)
  const wrapRef = useRef(null)

  useEffect(() => {
    function onClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  // Re-fetch with `search` only when the first page didn't hold everyone.
  const serverSearch = serverSearchEnabled ? query : ''
  useEffect(() => {
    let active = true
    const trimmedSearch = serverSearch.trim()
    const t = setTimeout(() => {
      if (!active) return
      setLoading(true)
      api.get('/attendance/leave-managers', {
        params: { per_page: 100, ...(trimmedSearch ? { search: trimmedSearch } : {}) },
      })
        .then(res => {
          if (!active) return
          const pag = res.data?.managers ?? res.data
          const list = pag?.data ?? (Array.isArray(pag) ? pag : [])
          // The endpoint lists every manager and chief company-wide, the
          // caller included when they hold one of those roles. Drop them here
          // so an approver the API would reject is never on the menu.
          const selectable = excludeId == null
            ? list
            : list.filter(m => String(m.id) !== String(excludeId))
          setManagers(selectable)
          if (!trimmedSearch) {
            setServerSearchEnabled((pag?.total ?? list.length) > list.length)
          }
        })
        .catch(() => { if (active) setManagers([]) })
        .finally(() => { if (active) setLoading(false) })
    }, serverSearch ? 280 : 0)
    return () => { active = false; clearTimeout(t) }
  }, [serverSearch, excludeId])

  const selected = managers.find(m => String(m.id) === String(value))
    ?? (String(selectedManager?.id) === String(value) ? selectedManager : null)
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q || serverSearchEnabled) return managers
    return managers.filter(m =>
      (m.name ?? '').toLowerCase().includes(q) || (m.email ?? '').toLowerCase().includes(q)
    )
  }, [managers, query, serverSearchEnabled])

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button" onClick={() => setOpen(o => !o)}
        style={{
          ...inputStyle, cursor: 'pointer', textAlign: 'start',
          borderColor: error ? 'var(--c-rejected)' : 'var(--c-border)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}
      >
        <UserCheck size={15} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
        <span style={{
          flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: selected ? 'var(--c-text)' : 'var(--c-text-3)', fontWeight: selected ? 700 : 400,
        }}>
          {selected ? selected.name : 'اختر المسؤول الذي سيراجع الطلب…'}
        </span>
        {selected && (
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-text-3)', flexShrink: 0 }}>
            {ROLE_LABELS[selected.role] ?? selected.role}
          </span>
        )}
        <ChevronDown size={14} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', insetInlineStart: 0, zIndex: 20,
          width: '100%', background: '#fff', border: '1px solid var(--c-border)',
          borderRadius: 12, boxShadow: 'var(--sh-card-lg)', overflow: 'hidden',
        }}>
          <div style={{ padding: 8, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', gap: 7 }}>
            <Search size={14} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
            <input
              autoFocus value={query} onChange={e => setQuery(e.target.value)}
              placeholder="ابحث بالاسم أو البريد…"
              style={{
                flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
                fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--c-text)',
              }}
            />
          </div>
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {loading && (
              <div style={{ padding: '18px 12px', textAlign: 'center', color: 'var(--c-text-3)' }}>
                <Loader2 size={15} className="animate-spin" />
              </div>
            )}
            {!loading && visible.length === 0 && (
              <div style={{ padding: '18px 12px', textAlign: 'center', fontSize: 12.5, color: 'var(--c-text-3)' }}>
                لا يوجد مسؤولون مطابقون
              </div>
            )}
            {!loading && visible.map(m => {
              const active = m.id === value
              return (
                <button
                  key={m.id} type="button"
                  onClick={() => { setSelectedManager(m); onChange(m.id); setOpen(false); setQuery('') }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 9,
                    padding: '9px 12px', border: 'none', cursor: 'pointer', textAlign: 'start',
                    background: active ? 'var(--c-primary-light)' : 'transparent',
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--c-text)' }}>{m.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--c-text-3)', marginTop: 2 }}>
                      {m.email}
                      {m.department?.name && ` · ${m.department.name}`}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 800, borderRadius: 999, padding: '2px 7px', flexShrink: 0,
                    background: m.role === 'chief' ? 'var(--c-accent-tint)' : 'rgba(34,65,103,0.09)',
                    color: m.role === 'chief' ? '#8A6A23' : 'var(--c-primary)',
                  }}>
                    {ROLE_LABELS[m.role] ?? m.role}
                  </span>
                  {active && <Check size={14} style={{ color: 'var(--c-primary)', flexShrink: 0 }} />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Submit modal ──────────────────────────────────────────────────────────────

function calendarDays(start, end) {
  if (!start || !end) return null
  const a = new Date(start), b = new Date(end)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a) return null
  return Math.floor((b - a) / 86400000) + 1
}

/**
 * `onSubmitted(balance)` fires after a 201 — the response carries the caller's
 * refreshed balance, so the parent can update without a second request.
 */
export default function SubmitLeaveModal({ onClose, onSubmitted }) {
  const { user } = useAuth()
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [managerId, setManagerId] = useState(null)
  // The type is named by id: it carries the balance policy with it, and the
  // legacy free-text `leave_type` is no longer sent.
  const [leaveTypeId, setLeaveTypeId] = useState('')
  const [leaveType, setLeaveType] = useState(null)
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [errorBalance, setErrorBalance] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && !submitting) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, submitting])

  const span = calendarDays(startDate, endDate)

  const validate = () => {
    const next = {}
    if (!startDate) next.startDate = 'تاريخ بداية الإجازة مطلوب.'
    if (!endDate) next.endDate = 'تاريخ نهاية الإجازة مطلوب.'
    // Mirrors the backend's after_or_equal rule so the obvious case doesn't
    // need a round-trip.
    if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
      next.endDate = 'يجب أن يكون تاريخ النهاية مساوياً أو بعد تاريخ البداية.'
    }
    if (!managerId) next.managerId = 'المسؤول المراجع مطلوب.'
    // Belt and braces: the picker already hides the caller, but a stale
    // selection must not be submitted either.
    else if (user?.id != null && String(managerId) === String(user.id)) next.managerId = SELF_APPROVAL_MESSAGE
    // `leave_type_id` is only `sometimes` on the endpoint, kept optional for
    // clients that predate types: a request without one is filed unlabelled and
    // falls back to *deducting*, which would quietly charge the balance for what
    // may well be sick leave. The UI requires the choice the API cannot.
    if (!leaveTypeId) next.leave_type_id = LEAVE_COPY.typeRequired
    // Mirrors the selected type's `requires_reason` rule; the server-side 422 on
    // `reason` is still handled.
    if (leaveType?.requires_reason && !reason.trim()) next.reason = LEAVE_COPY.reasonRequiredByType
    if (reason.length > MAX_REASON) next.reason = `السبب يجب ألا يتجاوز ${MAX_REASON} حرفاً.`
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const submit = async () => {
    setFormError(''); setErrorBalance(null)
    if (!validate()) return
    setSubmitting(true)
    try {
      const res = await api.post('/attendance/leave-requests', {
        start_date: startDate,
        end_date: endDate,
        manager_id: managerId,
        leave_type_id: Number(leaveTypeId),
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      })
      onSubmitted(res.data?.balance ? readLeaveBalance(res.data) : null)
    } catch (err) {
      // The three business-rule rejections all land here as 422 + message; the
      // over-balance one also returns the caller's current balance.
      setFormError(leaveApiMessage(err, 'تعذّر إرسال طلب الإجازة، حاول مرة أخرى'))
      // `manager_id` carries the self-approval refusal among others, and
      // `leave_type_id` / `leave_type` / `reason` carry the type's own rules
      // (a retired type, one not offered on this form, or a missing reason), so
      // each is shown under its field rather than only in the banner.
      const fieldErrors = err?.response?.data?.errors ?? {}
      const first = key => {
        const value = fieldErrors[key]
        return Array.isArray(value) ? value[0] : value
      }
      if (fieldErrors.manager_id) setErrors(x => ({ ...x, managerId: first('manager_id') }))
      if (fieldErrors.leave_type_id) setErrors(x => ({ ...x, leave_type_id: first('leave_type_id') }))
      if (fieldErrors.leave_type) setErrors(x => ({ ...x, leave_type: first('leave_type') }))
      if (fieldErrors.reason) setErrors(x => ({ ...x, reason: first('reason') }))
      if (err?.response?.data?.balance) setErrorBalance(readLeaveBalance(err.response.data))
      setSubmitting(false)
    }
  }

  return (
    <div
      onClick={() => !submitting && onClose()}
      style={{
        position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(20,32,50,0.5)',
        backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        role="dialog" aria-modal="true" aria-label="طلب إجازة جديد"
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(520px, 100%)', maxHeight: 'calc(100vh - 40px)', background: '#fff',
          borderRadius: 16, boxShadow: 'var(--sh-card-lg)', display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', gap: 9 }}>
          <CalendarPlus size={16} style={{ color: 'var(--c-text-3)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--c-text)' }}>طلب إجازة جديد</div>
            <div style={{ fontSize: 12, color: 'var(--c-text-3)', marginTop: 3 }}>
              يُرسل الطلب إلى المسؤول المختار لمراجعته.
            </div>
          </div>
        </div>

        <div style={{ padding: '16px 20px', overflowY: 'auto' }}>

          {formError && (
            <div style={{
              display: 'flex', gap: 9, padding: '11px 13px', borderRadius: 11, marginBottom: 16,
              background: 'var(--c-rejected-bg)', color: 'var(--c-rejected)',
            }}>
              <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 12.5, lineHeight: 1.6 }}>
                {formError}
                {errorBalance?.remaining != null && (
                  <div style={{ marginTop: 4, fontWeight: 700 }}>
                    رصيدك المتبقّي: {errorBalance.remaining} يوم
                  </div>
                )}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Field label="من تاريخ" required error={errors.startDate}>
                <input
                  type="date" value={startDate}
                  onChange={e => { setStartDate(e.target.value); setErrors(x => ({ ...x, startDate: undefined })) }}
                  style={{ ...inputStyle, borderColor: errors.startDate ? 'var(--c-rejected)' : 'var(--c-border)' }}
                />
              </Field>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Field label="إلى تاريخ" required error={errors.endDate}>
                <input
                  type="date" value={endDate} min={startDate || undefined}
                  onChange={e => { setEndDate(e.target.value); setErrors(x => ({ ...x, endDate: undefined })) }}
                  style={{ ...inputStyle, borderColor: errors.endDate ? 'var(--c-rejected)' : 'var(--c-border)' }}
                />
              </Field>
            </div>
          </div>

          {span != null && (
            /* Calendar span only — the deducted total counts working days and is
               computed server-side, so it isn't derivable here. */
            <div style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '9px 12px',
              borderRadius: 10, marginBottom: 16,
              background: 'var(--c-primary-light)', color: 'var(--c-primary)',
            }}>
              <span style={{ fontSize: 12.5, fontWeight: 700 }}>مدة الإجازة: {span} يوم تقويمي</span>
              <span style={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>
                — تُحتسب أيام العمل فقط من رصيدك
              </span>
            </div>
          )}

          <Field
            label="المسؤول المراجع" required error={errors.managerId}
            hint="لا يمكنك اختيار نفسك — يجب أن يراجع الطلب مسؤول آخر."
          >
            <ManagerPicker
              value={managerId} error={errors.managerId} excludeId={user?.id}
              onChange={id => { setManagerId(id); setErrors(x => ({ ...x, managerId: undefined })) }}
            />
          </Field>

          <Field
            label="نوع الإجازة" required
            error={errors.leave_type_id ?? errors.leave_type}
            hint={leaveType
              ? (leaveType.deducts_balance
                  ? 'أيام هذه الإجازة تُخصم من رصيدك السنوي.'
                  : 'لا تُخصم أيام هذه الإجازة من رصيدك السنوي.')
              : 'يحدد النوع ما إذا كانت الأيام تُخصم من رصيدك السنوي.'}
          >
            <LeaveTypeSelect
              forForm="requests" value={leaveTypeId}
              error={errors.leave_type_id ?? errors.leave_type}
              onChange={(id, type) => {
                setLeaveTypeId(String(id))
                setLeaveType(type)
                setErrors(x => ({ ...x, leave_type_id: undefined, leave_type: undefined, reason: undefined }))
              }}
            />
          </Field>

          <Field
            label="السبب" required={Boolean(leaveType?.requires_reason)} error={errors.reason}
            hint={leaveType?.requires_reason
              ? LEAVE_COPY.reasonRequiredByType
              : 'اختياري — يظهر للمسؤول عند مراجعة الطلب.'}
          >
            <textarea
              value={reason} rows={3} maxLength={MAX_REASON}
              onChange={e => { setReason(e.target.value); setErrors(x => ({ ...x, reason: undefined })) }}
              placeholder="سبب طلب الإجازة…"
              style={{
                ...inputStyle, height: 'auto', padding: '10px 12px', resize: 'vertical', lineHeight: 1.6,
                borderColor: errors.reason ? 'var(--c-rejected)' : 'var(--c-border)',
              }}
            />
          </Field>

        </div>

        <div style={{
          padding: '12px 20px', borderTop: '1px solid var(--c-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8,
        }}>
          <button
            onClick={onClose} disabled={submitting}
            style={{
              height: 40, padding: '0 16px', borderRadius: 10,
              background: 'transparent', border: '1px solid var(--c-border)',
              fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
              color: 'var(--c-text-2)', cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.6 : 1,
            }}
          >
            إلغاء
          </button>
          <button
            onClick={submit} disabled={submitting}
            style={{
              height: 40, padding: '0 18px', borderRadius: 10, border: 'none',
              background: 'var(--c-primary)', color: '#fff',
              fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
              display: 'inline-flex', alignItems: 'center', gap: 7,
              cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {submitting ? 'جارٍ الإرسال…' : 'إرسال الطلب'}
          </button>
        </div>
      </div>
    </div>
  )
}
