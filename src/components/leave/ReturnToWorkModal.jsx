// The employee turned up at work before their approved leave was over
// (POST /attendance/leave-requests/{id}/return-to-work).
//
// The sibling of UndoExcuseModal on the other half of the leave list, and the
// difference is the whole point of both:
//   • UndoExcuseModal retracts an HR entry that should never have existed, so
//     the entire row goes away and the absence comes back.
//   • this one ends a real leave a named manager granted. The days the employee
//     did take stay leave and stay approved; only the remainder is handed back.
//     Nothing about the approval is undone, which is why the confirm says so —
//     HR is recording an attendance fact, not reversing someone's decision.
//
// The outcome depends on the return date, so the modal states which one will
// happen before the click: returning mid-leave shortens it, returning on the
// first day leaves nothing to keep and cancels it. Both free the day for a
// check-in, which is what HR actually came here to do.
//
// The reason is optional, like the undo's: HR is recording something that
// happened, not justifying a decision. It reaches the employee when given.

import { useEffect, useMemo, useState } from 'react'
import { CalendarCheck, Loader2, ShieldCheck, TriangleAlert, X } from 'lucide-react'
import { useToast } from '../ui/Toast'
import DeductsBalanceBadge from '../ui/DeductsBalanceBadge'
import {
  LEAVE_COPY, deductsBalance, leaveApiMessage, returnLeaveToWork,
} from '../../utils/leave'

const REASON_MAX = 2000

const dayKey = value => (value ? String(value).slice(0, 10) : '')

function fmtDay(value) {
  if (!value) return '—'
  const d = new Date(`${dayKey(value)}T00:00:00`)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('ar-EG', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Damascus',
  })
}

/** Inclusive calendar days between two Y-m-d keys, or 0 when the range is empty. */
function daysBetween(from, to) {
  const a = new Date(`${from}T00:00:00Z`)
  const b = new Date(`${to}T00:00:00Z`)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0
  return Math.max(0, Math.round((b - a) / 86400000) + 1)
}

/** The day before `key`, as a Y-m-d key. */
function dayBefore(key) {
  const d = new Date(`${key}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return key
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

function Note({ icon: Icon, tone = 'info', children }) {
  const tones = {
    warn: { bg: 'var(--c-pending-bg)',    border: 'var(--c-pending)22',   color: 'var(--c-pending)' },
    info: { bg: 'var(--c-primary-light)', border: 'rgba(34,65,103,0.16)', color: 'var(--c-primary)' },
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
 *                           leaveTypeName, deductsBalance, approvedBy,
 *                           defaultReturnedOn }
 *                         `defaultReturnedOn` is the day the caller is looking
 *                         at — the leave tab is always keyed to one, and that
 *                         day is why the employee is standing there. It is
 *                         clamped into the leave below, so a stale view cannot
 *                         preselect a date the endpoint would refuse.
 * @param {Function} onDone  called with the API payload after a success, and
 *                           with `null` when the view is merely stale. Callers
 *                           refetch: one call moves the roster, the day's
 *                           counters and the balance at once.
 */
export default function ReturnToWorkModal({ target, onClose, onDone }) {
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [reasonError, setReasonError] = useState('')
  // A business-rule refusal this dialog cannot argue with — the leave is no
  // longer approved, or was never this caller's to touch. Retrying fails the same.
  const [resolved, setResolved] = useState(false)

  const start = dayKey(target?.startDate)
  const end = dayKey(target?.endDate)

  // Default to the day on screen, but never outside the leave: the endpoint
  // refuses those, and offering one would be a 422 the user cannot read off the
  // form. Falls back to the leave's own start when there is no day in hand.
  const initial = useMemo(() => {
    const wanted = dayKey(target?.defaultReturnedOn)
    if (!wanted || !start || !end) return wanted || start || ''
    if (wanted < start) return start
    if (wanted > end) return end
    return wanted
  }, [target?.defaultReturnedOn, start, end])

  // Seeded once. The caller keys this modal by leave id, so a different row
  // mounts a fresh instance rather than leaving a previous row's date in place —
  // which is why no effect syncs this back to `initial`.
  const [returnedOn, setReturnedOn] = useState(initial)

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && !submitting) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, submitting])

  const leaveRequestId = target?.leaveRequestId
  // The leave's own snapshot, read the one way the dashboard reads it: `null`
  // is a row filed before the flag existed, so no refund is promised.
  const deducts = deductsBalance({ deducts_balance: target?.deductsBalance })
  const refunds = deducts === true

  // Which of the two endings this date produces, and what it costs — computed
  // here so the confirm states it before the click rather than after. Under the
  // shipped calendar every day is a working day, so calendar days are the
  // chargeable days; the response's own `days_returned` is still what the toast
  // reports, so a configured day off can only make this preview generous, never
  // the record wrong.
  const inRange = Boolean(start && end && returnedOn >= start && returnedOn <= end)
  const willCancel = inRange && returnedOn === start
  const newEnd = inRange && !willCancel ? dayBefore(returnedOn) : ''
  const daysReturned = inRange ? daysBetween(returnedOn, end) : 0

  const canSubmit = Boolean(leaveRequestId) && inRange && !resolved

  const submit = async () => {
    if (submitting || !canSubmit) return
    setError('')
    setReasonError('')

    if (!leaveRequestId) { setError(LEAVE_COPY.returnToWorkNoTarget); return }
    // Mirrors the endpoint's own field rules so the obvious cases don't need a
    // round-trip; the server's 422s are still handled below.
    if (!inRange) { setError(LEAVE_COPY.returnToWorkDateOutside); return }
    if (reason.trim().length > REASON_MAX) { setReasonError(LEAVE_COPY.returnToWorkReasonMax); return }

    setSubmitting(true)
    try {
      const data = await returnLeaveToWork(leaveRequestId, { returnedOn, reason })
      toast.success(data?.cancelled ? LEAVE_COPY.returnToWorkDoneCancelled : LEAVE_COPY.returnToWorkDone)
      onDone(data)
      onClose()
    } catch (err) {
      const status = err?.response?.status
      const data = err?.response?.data ?? {}
      if (data.errors && typeof data.errors === 'object') {
        // `returned_on` and `reason` are the only fields that can fail, and
        // only `reason` has a message worth putting under the textarea.
        const msg = leaveApiMessage(err, LEAVE_COPY.returnToWorkFailed)
        if (data.errors.reason) setReasonError(msg)
        else setError(msg)
        return
      }
      // A scope denial, not a capability one: the body is `{"message":
      // "Unauthorized."}` with no `error` code, and no amount of retrying
      // brings this employee inside the caller's departments.
      setError(status === 403
        ? LEAVE_COPY.returnToWorkUnauthorized
        : leaveApiMessage(err, LEAVE_COPY.returnToWorkFailed))
      if (status === 403 || status === 422) setResolved(true)
      // Two HR users on the same screen and the other clicked first, or the
      // leave was decided out from under this view: the screen is stale rather
      // than broken, so it is refreshed behind the message. A 403 refreshes for
      // the same reason — the action should not have been on offer. The success
      // toast never fires here, so neither case can double up on one.
      if (status === 403 || status === 422) onDone(null)
    } finally {
      setSubmitting(false)
    }
  }

  const refundLine = refunds && daysReturned > 0
    ? ` ${LEAVE_COPY.returnToWorkRefunds.replace('{n}', LEAVE_COPY.returnToWorkDays(daysReturned))}`
    : ''

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
        role='dialog' aria-modal='true' aria-label={LEAVE_COPY.returnToWorkTitle}
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
              <CalendarCheck size={17} style={{ color: 'var(--c-primary)', flexShrink: 0 }} />
              {LEAVE_COPY.returnToWorkTitle}
            </div>
            <div style={{
              fontSize: 12, color: 'var(--c-text-3)', marginTop: 4,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {target?.name ?? '—'} · {fmtDay(start)} — {fmtDay(end)}
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

          {/* The leave being ended, and who granted it — the decision that is
              deliberately NOT being undone here. */}
          <div style={{
            padding: '11px 13px', borderRadius: 10,
            background: 'var(--c-primary-light)', border: '1px solid rgba(34,65,103,0.16)',
            display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--c-primary)' }}>
                {target?.leaveTypeName ?? 'إجازة معتمدة'}
              </span>
              <DeductsBalanceBadge deducts={deducts} compact short />
            </div>
            <span style={{ fontSize: 10.5, color: 'var(--c-text-3)' }}>
              اعتمدها: {target?.approvedBy ?? '—'}
            </span>
          </div>

          <Note icon={CalendarCheck}>{LEAVE_COPY.returnToWorkHint}</Note>

          {/* Return date — bounded by the leave, so the form cannot offer a
              date the endpoint would refuse. */}
          <div>
            <label style={{
              display: 'block', fontSize: 12, fontWeight: 700,
              color: 'var(--c-text-2)', marginBottom: 6,
            }}>
              {LEAVE_COPY.returnToWorkDate}
            </label>
            <input
              type='date' value={returnedOn} min={start} max={end}
              onChange={e => { setReturnedOn(e.target.value); setError('') }}
              style={{
                width: '100%', height: 40, borderRadius: 10, background: '#fff',
                border: `1px solid ${inRange ? 'var(--c-border)' : 'var(--c-rejected)'}`,
                padding: '0 12px', fontSize: 13, fontFamily: 'var(--font-sans)',
                color: 'var(--c-text)', outline: 'none',
              }}
            />
            <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--c-text-3)', lineHeight: 1.6 }}>
              {LEAVE_COPY.returnToWorkDateHint}
            </p>
          </div>

          {/* Which of the two endings this date produces, and the refund only
              when the type actually deducts. */}
          {inRange && (
            <Note icon={TriangleAlert} tone='warn'>
              {willCancel
                ? LEAVE_COPY.returnToWorkCancels
                : LEAVE_COPY.returnToWorkShortens
                  .replace('{end}', fmtDay(newEnd))
                  .replace('{was}', fmtDay(end))}
              {refundLine}
            </Note>
          )}

          {/* The distinction the endpoint rests on, stated where it is acted on. */}
          <Note icon={ShieldCheck}>{LEAVE_COPY.returnToWorkKeepsApproval}</Note>

          {/* Optional — see the header comment. */}
          <div>
            <label style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 12, fontWeight: 700, color: 'var(--c-text-2)', marginBottom: 6,
            }}>
              {LEAVE_COPY.returnToWorkReason}
              <span style={{ marginInlineStart: 'auto', fontSize: 10.5, fontWeight: 600, color: 'var(--c-text-3)', fontVariantNumeric: 'tabular-nums' }}>
                {reason.length}/{REASON_MAX}
              </span>
            </label>
            <textarea
              value={reason} maxLength={REASON_MAX} rows={3}
              onChange={e => { setReason(e.target.value); setReasonError('') }}
              placeholder={LEAVE_COPY.returnToWorkReasonPlaceholder}
              style={{
                width: '100%', borderRadius: 10, background: '#fff',
                border: `1px solid ${reasonError ? 'var(--c-rejected)' : 'var(--c-border)'}`,
                padding: '10px 12px', fontSize: 13, fontFamily: 'var(--font-sans)',
                color: 'var(--c-text)', outline: 'none', resize: 'vertical', lineHeight: 1.6,
              }}
            />
            {reasonError
              ? <p style={{ margin: '6px 0 0', fontSize: 11.5, fontWeight: 600, color: 'var(--c-rejected)' }}>{reasonError}</p>
              : <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--c-text-3)', lineHeight: 1.6 }}>{LEAVE_COPY.returnToWorkReasonHint}</p>}
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
              background: 'var(--c-primary)', color: '#fff', border: 'none',
              fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
              cursor: (submitting || !canSubmit) ? 'default' : 'pointer',
              opacity: (submitting || !canSubmit) ? 0.6 : 1,
            }}
            className='hover:opacity-90'
          >
            {submitting ? <Loader2 size={15} className='animate-spin' /> : <CalendarCheck size={15} />}
            {LEAVE_COPY.returnToWork}
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
