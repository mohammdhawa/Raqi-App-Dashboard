// HR/admin side of the attendance refusal
// (PATCH / DELETE /attendance/records/{record}/reject).
//
// A refusal is **not a status**. A check-in can be flagged `missing_checkout`
// *and* refused at the same time, so the flag is `is_rejected` / `rejected_at`;
// `status: "rejected"` exists only on derived report rows and in the employee
// day grid, never on a raw record.
//
// Refusing a check-in refuses that day's check-out with it, so one call can
// change two rows *and* move the employee between report sections. The response
// names every row it touched (`rejected_records` / `restored_records`) — callers
// refetch the view from that instead of flipping a single row's local state.
// `rejection_batch` is read-only bookkeeping: never sent, never shown.
//
// The long Arabic reason labels live in attendanceCapture (the employee was
// notified with that exact wording) and are re-exported here so the HR surfaces
// get one import and there is still only one copy of the strings.

import api from '../services/api'
import { REJECTION_REASONS, formatDate, formatTime } from './attendanceCapture'
import {
  ATTENDANCE_REJECT_FORBIDDEN,
  canRejectRecord,
  isAttendanceRejectCapabilityDenied,
} from './attendancePermissions'

export { ATTENDANCE_REJECT_FORBIDDEN, REJECTION_REASONS, canRejectRecord }

// Table/export wording for the same three grounds — the long labels are full
// sentences and don't fit a cell.
export const REJECTION_REASONS_SHORT = {
  location: 'موقع غير صحيح',
  selfie:   'صورة غير صحيحة',
  other:    'أخرى',
}

// Radio order in the confirm modal, and the reason filter's options.
export const REJECTION_REASON_KEYS = ['location', 'selfie', 'other']

// Shared copy. The dashboard has no i18n layer (Arabic only, RTL), so strings
// used by more than one screen live here — same convention as LEAVE_COPY.
export const REJECTION_COPY = {
  // Sections / tabs / filters
  section:        'تسجيلات مرفوضة',
  sectionEmpty:   'لا توجد تسجيلات مرفوضة',
  // Short line for the section heading; the full explanation — including the
  // two refusals deliberately absent from the section — is the tooltip.
  sectionHintShort: 'الأيام المرفوضة التي لم يُعَد تسجيلها',
  sectionHint:
    'التسجيلات التي رفضتها الموارد البشرية ولم يُعِد الموظف تسجيل يومها. '
    + 'من أعاد التسجيل بشكل صحيح يظهر ضمن «الحاضرون»، ومن رُفض انصرافه وحده يبقى ضمن «داخل الآن» — '
    + 'كلاهما يظهر في قائمة كل السجلات المرفوضة.',
  allRejectedLink: 'كل السجلات المرفوضة',
  rejectedFilter:  'سجلات مرفوضة',
  reasonFilter:    'سبب الرفض',
  onlyRejected:    'المرفوضة فقط',

  // Row-level
  badge:        'مرفوض',
  reason:       'سبب الرفض',
  note:         'ملاحظة الرفض',
  by:           'مرفوض بواسطة',
  at:           'وقت الرفض',
  rejectedDays: 'منها تسجيلات مرفوضة',
  rejectedDaysHint:
    'أيام غياب سببها تسجيل حضور رفضته الموارد البشرية ولم يُعَد تسجيله. '
    + 'محسوبة أصلاً ضمن أيام الغياب بدون عذر — لا تُضاف إليها.',
  dayStatus:    'تسجيل مرفوض',

  // Actions
  reject: 'رفض التسجيل',
  undo:   'تراجع عن الرفض',

  // Confirm modal
  rejectTitle:  'رفض تسجيل الحضور',
  undoTitle:    'التراجع عن رفض التسجيل',
  evidence:     'الصورة والموقع المسجّلان',
  noSelfie:     'لا توجد صورة مرفقة',
  noLocation:   'لا يوجد موقع مسجّل',
  reasonLabel:  'سبب الرفض',
  noteLabel:    'ملاحظة الرفض',
  noteOptional: 'ملاحظة الرفض (اختياري)',
  notePlaceholder: 'تفاصيل إضافية يراها الموظف في الإشعار...',
  noteRequired: 'الملاحظة مطلوبة عند اختيار «مخالفة تعليمات تسجيل الحضور».',
  checkoutWarning: 'سيتم رفض تسجيل الانصراف لنفس اليوم أيضاً.',
  notifyWarning:   'سيتم إشعار الموظف بسبب الرفض.',
  reRecordNote:    'يستطيع الموظف إعادة تسجيل هذا اليوم بعد الرفض.',
  undoNoNotify:    'لا يُرسَل إشعار للموظف عند التراجع عن الرفض.',
  // Deliberately batch-neutral. Undo restores exactly the rows the *same
  // decision* refused, and the client cannot tell how many that is: opening a
  // check-out that was refused alongside its check-in makes the server resolve
  // the batch back to that check-in and restore both, while a check-out refused
  // on its own restores alone. `target.type` does not separate those two cases,
  // so the copy names the rule instead of guessing the count.
  undoRestoreNote: 'سيُستعاد هذا التسجيل وكل ما رُفض معه في القرار نفسه.',
  undoBlockedNote: 'لا يمكن التراجع بعد أن يعيد الموظف تسجيل اليوم.',
  confirmReject: 'تأكيد الرفض',
  confirmUndo:   'تأكيد التراجع',
  cancel:        'إلغاء',
}

// The business-rule 422s of §3.9, verbatim. The server sends them already
// localized and they are displayed as-is; these are here so the two
// undo-blocked ones can be recognised and explained (below), and as the
// fallback when a response arrives with no body.
export const REJECTION_MESSAGES = {
  forbidden:        'ليس لديك صلاحية لرفض تسجيلات الحضور.',
  outOfScope:       'هذا السجل خارج نطاق صلاحيتك.',
  alreadyRejected:  'تم رفض هذا السجل مسبقاً.',
  notRejected:      'هذا السجل غير مرفوض.',
  standingCheckIn:  'لا يمكن التراجع عن الرفض: يوجد تسجيل حضور قائم لهذا اليوم بالفعل.',
  standingCheckOut: 'لا يمكن التراجع عن الرفض: يوجد تسجيل انصراف قائم لهذا اليوم بالفعل.',
}

// Those last two are the expected end of a refusal's life, not a failure:
// refusing a day is what invites the employee to record it again, and once they
// have, the refusal has to stand. Left bare, HR reads "لا يمكن" as a bug.
const UNDO_BLOCKED_HINT = ' الموظف أعاد تسجيل هذا اليوم بعد الرفض، لذلك يبقى الرفض قائماً.'

// ── Reading a refusal ────────────────────────────────────────────────────────

/** `true` when HR refused this event. Never read `status` for this. */
export function isRejected(record) {
  return Boolean(record?.is_rejected ?? record?.rejected_at)
}

/**
 * The reviewer's display name, or null when the payload carries only an id.
 *
 * The two payloads name the reviewer differently: a report row's `rejection`
 * block carries `rejected_by` as a *name*, while a raw AttendanceRecord keeps
 * `rejected_by` as the reviewer's *id* and carries the name alongside it in the
 * appended `rejected_by_name`. Both are read here so one badge serves both.
 *
 * A bare id is never rendered — "مرفوض بواسطة: 7" tells HR nothing — so the
 * tooltip drops the "who" line rather than showing one. That is the fallback,
 * not the normal path: every endpoint returning raw records now sends the name.
 */
function actorName(block) {
  const named = block?.rejected_by_name
    ?? block?.rejected_by_user?.name
    ?? block?.rejecter?.name
  if (named) return named

  const value = block?.rejected_by
  if (value == null) return null
  if (typeof value === 'object') return value.name ?? value.email ?? null

  const text = String(value).trim()
  if (!text || /^\d+$/.test(text)) return null
  return text
}

export function formatRejectedAt(value) {
  if (!value) return ''
  const time = formatTime(value)
  return time ? `${formatDate(value)} — ${time}` : formatDate(value)
}

/**
 * Normalize either shape into one object, or null when nothing was refused:
 *
 *   • a raw AttendanceRecord   → `rejection_reason` / `rejection_note` / …
 *   • a report row / day cell  → a nested `rejection` block, which additionally
 *     carries `reason_label` (rendered as sent — never re-derived from `reason`,
 *     so the row always says exactly what the employee was told).
 *
 * `by` reads whichever of the two reviewer shapes the payload uses — see
 * actorName.
 */
export function readRejection(source) {
  if (!source) return null
  const block = source.rejection ?? source
  const reason = block.reason ?? block.rejection_reason ?? null
  const at = block.rejected_at ?? null
  if (!reason && !at) return null

  return {
    reason,
    label: block.reason_label ?? REJECTION_REASONS[reason] ?? REJECTION_REASONS.other,
    short: REJECTION_REASONS_SHORT[reason] ?? REJECTION_REASONS_SHORT.other,
    note: block.note ?? block.rejection_note ?? null,
    at,
    by: actorName(block),
    // Only the day grid sends this — the check-in the refusal was filed against.
    recordedAt: block.recorded_at ?? null,
  }
}

/**
 * Multi-line `title=` for the «مرفوض» badge: grounds, note, who and when.
 * Each line is omitted when the payload does not carry it — see actorName for
 * why `who` is absent on records-table rows.
 */
export function rejectionTooltip(source) {
  const r = readRejection(source)
  if (!r) return ''
  const lines = [r.label]
  if (r.note) lines.push(`${REJECTION_COPY.note}: ${r.note}`)
  if (r.by)   lines.push(`${REJECTION_COPY.by}: ${r.by}`)
  if (r.at)   lines.push(`${REJECTION_COPY.at}: ${formatRejectedAt(r.at)}`)
  return lines.join('\n')
}

// ── Calls ────────────────────────────────────────────────────────────────────

/**
 * Refuse one event. `{record}` is the check-in row id everywhere except the
 * records table, where each event has its own row — a check-out can only be
 * refused on its own from there.
 *
 * Resolves to `{ message, record, rejected_records }`; refresh the view from
 * `rejected_records`, which holds the check-in and any check-out taken with it.
 */
export async function rejectRecord(recordId, { reason, note } = {}) {
  const body = { reason }
  const trimmed = note?.trim()
  if (trimmed) body.note = trimmed
  const res = await api.patch(`/attendance/records/${recordId}/reject`, body)
  return res.data
}

/** Undo a refusal → `{ message, record, restored_records }`. No notification. */
export async function undoRejection(recordId) {
  const res = await api.delete(`/attendance/records/${recordId}/reject`)
  return res.data
}

/**
 * Arabic message for a failed reject/undo, plus the per-field `errors` bag so a
 * form can render `errors.note` inline.
 *
 * The 403 is raised **before** validation, so a failure is not necessarily the
 * `422` shape. `blocked` marks the two "the day was already re-recorded" cases,
 * which callers treat as an answer (refresh the row) rather than an error.
 */
export function readRejectionError(err, fallback = 'تعذّر تنفيذ الإجراء، حاول مرة أخرى.') {
  const res = err?.response
  const data = res?.data
  const capabilityDenied = isAttendanceRejectCapabilityDenied(res)

  if (data?.errors && typeof data.errors === 'object') {
    return {
      message: Object.values(data.errors).flat().join('، '),
      errors: data.errors,
      blocked: false,
      capabilityDenied: false,
    }
  }

  const message = data?.message
    ?? (capabilityDenied
      ? REJECTION_MESSAGES.forbidden
      : (res?.status === 403 ? REJECTION_MESSAGES.outOfScope : fallback))
  const blocked = message === REJECTION_MESSAGES.standingCheckIn
    || message === REJECTION_MESSAGES.standingCheckOut

  return {
    message: blocked ? message + UNDO_BLOCKED_HINT : message,
    errors: null,
    blocked,
    capabilityDenied,
  }
}
