// HR retracts an excuse it filed by mistake — wrong employee, wrong dates,
// wrong type (DELETE /attendance/leave-requests/{id}/excuse).
//
// Two things separate this from undoing an attendance refusal, and both are in
// the copy rather than in a guard:
//   • the employee IS notified. Restoring a refused day is good news; this is
//     the opposite — their absence stops being justified and the right
//     paperwork may still be owed, so the confirm says so.
//   • it is not a delete. The row survives as «ملغاة», the period is free again
//     and the corrected excuse is filed straight after through ExcuseLeaveModal.
//     Nothing restores a cancelled entry, which is why the confirm says both.
//
// The reason is deliberately optional: HR is correcting its own slip, and
// demanding a justification for admitting one is friction on the wrong side of
// the mistake. It is passed on to the employee when given.

import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2, ShieldPlus, Undo2, X } from 'lucide-react'
import { useToast } from '../ui/Toast'
import DeductsBalanceBadge from '../ui/DeductsBalanceBadge'
import {
  EXCUSE_ALREADY_UNDONE, EXCUSED_META, LEAVE_COPY,
  deductsBalance, leaveApiMessage, undoLeaveExcuse,
} from '../../utils/leave'

const REASON_MAX = 2000

function fmtDay(value) {
  if (!value) return '—'
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('ar-EG', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Damascus',
  })
}

function Warning({ icon: Icon, tone = 'warn', children }) {
  const tones = {
    warn: { bg: 'var(--c-pending-bg)',    border: 'var(--c-pending)22',    color: 'var(--c-pending)' },
    info: { bg: 'var(--c-primary-light)', border: 'rgba(34,65,103,0.16)',  color: 'var(--c-primary)' },
  }
  const t = tones[tone]
  return (
    <div style={{
      display: 'flex', gap: 9, padding: '10px 12px', borderRadius: 10,
      background: t.bg, border: `1px solid ${t.border}`,
    }}>
      <Icon size={15} style={{ color: t.color, flexShrink: 0, marginTop: 1 }} />
      <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.7, color: 'var(--c-text-2)' }}>{children}</p>
    </div>
  )
}

/**
 * @param {object} target  { leaveRequestId, name, email, startDate, endDate,
 *                           date, leaveTypeName, deductsBalance, reason,
 *                           recordedBy }
 *                         `deductsBalance` comes from the excuse block the
 *                         caller already has — a refund is never promised for a
 *                         non-deducting excuse.
 *                         `startDate`/`endDate` are the excuse's own period
 *                         where the caller knows it; the day grid knows only
 *                         the day it was clicked on and passes `date` instead,
 *                         which is why the whole-span note is not conditional
 *                         on a range it cannot see.
 * @param {Function} onDone  called with the API payload after a success, and
 *                           with `null` when the view is merely stale (someone
 *                           else undid the same row first). Callers refetch:
 *                           one undo moves the day, the summary counters and
 *                           the balance at once. The payload's `balance` is the
 *                           employee's fresh balance where one is on screen.
 */
export default function UndoExcuseModal({ target, onClose, onDone }) {
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [reasonError, setReasonError] = useState('')
  // A business-rule refusal this dialog cannot argue with — the excuse is
  // already undone, or was never HR's to undo. Retrying would fail identically.
  const [resolved, setResolved] = useState(false)

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && !submitting) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, submitting])

  const leaveRequestId = target?.leaveRequestId
  // The excuse's own snapshot, read the one way the dashboard reads it: `null`
  // is a row filed before the flag existed, so nothing is claimed about it and
  // no refund is promised.
  const deducts = deductsBalance({ deducts_balance: target?.deductsBalance })
  const refunds = deducts === true
  const canSubmit = Boolean(leaveRequestId) && !resolved

  const submit = async () => {
    if (submitting || !canSubmit) return
    setError('')
    setReasonError('')

    if (!leaveRequestId) { setError(LEAVE_COPY.undoExcuseNoTarget); return }
    // Mirrors the endpoint's only field rule so the obvious case doesn't need a
    // round-trip; the server's own 422 on `reason` is still handled below.
    if (reason.trim().length > REASON_MAX) { setReasonError(LEAVE_COPY.undoExcuseReasonMax); return }

    setSubmitting(true)
    try {
      const data = await undoLeaveExcuse(leaveRequestId, reason)
      toast.success(LEAVE_COPY.undoExcuseDone)
      onDone(data)
      onClose()
    } catch (err) {
      const status = err?.response?.status
      const data = err?.response?.data ?? {}
      if (data.errors && typeof data.errors === 'object') {
        // `reason` is the only field that can fail — the length limit.
        setReasonError(leaveApiMessage(err, LEAVE_COPY.undoExcuseReasonMax))
        return
      }
      // A scope denial, not a capability one: the body is `{"message":
      // "Unauthorized."}` with no `error` code, and no amount of retrying
      // brings this employee inside the caller's departments.
      setError(status === 403
        ? LEAVE_COPY.undoExcuseUnauthorized
        : leaveApiMessage(err, LEAVE_COPY.undoExcuseFailed))
      if (status === 403 || status === 422) setResolved(true)
      // Two HR users on the same screen and the other clicked first: the excuse
      // is gone, the screen is stale rather than broken, and the employee was
      // not notified a second time — so this is an answer, and the view is
      // refreshed behind the message. A 403 refreshes for the same reason: the
      // action should not have been on offer. The success toast never fires
      // here, so neither case can double up on one.
      if (status === 403 || data.message === EXCUSE_ALREADY_UNDONE) onDone(null)
    } finally {
      setSubmitting(false)
    }
  }

  // The excuse's own period when the caller knows it, otherwise the day it was
  // clicked on. Anything but a known single day is undone as a whole span.
  const spanKnown = Boolean(target?.startDate && target?.endDate)
  const oneDay = spanKnown && target.startDate === target.endDate
  const period = spanKnown && !oneDay
    ? `${fmtDay(target.startDate)} — ${fmtDay(target.endDate)}`
    : fmtDay(spanKnown ? target.startDate : target?.date)

  return (
    <div
      onClick={() => { if (!submitting) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(20,32,50,0.5)',
        backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        role='dialog' aria-modal='true' aria-label={LEAVE_COPY.undoExcuseTitle}
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(460px, 100%)', maxHeight: 'calc(100vh - 40px)', overflowY: 'auto',
          background: '#fff', borderRadius: 16, boxShadow: 'var(--sh-card-lg)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--c-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 800, color: 'var(--c-text)' }}>
              <Undo2 size={17} style={{ color: 'var(--c-pending)', flexShrink: 0 }} />
              {LEAVE_COPY.undoExcuseTitle}
            </div>
            <div style={{
              fontSize: 12, color: 'var(--c-text-3)', marginTop: 4,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {target?.name ?? '—'} · {period}
            </div>
          </div>
          <button
            type='button' onClick={onClose} disabled={submitting} title='إغلاق'
            style={{
              width: 34, height: 34, borderRadius: 9, flexShrink: 0,
              border: '1px solid var(--c-border)', background: '#fff', color: 'var(--c-text-2)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 15 }}>

          {/* The excuse being retracted, in the `excused` colour it is leaving. */}
          <div style={{
            padding: '11px 13px', borderRadius: 10,
            background: EXCUSED_META.bg, border: `1px solid ${EXCUSED_META.color}22`,
            display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: EXCUSED_META.color }}>
                {target?.leaveTypeName ?? LEAVE_COPY.excusedStatus}
              </span>
              <DeductsBalanceBadge deducts={deducts} compact short />
            </div>
            {target?.reason && (
              <span style={{ fontSize: 11.5, color: 'var(--c-text-2)', lineHeight: 1.6 }}>
                {target.reason}
              </span>
            )}
            <span style={{ fontSize: 10.5, color: 'var(--c-text-3)' }}>
              سجّلها: {target?.recordedBy ?? 'الموارد البشرية'}
            </span>
          </div>

          {/* All three consequences — and the refund only when it is true. */}
          <Warning icon={AlertTriangle}>
            {LEAVE_COPY.undoExcuseWarning}
            {refunds ? ` ${LEAVE_COPY.undoExcuseRefunds}` : ''}
            {!oneDay ? ` ${LEAVE_COPY.undoExcuseWholeSpan}` : ''}
          </Warning>
          <Warning icon={ShieldPlus} tone='info'>
            {LEAVE_COPY.undoExcuseRefile}
          </Warning>

          {/* Optional — see the header comment. */}
          <div>
            <label style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 12, fontWeight: 700, color: 'var(--c-text-2)', marginBottom: 6,
            }}>
              {LEAVE_COPY.undoExcuseReason}
              <span style={{ marginInlineStart: 'auto', fontSize: 10.5, fontWeight: 600, color: 'var(--c-text-3)', fontVariantNumeric: 'tabular-nums' }}>
                {reason.length}/{REASON_MAX}
              </span>
            </label>
            <textarea
              value={reason} maxLength={REASON_MAX} rows={3}
              onChange={e => { setReason(e.target.value); setReasonError('') }}
              placeholder={LEAVE_COPY.undoExcuseReasonPlaceholder}
              style={{
                width: '100%', borderRadius: 10, background: '#fff',
                border: `1px solid ${reasonError ? 'var(--c-rejected)' : 'var(--c-border)'}`,
                padding: '10px 12px', fontSize: 13, fontFamily: 'var(--font-sans)',
                color: 'var(--c-text)', outline: 'none', resize: 'vertical', lineHeight: 1.6,
              }}
            />
            {reasonError
              ? <p style={{ margin: '6px 0 0', fontSize: 11.5, fontWeight: 600, color: 'var(--c-rejected)' }}>{reasonError}</p>
              : <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--c-text-3)', lineHeight: 1.6 }}>{LEAVE_COPY.undoExcuseReasonHint}</p>}
          </div>

          {error && (
            <div style={{
              fontSize: 12, fontWeight: 600, color: 'var(--c-rejected)', lineHeight: 1.7,
              background: 'var(--c-rejected-bg)', padding: '9px 12px', borderRadius: 9,
            }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 20px', borderTop: '1px solid var(--c-border)',
          display: 'flex', justifyContent: 'flex-start', gap: 10,
        }}>
          <button
            type='button' onClick={submit} disabled={submitting || !canSubmit}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, height: 40, padding: '0 18px', borderRadius: 10,
              background: 'var(--c-pending)', color: '#fff', border: 'none',
              fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
              cursor: (submitting || !canSubmit) ? 'default' : 'pointer',
              opacity: (submitting || !canSubmit) ? 0.6 : 1,
            }}
            className='hover:opacity-90'
          >
            {submitting ? <Loader2 size={15} className='animate-spin' /> : <Undo2 size={15} />}
            {LEAVE_COPY.undoExcuse}
          </button>
          <button
            type='button' onClick={onClose} disabled={submitting}
            style={{
              height: 40, padding: '0 18px', borderRadius: 10, background: '#fff',
              border: '1px solid var(--c-border)', fontFamily: 'var(--font-sans)',
              fontSize: 13, fontWeight: 700, color: 'var(--c-text-2)',
              cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.6 : 1,
            }}
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  )
}
