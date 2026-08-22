// HR files an excuse for a day an employee was marked absent
// (POST /attendance/leave-requests/excuse).
//
// Two things drive the whole form:
//   • the selected type's `deducts_balance` — whether the days will cost the
//     employee balance. A non-deducting excuse is never blocked by the balance
//     and never needs `force`, so that affordance is hidden for it entirely.
//   • the fact that an excuse answers for a day the employee did NOT come in —
//     any check-in inside the span is refused, and `force` does not waive it.

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Calendar, Check, Loader2, ShieldCheck, UserCheck, X } from 'lucide-react'
import api from '../../services/api'
import { useToast } from '../ui/Toast'
import DeductsBalanceBadge from '../ui/DeductsBalanceBadge'
import LeaveTypeSelect from './LeaveTypeSelect'
import { LEAVE_COPY, leaveApiMessage, splitDateRange } from '../../utils/leave'

const OVER_BALANCE_MESSAGE = 'Excuse exceeds the employee remaining annual leave balance. Send force=true to record it anyway.'
const ATTENDANCE_MESSAGE = 'The employee has attendance on some of these days, so there is no absence to excuse. File the excuse for the days actually missed.'

const inputStyle = {
  width: '100%', height: 42, borderRadius: 10, border: '1px solid var(--c-border)',
  background: '#fff', padding: '0 12px', outline: 'none',
  fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--c-text)',
}

function fmtDay(value) {
  const d = new Date(`${value}T00:00:00`)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', timeZone: 'Asia/Damascus' })
}

function Field({ label, required, error, hint, children }) {
  return <div>
    <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--c-text-2)', marginBottom: 6 }}>
      {label}{required && <span style={{ color: 'var(--c-rejected)', marginInlineStart: 3 }}>*</span>}
    </label>
    {children}
    {error && <div style={{ color: 'var(--c-rejected)', fontSize: 11.5, fontWeight: 600, marginTop: 5 }}>{error}</div>}
    {!error && hint && <div style={{ color: 'var(--c-text-3)', fontSize: 11, marginTop: 5, lineHeight: 1.6 }}>{hint}</div>}
  </div>
}

function getValidationErrors(data) {
  if (!data?.errors || typeof data.errors !== 'object') return {}
  return Object.fromEntries(Object.entries(data.errors).map(([key, value]) => [
    key, Array.isArray(value) ? value.join('، ') : String(value),
  ]))
}

export default function ExcuseLeaveModal({ employee, date, employees = [], onClose, onSubmitted }) {
  const toast = useToast()
  const [userId, setUserId] = useState(employee?.id ? String(employee.id) : '')
  const [startDate, setStartDate] = useState(date ?? '')
  const [endDate, setEndDate] = useState(date ?? '')
  const [leaveTypeId, setLeaveTypeId] = useState('')
  const [leaveType, setLeaveType] = useState(null) // the whole type: policy + requires_reason
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [forceData, setForceData] = useState(null)
  // The days the employee actually attended, as returned by the 422 — the range
  // has to be re-filed around them.
  const [attended, setAttended] = useState(null)

  const selectedEmployee = useMemo(
    () => employee ?? employees.find(item => String(item.id) === userId) ?? null,
    [employee, employees, userId]
  )

  // A non-deducting type costs nothing, so the balance can never block it and
  // the over-balance path is unreachable — do not offer it.
  const deducts = leaveType ? Boolean(leaveType.deducts_balance) : null
  const reasonRequired = Boolean(leaveType?.requires_reason)

  useEffect(() => {
    const onKey = event => {
      if (event.key !== 'Escape' || submitting) return
      if (forceData) setForceData(null)
      else if (attended) setAttended(null)
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [attended, forceData, onClose, submitting])

  // `leave_type` (free text) is still accepted by the API for backward
  // compatibility, but it is deliberately not sent: the id is the unambiguous
  // way to name a type, and it carries the balance policy with it.
  const body = useMemo(() => ({
    user_id: Number(userId),
    start_date: startDate,
    end_date: endDate,
    leave_type_id: Number(leaveTypeId),
    ...(reason.trim() ? { reason: reason.trim() } : {}),
  }), [userId, startDate, endDate, leaveTypeId, reason])

  const validate = () => {
    const next = {}
    if (!userId) next.user_id = 'الموظف مطلوب.'
    if (!startDate) next.start_date = 'تاريخ البداية مطلوب.'
    if (!endDate) next.end_date = 'تاريخ النهاية مطلوب.'
    if (startDate && endDate && endDate < startDate) next.end_date = 'تاريخ النهاية يجب أن يكون مساوياً أو بعد تاريخ البداية.'
    if (!leaveTypeId) next.leave_type_id = LEAVE_COPY.typeRequired
    // Mirrors the type's own `requires_reason` rule so the obvious case doesn't
    // need a round-trip; the server-side 422 on `reason` is still handled below.
    if (reasonRequired && !reason.trim()) next.reason = LEAVE_COPY.reasonRequiredByType
    if (reason.length > 2000) next.reason = 'السبب يجب ألا يتجاوز ٢٠٠٠ محرف.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const submit = async (force = false) => {
    if (!force && !validate()) return
    setSubmitting(true)
    setFormError('')
    try {
      const response = await api.post('/attendance/leave-requests/excuse', {
        ...body, ...(force ? { force: true } : {}),
      })
      // State the balance outcome explicitly — "an excuse was recorded" alone
      // leaves the one question HR actually has unanswered.
      const charged = response.data?.leave_request?.deducts_balance
      toast.success(charged ? LEAVE_COPY.recordedDeducted : LEAVE_COPY.recordedNotDeducted)
      onSubmitted?.(response.data)
      onClose()
    } catch (error) {
      const status = error?.response?.status
      const data = error?.response?.data ?? {}
      if (status === 403) {
        setFormError(LEAVE_COPY.excuseUnauthorized)
      } else if (status === 422 && data.message === ATTENDANCE_MESSAGE) {
        setForceData(null)
        setAttended(Array.isArray(data.attended_dates) ? data.attended_dates : [])
      } else if (status === 422 && data.message === OVER_BALANCE_MESSAGE) {
        const balance = data.balance ?? {}
        setForceData({
          remainingDays: Number(balance.remaining_days ?? 0),
          requestedDays: data.requested_days ?? data.required_days ?? balance.requested_days ?? balance.required_days ?? '—',
        })
      } else {
        const validation = getValidationErrors(data)
        if (Object.keys(validation).length) setErrors(validation)
        else setFormError(leaveApiMessage(error, 'تعذّر تسجيل العذر، حاول مرة أخرى.'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  // The stretches of the requested span the employee was actually absent for.
  const remainingRanges = attended ? splitDateRange(startDate, endDate, attended) : []

  const applyRange = (range) => {
    setStartDate(range.start)
    setEndDate(range.end)
    setAttended(null)
    setErrors(value => ({ ...value, start_date: undefined, end_date: undefined }))
  }

  return (
    <div onClick={() => !submitting && !forceData && !attended && onClose()} style={{
      position: 'fixed', inset: 0, zIndex: 60, padding: 20,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(20,32,50,0.52)', backdropFilter: 'blur(2px)',
    }}>
      <div role='dialog' aria-modal='true' aria-label='تسجيل عذر غياب'
        onClick={event => event.stopPropagation()}
        style={{ width: 'min(560px, 100%)', maxHeight: 'calc(100vh - 40px)', overflowY: 'auto', background: '#fff', borderRadius: 16, boxShadow: 'var(--sh-card-lg)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--c-primary)', background: 'var(--c-primary-light)' }}><ShieldCheck size={18} /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--c-text)' }}>تسجيل عذر غياب</div>
            <div style={{ fontSize: 11.5, color: 'var(--c-text-3)', marginTop: 2 }}>يُسجَّل العذر معتمداً مباشرة باسم الموارد البشرية.</div>
          </div>
          <button type='button' onClick={onClose} disabled={submitting} title='إغلاق' style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid var(--c-border)', background: '#fff', color: 'var(--c-text-2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
        </div>

        <div style={{ padding: 20, display: 'grid', gap: 16 }}>
          {formError && <div style={{ padding: '10px 12px', borderRadius: 10, color: 'var(--c-rejected)', background: 'var(--c-rejected-bg)', fontSize: 12.5, fontWeight: 600, lineHeight: 1.7 }}>{formError}</div>}

          {/* The employee attended some of these days — there is no absence to
              excuse, and `force` does not waive it. Offer the remaining days. */}
          {attended && (
            <div style={{
              padding: '13px 15px', borderRadius: 12,
              background: 'var(--c-pending-bg)', border: '1px solid var(--c-pending)33',
            }}>
              <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                <UserCheck size={16} style={{ color: 'var(--c-pending)', flexShrink: 0, marginTop: 2 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--c-text)', marginBottom: 4 }}>
                    {LEAVE_COPY.attendedDatesTitle}
                  </div>
                  <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--c-text-2)', lineHeight: 1.8 }}>
                    {LEAVE_COPY.attendedDates}
                  </p>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                    {attended.map(day => (
                      <span key={day} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999,
                        background: '#fff', border: '1px solid var(--c-pending)44',
                        fontSize: 11.5, fontWeight: 700, color: 'var(--c-text-2)', whiteSpace: 'nowrap',
                      }}>
                        <Calendar size={11} style={{ color: 'var(--c-pending)' }} />
                        {fmtDay(day)}
                      </span>
                    ))}
                  </div>

                  {remainingRanges.length > 0 ? (
                    <>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--c-text-2)', marginBottom: 7 }}>
                        {LEAVE_COPY.excludeAttendedDays}
                        {remainingRanges.length > 1 && ' — سجّل كل فترة على حدة'}
                      </div>
                      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                        {remainingRanges.map(range => (
                          <button
                            key={`${range.start}:${range.end}`} type='button'
                            onClick={() => applyRange(range)}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px',
                              borderRadius: 9, border: 'none', background: 'var(--c-primary)', color: '#fff',
                              fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                            }}
                          >
                            <Check size={13} />
                            {range.start === range.end
                              ? fmtDay(range.start)
                              : `${fmtDay(range.start)} — ${fmtDay(range.end)}`}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-text-2)' }}>
                      لا يوجد يوم غياب في هذه الفترة — عدّل التواريخ يدوياً.
                    </div>
                  )}
                </div>
                <button
                  type='button' onClick={() => setAttended(null)} title='إغلاق'
                  style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--c-text-3)', cursor: 'pointer', flexShrink: 0 }}
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )}

          <Field label='الموظف' required error={errors.user_id}>
            {employee ? (
              <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', background: 'var(--c-surface)', color: 'var(--c-text-2)' }}>
                <span style={{ fontWeight: 700 }}>{selectedEmployee?.name ?? '—'}</span>
                {selectedEmployee?.email && <span style={{ color: 'var(--c-text-3)', marginInlineStart: 8, fontSize: 11.5 }}>{selectedEmployee.email}</span>}
              </div>
            ) : (
              <select value={userId} onChange={event => { setUserId(event.target.value); setErrors(value => ({ ...value, user_id: undefined })) }} style={inputStyle}>
                <option value=''>اختر الموظف</option>
                {employees.map(item => <option key={item.id} value={item.id}>{item.name} — {item.email}</option>)}
              </select>
            )}
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <Field label='من' required error={errors.start_date}>
              <input type='date' value={startDate} onChange={event => { setStartDate(event.target.value); setAttended(null); setErrors(value => ({ ...value, start_date: undefined })) }} style={inputStyle} />
            </Field>
            <Field label='إلى' required error={errors.end_date}>
              <input type='date' value={endDate} min={startDate || undefined} onChange={event => { setEndDate(event.target.value); setAttended(null); setErrors(value => ({ ...value, end_date: undefined })) }} style={inputStyle} />
            </Field>
          </div>

          {/* `errors.leave_type` carries the legacy free-text refusals (a retired
              type, or one not offered for excuses) — surfaced on the same field. */}
          <Field
            label='نوع الإجازة' required
            error={errors.leave_type_id ?? errors.leave_type}
            hint={deducts == null
              ? 'يحدد النوع ما إذا كانت أيام العذر تُخصم من رصيد الموظف.'
              : deducts
                ? 'أيام هذا العذر تُخصم من الرصيد السنوي للموظف.'
                : LEAVE_COPY.forceUnavailable}
          >
            <LeaveTypeSelect
              forForm='excuses' value={leaveTypeId}
              error={errors.leave_type_id ?? errors.leave_type}
              onChange={(id, type) => {
                setLeaveTypeId(String(id))
                setLeaveType(type)
                setErrors(value => ({ ...value, leave_type_id: undefined, leave_type: undefined, reason: undefined }))
              }}
            />
          </Field>

          <Field
            label='السبب' required={reasonRequired} error={errors.reason}
            hint={reasonRequired ? LEAVE_COPY.reasonRequiredByType : `${reason.length} / ٢٠٠٠`}
          >
            <textarea value={reason} maxLength={2000} rows={4}
              placeholder={reasonRequired ? 'سبب العذر (مطلوب لهذا النوع)…' : 'سبب تسجيل العذر (اختياري)…'}
              onChange={event => { setReason(event.target.value); setErrors(value => ({ ...value, reason: undefined })) }}
              style={{ ...inputStyle, height: 'auto', minHeight: 94, padding: 12, resize: 'vertical', lineHeight: 1.6 }} />
          </Field>
        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          {leaveType && <DeductsBalanceBadge deducts={leaveType.deducts_balance} compact />}
          <div style={{ flex: 1 }} />
          <button type='button' onClick={onClose} disabled={submitting} style={{ height: 38, padding: '0 16px', borderRadius: 10, border: '1px solid var(--c-border)', background: '#fff', color: 'var(--c-text-2)', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700 }}>إلغاء</button>
          <button type='button' onClick={() => submit(false)} disabled={submitting} style={{ height: 38, padding: '0 18px', borderRadius: 10, border: 'none', background: 'var(--c-primary)', color: '#fff', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 7, opacity: submitting ? 0.7 : 1 }}>
            {submitting ? <Loader2 size={14} className='animate-spin' /> : <Check size={14} />} تسجيل العذر
          </button>
        </div>
      </div>

      {/* Over-balance is a deducting-type-only rejection, so this dialog can
          only ever be reached with a type that consumes balance. */}
      {forceData && (
        <div role='alertdialog' aria-modal='true' aria-label='تجاوز الرصيد' onClick={event => event.stopPropagation()}
          style={{ position: 'fixed', zIndex: 70, width: 'min(430px, calc(100% - 40px))', background: '#fff', borderRadius: 16, boxShadow: '0 20px 60px rgba(20,32,50,.32)', overflow: 'hidden' }}>
          <div style={{ padding: '20px 20px 14px', textAlign: 'center' }}>
            <div style={{ width: 46, height: 46, margin: '0 auto 12px', borderRadius: 13, background: 'var(--c-pending-bg)', color: 'var(--c-pending)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><AlertTriangle size={22} /></div>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--c-text)', marginBottom: 8 }}>تجاوز الرصيد</div>
            <p style={{ margin: 0, fontSize: 13.5, color: 'var(--c-text-2)', lineHeight: 1.8 }}>
              رصيد الموظف المتبقي {forceData.remainingDays} يوم، والعذر يحتاج {forceData.requestedDays} يوم.
              <br />هل تريد تسجيل العذر رغم تجاوز الرصيد؟
            </p>
          </div>
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--c-border)', display: 'flex', justifyContent: 'center', gap: 8 }}>
            <button type='button' onClick={() => setForceData(null)} disabled={submitting} style={{ height: 38, padding: '0 16px', borderRadius: 10, border: '1px solid var(--c-border)', background: '#fff', color: 'var(--c-text-2)', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700 }}>إلغاء</button>
            <button type='button' onClick={() => submit(true)} disabled={submitting} style={{ height: 38, padding: '0 18px', borderRadius: 10, border: 'none', background: 'var(--c-pending)', color: '#fff', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              {submitting ? <Loader2 size={14} className='animate-spin' /> : <ShieldCheck size={14} />} تسجيل رغم التجاوز
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
