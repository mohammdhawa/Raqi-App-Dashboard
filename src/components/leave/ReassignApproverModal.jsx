// Admin-only reassignment of ONE pending approval step
// (PATCH /attendance/leave-requests/{id}/reassign).
//
// This is not an override. It cannot approve or reject anything — there is no
// `status` in the body and the review gate still refuses admins. All it does is
// change who decides a step, which is what unblocks a request whose assigned
// approver has been offboarded.

import { useState, useEffect } from 'react'
import { UserCog, Loader2, Check, AlertTriangle } from 'lucide-react'
import api from '../../services/api'
import {
  LEAVE_COPY, leaveApiMessage, getApprovalChain, getCurrentApproverId, getLeaveUser,
} from '../../utils/leave'
import LeaveManagerSelect from './LeaveManagerSelect'

const MIN_REASON = 3
const MAX_REASON = 500

const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  background: 'var(--c-surface)', border: '1.5px solid var(--c-border)',
  borderRadius: 10, padding: '10px 12px', outline: 'none',
  fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--c-text)',
  lineHeight: 1.6, resize: 'vertical',
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

/** `onDone()` fires after a 200 so the caller can refresh the list. */
export default function ReassignApproverModal({ item, onClose, onDone }) {
  const chain = getApprovalChain(item)
  // Only a pending step can move — an approved or rejected one is a decision
  // already made, and `skipped` belongs to a request that is already closed.
  const pendingSteps = chain.filter(step => step.status === 'pending')
  const currentId = getCurrentApproverId(item)
  const requesterId = item?.user_id ?? getLeaveUser(item)?.id ?? null

  const [order, setOrder] = useState(pendingSteps[0]?.order ?? null)
  const [userId, setUserId] = useState(null)
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && !submitting) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, submitting])

  // The replacement may not be the requester, and may not already hold another
  // step on the same request — including the one being replaced.
  const excludeIds = [requesterId, ...chain.map(step => step.userId)]

  const validate = () => {
    const next = {}
    if (order == null) next.order = LEAVE_COPY.reassignNoSteps
    if (userId == null) next.userId = 'اختر المعتمد الجديد.'
    const trimmed = reason.trim()
    if (trimmed.length < MIN_REASON) next.reason = `السبب مطلوب (${MIN_REASON} أحرف على الأقل).`
    else if (trimmed.length > MAX_REASON) next.reason = `السبب يجب ألا يتجاوز ${MAX_REASON} حرفاً.`
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const submit = async () => {
    setFormError('')
    if (!validate()) return
    setSubmitting(true)
    try {
      await api.patch(`/attendance/leave-requests/${item.id}/reassign`, {
        approval_order: order,
        user_id: userId,
        reason: reason.trim(),
      })
      onDone()
    } catch (err) {
      setFormError(leaveApiMessage(err, 'تعذّر إعادة إسناد خطوة الاعتماد، حاول مرة أخرى'))
      const fieldErrors = err?.response?.data?.errors ?? {}
      const first = key => {
        const value = fieldErrors[key]
        return Array.isArray(value) ? value[0] : value
      }
      if (fieldErrors.approval_order) setErrors(x => ({ ...x, order: first('approval_order') }))
      if (fieldErrors.user_id) setErrors(x => ({ ...x, userId: first('user_id') }))
      if (fieldErrors.reason) setErrors(x => ({ ...x, reason: first('reason') }))
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
        role="dialog" aria-modal="true" aria-label={LEAVE_COPY.reassignTitle}
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(480px, 100%)', maxHeight: 'calc(100vh - 40px)', background: '#fff',
          borderRadius: 16, boxShadow: 'var(--sh-card-lg)', display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', gap: 9 }}>
          <UserCog size={16} style={{ color: 'var(--c-text-3)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--c-text)' }}>{LEAVE_COPY.reassignTitle}</div>
            <div style={{ fontSize: 12, color: 'var(--c-text-3)', marginTop: 3, lineHeight: 1.6 }}>
              {LEAVE_COPY.reassignHint}
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
              <div style={{ fontSize: 12.5, lineHeight: 1.6 }}>{formError}</div>
            </div>
          )}

          {pendingSteps.length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--c-text-2)', lineHeight: 1.7 }}>
              {LEAVE_COPY.reassignNoSteps}
            </div>
          ) : (
            <>
              <Field label={LEAVE_COPY.reassignStep} required error={errors.order}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {pendingSteps.map(step => {
                    const active = step.order === order
                    const isCurrent = currentId != null && String(step.userId) === String(currentId)
                    return (
                      <button
                        key={step.order} type="button"
                        onClick={() => { setOrder(step.order); setErrors(x => ({ ...x, order: undefined })) }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 9, width: '100%',
                          padding: '9px 11px', borderRadius: 10, textAlign: 'start',
                          border: `1.5px solid ${active ? 'var(--c-primary)' : 'var(--c-border)'}`,
                          background: active ? 'var(--c-primary-light)' : '#fff',
                          fontFamily: 'var(--font-sans)', cursor: 'pointer',
                        }}
                      >
                        <span style={{
                          width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                          background: 'var(--c-primary)', color: '#fff',
                          fontSize: 10.5, fontWeight: 800,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {step.order}
                        </span>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700, color: 'var(--c-text)' }}>
                          {step.name ?? `#${step.userId}`}
                        </span>
                        {isCurrent && (
                          <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--c-pending)', whiteSpace: 'nowrap' }}>
                            {LEAVE_COPY.currentApprover}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </Field>

              <Field
                label={LEAVE_COPY.reassignTo} required error={errors.userId}
                hint="مدير أو رئيس نشِط، ليس مقدّم الطلب ولا معتمداً آخر على السلسلة نفسها."
              >
                <LeaveManagerSelect
                  value={userId} error={errors.userId} excludeIds={excludeIds}
                  placeholder="اختر المعتمد الجديد…"
                  onChange={id => { setUserId(id); setErrors(x => ({ ...x, userId: undefined })) }}
                />
              </Field>

              <Field
                label={LEAVE_COPY.reassignReason} required error={errors.reason}
                hint={LEAVE_COPY.reassignReasonHint}
              >
                <textarea
                  value={reason} rows={3} maxLength={MAX_REASON}
                  onChange={e => { setReason(e.target.value); setErrors(x => ({ ...x, reason: undefined })) }}
                  placeholder="سبب نقل الخطوة إلى معتمد آخر…"
                  style={{ ...inputStyle, borderColor: errors.reason ? 'var(--c-rejected)' : 'var(--c-border)' }}
                />
              </Field>
            </>
          )}
        </div>

        <div style={{
          padding: '12px 20px', borderTop: '1px solid var(--c-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8,
        }}>
          <button
            onClick={onClose} disabled={submitting}
            style={{
              height: 38, padding: '0 16px', borderRadius: 10,
              background: 'transparent', border: '1px solid var(--c-border)',
              fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
              color: 'var(--c-text-2)', cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.6 : 1,
            }}
          >
            إلغاء
          </button>
          {pendingSteps.length > 0 && (
            <button
              onClick={submit} disabled={submitting}
              style={{
                height: 38, padding: '0 18px', borderRadius: 10, border: 'none',
                background: 'var(--c-primary)', color: '#fff',
                fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', gap: 7,
                cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {submitting ? 'جارٍ الحفظ…' : LEAVE_COPY.reassign}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
