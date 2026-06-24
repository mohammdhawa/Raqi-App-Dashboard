// Helpers for reading leave-request payloads. The attendance API isn't fully
// documented field-by-field, so each accessor reads the common Laravel naming
// variants and falls back gracefully — same defensive style used elsewhere in
// the dashboard (see notifText in Topbar).

export const LEAVE_TYPE_LABELS = {
  annual:    'سنوية',
  sick:      'مرضية',
  emergency: 'طارئة',
  unpaid:    'بدون راتب',
  maternity: 'أمومة',
  paternity: 'أبوة',
  casual:    'عارضة',
  other:     'أخرى',
}

export function leaveTypeLabel(type) {
  const raw = type && typeof type === 'object' ? (type.name ?? type.label ?? type.key) : type
  if (!raw) return '—'
  return LEAVE_TYPE_LABELS[raw] ?? raw
}

export function getLeaveUser(item) {
  return item?.user ?? item?.employee ?? item?.requester ?? null
}

export function getLeaveType(item) {
  return item?.type ?? item?.leave_type ?? item?.leaveType ?? null
}

export function getLeaveReason(item) {
  return item?.reason ?? item?.note ?? item?.notes ?? item?.description ?? ''
}

export function getLeaveStart(item) {
  return item?.start_date ?? item?.from ?? item?.from_date ?? item?.starts_at ?? item?.start ?? null
}

export function getLeaveEnd(item) {
  return item?.end_date ?? item?.to ?? item?.to_date ?? item?.ends_at ?? item?.end ?? null
}

// Requested days — prefer an explicit backend value; otherwise derive an
// inclusive day count from the date range.
export function getLeaveDays(item) {
  const explicit = item?.days ?? item?.requested_days ?? item?.days_count ?? item?.duration ?? item?.total_days
  if (explicit != null && explicit !== '') return Number(explicit)
  const start = getLeaveStart(item)
  const end = getLeaveEnd(item)
  if (!start || !end) return null
  const a = new Date(start), b = new Date(end)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null
  return Math.floor((b - a) / 86400000) + 1
}

// Leave-balance payload reader — { allocated, used, remaining } with fallbacks.
export function readLeaveBalance(data) {
  const b = data?.balance ?? data?.leave_balance ?? data ?? {}
  const num = (...keys) => {
    for (const k of keys) if (b[k] != null && b[k] !== '') return Number(b[k])
    return null
  }
  return {
    allocated: num('allocated', 'allocated_days', 'total', 'total_days', 'annual', 'annual_days'),
    used:      num('used', 'used_days', 'taken', 'taken_days', 'consumed'),
    remaining: num('remaining', 'remaining_days', 'balance', 'available', 'available_days', 'left'),
  }
}
