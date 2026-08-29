// Leave-request submission form (POST /attendance/leave-requests).
// The approver chain it posts as `approver_ids` is picked by
// LeaveApproverChainPicker, fed from GET /attendance/leave-managers.
// Only components are exported from this module (react-refresh).

import { useState, useEffect } from 'react'
import { CalendarPlus, Loader2, Check, AlertTriangle } from 'lucide-react'
import api from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import {
  LEAVE_COPY, leaveApiMessage, readLeaveBalance,
  MIN_LEAVE_APPROVERS, MAX_LEAVE_APPROVERS,
} from '../../utils/leave'
import LeaveTypeSelect from './LeaveTypeSelect'
import LeaveApproverChainPicker from './LeaveApproverChainPicker'

const MAX_REASON = 2000

// Segregation of duties: v10 refuses a request whose approver is its own
// author, for every role, because the review gate only asks whether the caller
// IS the approver whose turn it is — so a self-assigned step would be a
// complete approval with no second party. Mirrored here so the choice is never
// offered, on any step of the chain.
const SELF_APPROVAL_MESSAGE = 'لا يمكنك اعتماد إجازتك بنفسك. اختر مديراً أو رئيساً آخر.'

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
  // Ordered approval chain — array order is decision order (`approver_ids`).
  const [approverIds, setApproverIds] = useState([])
  // The type is named by id: it carries the balance policy with it, and the
  // legacy free-text `leave_type` is no longer sent.
  const [leaveTypeId, setLeaveTypeId] = useState('')
  const [leaveType, setLeaveType] = useState(null)
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState({})
  // Per-position messages for the chain, keyed by index — a server
  // `approver_ids.N` error belongs on row N, not only in the banner.
  const [approverRowErrors, setApproverRowErrors] = useState({})
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
    // The server limits mirrored for UX only — 1 to 10 distinct approvers, none
    // of them the requester. Every one of these is still enforced server-side.
    if (approverIds.length < MIN_LEAVE_APPROVERS) next.approverIds = LEAVE_COPY.approversRequired
    else if (approverIds.length > MAX_LEAVE_APPROVERS) next.approverIds = LEAVE_COPY.approversMax
    else if (new Set(approverIds.map(String)).size !== approverIds.length) {
      next.approverIds = LEAVE_COPY.approversDuplicate
    }
    // Belt and braces: the picker already hides the caller, but a stale
    // selection must not be submitted either.
    else if (user?.id != null && approverIds.some(id => String(id) === String(user.id))) {
      next.approverIds = SELF_APPROVAL_MESSAGE
    }
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
    setFormError(''); setErrorBalance(null); setApproverRowErrors({})
    if (!validate()) return
    setSubmitting(true)
    try {
      const res = await api.post('/attendance/leave-requests', {
        start_date: startDate,
        end_date: endDate,
        // The ordered chain. `manager_id` is deliberately not sent alongside it:
        // the endpoint still accepts it as the legacy one-approver payload, but
        // requires it to equal approver_ids[0], so sending both only adds a way
        // for the two to disagree.
        approver_ids: approverIds,
        leave_type_id: Number(leaveTypeId),
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      })
      onSubmitted(res.data?.balance ? readLeaveBalance(res.data) : null)
    } catch (err) {
      // The three business-rule rejections all land here as 422 + message; the
      // over-balance one also returns the caller's current balance.
      setFormError(leaveApiMessage(err, 'تعذّر إرسال طلب الإجازة، حاول مرة أخرى'))
      // `approver_ids` carries the self-approval refusal among others, and
      // `leave_type_id` / `leave_type` / `reason` carry the type's own rules
      // (a retired type, one not offered on this form, or a missing reason), so
      // each is shown under its field rather than only in the banner.
      const fieldErrors = err?.response?.data?.errors ?? {}
      const first = key => {
        const value = fieldErrors[key]
        return Array.isArray(value) ? value[0] : value
      }
      // Per-index errors (`approver_ids.0`, `approver_ids.1`, …) land on the row
      // they are about — with up to ten approvers, "one of them is ineligible"
      // is not an answer anyone can act on.
      const rowErrors = {}
      for (const key of Object.keys(fieldErrors)) {
        const match = /^approver_ids\.(\d+)$/.exec(key)
        if (match) rowErrors[Number(match[1])] = first(key)
      }
      if (Object.keys(rowErrors).length) setApproverRowErrors(rowErrors)
      // `manager_id` is still read: the endpoint keys the legacy payload's
      // refusals to it, and a mismatch with approver_ids[0] is reported there.
      const chainError = fieldErrors.approver_ids ? first('approver_ids')
        : fieldErrors.manager_id ? first('manager_id')
          : null
      if (chainError) setErrors(x => ({ ...x, approverIds: chainError }))
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
              يُرسل الطلب إلى المعتمد الأول، وينتقل للتالي بعد كل موافقة.
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
            label="سلسلة الاعتماد" required error={errors.approverIds}
            hint="لا يمكنك اختيار نفسك — يجب أن يراجع الطلب مسؤول آخر."
          >
            <LeaveApproverChainPicker
              value={approverIds} excludeId={user?.id} rowErrors={approverRowErrors}
              onChange={next => {
                setApproverIds(next)
                setErrors(x => ({ ...x, approverIds: undefined }))
                setApproverRowErrors({})
              }}
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
