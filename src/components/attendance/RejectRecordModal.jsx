// The one confirm dialog behind every refusal, shared by the daily report and
// the admin records table.
//
// The decision is made on the evidence, so the selfie and the location are part
// of the dialog rather than something HR has to open first: "wrong place" is
// unanswerable without the map link, and "not the employee" without the photo.

import { useState, useEffect } from 'react'
import {
  X, ShieldX, ShieldCheck, AlertTriangle, Loader2, MapPin, ImageOff, ExternalLink, Bell,
} from 'lucide-react'
import {
  REJECTION_REASONS, REJECTION_REASON_KEYS, REJECTION_COPY,
  rejectRecord, undoRejection, readRejectionError, readRejection, formatRejectedAt,
} from '../../utils/attendanceRejection'
import { formatDate, formatTime } from '../../utils/attendanceCapture'

const TYPE_LABEL = {
  check_in:  'تسجيل حضور',
  check_out: 'تسجيل انصراف',
}

const NOTE_MAX = 500

function Warning({ icon: Icon, tone = 'warn', children }) {
  const tones = {
    warn:  { bg: 'var(--c-pending-bg)',  border: 'var(--c-pending)22',    color: 'var(--c-pending)' },
    error: { bg: 'var(--c-rejected-bg)', border: 'rgba(192,57,43,0.22)',  color: 'var(--c-rejected)' },
    info:  { bg: 'var(--c-primary-light)', border: 'rgba(34,65,103,0.16)', color: 'var(--c-primary)' },
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

// Selfie + coordinates, side by side — what the refusal is judged on.
function EvidencePanel({ selfieUrl, latitude, longitude }) {
  const [imgFailed, setImgFailed] = useState(false)
  const hasLocation = latitude != null && longitude != null
  const showImage = Boolean(selfieUrl) && !imgFailed

  return (
    <div style={{
      display: 'flex', alignItems: 'stretch', gap: 12,
      padding: 10, borderRadius: 12,
      background: 'var(--c-surface)', border: '1px solid var(--c-border)',
    }}>
      <div style={{
        width: 92, height: 92, borderRadius: 10, flexShrink: 0, overflow: 'hidden',
        background: 'var(--c-surface-2)', color: 'var(--c-text-3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {showImage ? (
          <img
            src={selfieUrl} alt="صورة التسجيل" onError={() => setImgFailed(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <ImageOff size={22} />
        )}
      </div>

      <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 7, justifyContent: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--c-text-3)' }}>
          {REJECTION_COPY.evidence}
        </span>

        {selfieUrl ? (
          <a
            href={selfieUrl} target="_blank" rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700,
              color: 'var(--c-primary)', textDecoration: 'none',
            }}
          >
            <ExternalLink size={12} style={{ flexShrink: 0 }} />
            فتح الصورة بالحجم الكامل
          </a>
        ) : (
          <span style={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>{REJECTION_COPY.noSelfie}</span>
        )}

        {hasLocation ? (
          <a
            href={`https://www.google.com/maps?q=${latitude},${longitude}`}
            target="_blank" rel="noopener noreferrer" title="عرض الموقع على الخريطة"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700,
              color: 'var(--c-primary)', textDecoration: 'none', fontVariantNumeric: 'tabular-nums',
            }}
          >
            <MapPin size={12} style={{ flexShrink: 0 }} />
            {Number(latitude).toFixed(5)}, {Number(longitude).toFixed(5)}
          </a>
        ) : (
          <span style={{ fontSize: 11.5, color: 'var(--c-text-3)' }}>{REJECTION_COPY.noLocation}</span>
        )}
      </div>
    </div>
  )
}

/**
 * @param {object}   target   { recordId, name, email, type, recordedAt,
 *                             selfieUrl, latitude, longitude, source }
 *                            `source` is the row/record the refusal details are
 *                            read from in undo mode.
 * @param {'reject'|'undo'} mode
 * @param {Function} onDone   called with the API payload after a success — the
 *                            caller refetches from `rejected_records` /
 *                            `restored_records`, never patching one row.
 */
export default function RejectRecordModal({ target, mode = 'reject', onClose, onDone }) {
  const isUndo = mode === 'undo'
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState(null)

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && !submitting) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, submitting])

  const existing = isUndo ? readRejection(target?.source) : null
  const noteRequired = reason === 'other'
  const noteMissing = noteRequired && !note.trim()
  // Refusing a check-in takes the day's check-out down with it, so the warning
  // is shown for every target but a check-out. Undo makes no such distinction —
  // see REJECTION_COPY.undoRestoreNote.
  const takesWholeDay = target?.type !== 'check_out'
  const canSubmit = isUndo
    ? Boolean(target?.recordId)
    : Boolean(target?.recordId) && Boolean(reason) && !noteMissing

  const submit = async () => {
    if (submitting) return
    setError('')
    setFieldErrors(null)

    if (!target?.recordId) { setError('تعذّر تحديد السجل المطلوب.'); return }
    if (!isUndo && !reason) { setError('يرجى اختيار سبب الرفض.'); return }
    if (!isUndo && noteMissing) { setError(REJECTION_COPY.noteRequired); return }

    setSubmitting(true)
    try {
      const data = isUndo
        ? await undoRejection(target.recordId)
        : await rejectRecord(target.recordId, { reason, note })
      onDone(data)
      onClose()
    } catch (err) {
      const { message, errors, blocked } = readRejectionError(err)
      setError(message)
      setFieldErrors(errors)
      // 403 (out of scope / gone) and the two "already re-recorded" 422s are
      // answers about the row, not transient failures — pull the view again so
      // the button state matches what the server now holds.
      if (blocked || err?.response?.status === 403) onDone(null)
    } finally {
      setSubmitting(false)
    }
  }

  const title = isUndo ? REJECTION_COPY.undoTitle : REJECTION_COPY.rejectTitle
  const accent = isUndo ? 'var(--c-primary)' : 'var(--c-rejected)'
  const HeaderIcon = isUndo ? ShieldCheck : ShieldX

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
              <HeaderIcon size={17} style={{ color: accent, flexShrink: 0 }} />
              {title}
            </div>
            <div style={{
              fontSize: 12, color: 'var(--c-text-3)', marginTop: 4,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {target?.name ?? '—'} — {TYPE_LABEL[target?.type] ?? 'تسجيل'}
              {' · '}{formatDate(target?.recordedAt)} {formatTime(target?.recordedAt)}
            </div>
          </div>
          <button
            onClick={onClose} title="إغلاق"
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

          <EvidencePanel
            selfieUrl={target?.selfieUrl} latitude={target?.latitude} longitude={target?.longitude}
          />

          {isUndo ? (
            <>
              {existing && (
                <div style={{
                  padding: '11px 13px', borderRadius: 10,
                  background: 'var(--c-rejected-bg)', border: '1px solid rgba(192,57,43,0.22)',
                  display: 'flex', flexDirection: 'column', gap: 5,
                }}>
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--c-rejected)' }}>
                    {existing.label}
                  </span>
                  {existing.note && (
                    <span style={{ fontSize: 11.5, color: 'var(--c-text-2)', lineHeight: 1.6 }}>
                      {REJECTION_COPY.note}: {existing.note}
                    </span>
                  )}
                  <span style={{ fontSize: 10.5, color: 'var(--c-text-3)' }}>
                    {existing.by ? `${REJECTION_COPY.by}: ${existing.by} · ` : ''}
                    {existing.at ? `${REJECTION_COPY.at}: ${formatRejectedAt(existing.at)}` : ''}
                  </span>
                </div>
              )}
              <Warning icon={ShieldCheck} tone="info">
                {REJECTION_COPY.undoRestoreNote} {REJECTION_COPY.undoNoNotify}
              </Warning>
              <Warning icon={AlertTriangle}>
                {REJECTION_COPY.undoBlockedNote}
              </Warning>
            </>
          ) : (
            <>
              {/* Reasons — the long, employee-facing wording, because this is
                  the sentence the notification will carry. */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--c-text-2)', marginBottom: 8 }}>
                  {REJECTION_COPY.reasonLabel}
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {REJECTION_REASON_KEYS.map(key => {
                    const active = reason === key
                    return (
                      <label
                        key={key}
                        style={{
                          display: 'flex', alignItems: 'flex-start', gap: 9, cursor: 'pointer',
                          padding: '10px 12px', borderRadius: 10,
                          border: `1px solid ${active ? 'var(--c-rejected)' : 'var(--c-border)'}`,
                          background: active ? 'var(--c-rejected-bg)' : '#fff',
                          transition: 'background .12s, border-color .12s',
                        }}
                      >
                        <input
                          type="radio" name="rejection-reason" value={key}
                          checked={active} onChange={() => setReason(key)}
                          style={{ accentColor: 'var(--c-rejected)', cursor: 'pointer', flexShrink: 0, marginTop: 2 }}
                        />
                        <span style={{
                          fontSize: 12.5, fontWeight: active ? 700 : 600, lineHeight: 1.6,
                          color: active ? 'var(--c-text)' : 'var(--c-text-2)',
                        }}>
                          {REJECTION_REASONS[key]}
                        </span>
                      </label>
                    )
                  })}
                </div>
                {fieldErrors?.reason && (
                  <p style={{ margin: '6px 0 0', fontSize: 11.5, fontWeight: 600, color: 'var(--c-rejected)' }}>
                    {[].concat(fieldErrors.reason).join('، ')}
                  </p>
                )}
              </div>

              {/* Note — required for `other`, and validated before we send. */}
              <div>
                <label style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: 12, fontWeight: 700, color: 'var(--c-text-2)', marginBottom: 6,
                }}>
                  {noteRequired ? REJECTION_COPY.noteLabel : REJECTION_COPY.noteOptional}
                  {noteRequired && <span style={{ color: 'var(--c-rejected)' }}>*</span>}
                  <span style={{ marginInlineStart: 'auto', fontSize: 10.5, fontWeight: 600, color: 'var(--c-text-3)', fontVariantNumeric: 'tabular-nums' }}>
                    {note.length}/{NOTE_MAX}
                  </span>
                </label>
                <textarea
                  value={note} onChange={e => setNote(e.target.value.slice(0, NOTE_MAX))}
                  rows={2} maxLength={NOTE_MAX} placeholder={REJECTION_COPY.notePlaceholder}
                  style={{
                    width: '100%', borderRadius: 10, background: '#fff',
                    border: `1px solid ${noteMissing || fieldErrors?.note ? 'var(--c-rejected)' : 'var(--c-border)'}`,
                    padding: '10px 12px', fontSize: 13, fontFamily: 'var(--font-sans)',
                    color: 'var(--c-text)', outline: 'none', resize: 'vertical', lineHeight: 1.6,
                  }}
                />
                {(noteMissing || fieldErrors?.note) && (
                  <p style={{ margin: '6px 0 0', fontSize: 11.5, fontWeight: 600, color: 'var(--c-rejected)' }}>
                    {fieldErrors?.note ? [].concat(fieldErrors.note).join('، ') : REJECTION_COPY.noteRequired}
                  </p>
                )}
              </div>

              {takesWholeDay && (
                <Warning icon={AlertTriangle}>
                  {REJECTION_COPY.checkoutWarning} {REJECTION_COPY.reRecordNote}
                </Warning>
              )}
              <Warning icon={Bell} tone="info">
                {REJECTION_COPY.notifyWarning}
              </Warning>
            </>
          )}

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
            onClick={submit} disabled={submitting || !canSubmit}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, height: 40, padding: '0 18px', borderRadius: 10,
              background: accent, color: '#fff', border: 'none',
              fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
              cursor: (submitting || !canSubmit) ? 'default' : 'pointer',
              opacity: (submitting || !canSubmit) ? 0.6 : 1,
            }}
            className="hover:opacity-90"
          >
            {submitting ? <Loader2 size={15} className="animate-spin" /> : <HeaderIcon size={15} />}
            {isUndo ? REJECTION_COPY.confirmUndo : REJECTION_COPY.confirmReject}
          </button>
          <button
            onClick={onClose} disabled={submitting}
            style={{
              height: 40, padding: '0 18px', borderRadius: 10, background: '#fff',
              border: '1px solid var(--c-border)', fontFamily: 'var(--font-sans)',
              fontSize: 13, fontWeight: 700, color: 'var(--c-text-2)',
              cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.6 : 1,
            }}
          >
            {REJECTION_COPY.cancel}
          </button>
        </div>
      </div>
    </div>
  )
}
