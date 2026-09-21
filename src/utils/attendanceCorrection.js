// A check-out an admin filed by hand, as the reports read it.
//
// The audit trail is the whole point of the feature — a corrected day is
// indistinguishable from a normally recorded one in its times and hours — so
// every view that can show a corrected checkout reads it through here.

import { formatDate, formatTime } from './attendanceCapture'

/**
 * The correction behind a row or a day, or null when the checkout was recorded
 * by the employee. Two payload shapes reach this: the daily report flattens the
 * check-out row's audit columns onto the row (`corrected_by` there is the raw
 * user id), while the employee day grid nests a `correction` block carrying the
 * corrector's name.
 *
 * @returns {{by: string|number|null, at: string|null, note: string|null}|null}
 */
export function readCorrection(source) {
  const block = source?.correction
  if (block?.by || block?.at) {
    return { by: block.by ?? null, at: block.at ?? null, note: block.note ?? null }
  }

  const by = source?.corrected_by
  const at = source?.corrected_at
  if (!by && !at) return null

  return {
    by: by && typeof by === 'object' ? (by.name ?? by.email ?? null) : (by ?? null),
    at: at ?? null,
    note: source?.correction_note ?? block?.note ?? null,
  }
}

/** Tooltip for the "تم التصحيح" badge: the note, who corrected it and when. */
export function correctionTooltip({ by, at, note } = {}) {
  const parts = []
  if (note) parts.push(note)
  // A name in the day grid, but the daily report's payload carries the raw
  // `corrected_by` id — an id tells the reader nothing, so only a name shows.
  if (typeof by === 'string' && by.trim()) parts.push(`بواسطة: ${by}`)
  if (at) parts.push(`وقت التصحيح: ${formatDate(at)} — ${formatTime(at)}`)
  return parts.length ? parts.join('\n') : 'تم تصحيح الانصراف بواسطة مشرف'
}
