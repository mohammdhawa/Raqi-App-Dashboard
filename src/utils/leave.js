// Helpers for reading leave-request payloads. The attendance API isn't fully
// documented field-by-field, so each accessor reads the common Laravel naming
// variants and falls back gracefully — same defensive style used elsewhere in
// the dashboard (see notifText in Topbar).

export const LEAVE_TYPE_LABELS = {
  sick:         'مرضية',
  study:        'دراسية',
  annual:       'سنوية',
  unpaid:       'بلا أجرة',
  maternity:    'إجازة أمومة',
  bereavement:  'إجازة وفاة',
  compensatory: 'إجازة تعويضية',
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

// Chargeable (deducted) days — as of attendance v5 the backend's `requested_days`
// counts WORKING days only (weekends/holidays inside the span don't consume
// balance), so prefer that explicit value. Falls back to the inclusive calendar
// span when no explicit count is present.
export function getLeaveDays(item) {
  const explicit = item?.days ?? item?.requested_days ?? item?.days_count ?? item?.duration ?? item?.total_days
  if (explicit != null && explicit !== '') return Number(explicit)
  return getLeaveCalendarDays(item)
}

// Inclusive calendar span (end − start + 1) — the full length of the leave
// regardless of working days. Used alongside getLeaveDays to show both the
// deducted working days and the real calendar length.
export function getLeaveCalendarDays(item) {
  const start = getLeaveStart(item)
  const end = getLeaveEnd(item)
  if (!start || !end) return null
  const a = new Date(start), b = new Date(end)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null
  return Math.floor((b - a) / 86400000) + 1
}

// The leave endpoints' *validation* errors are Arabic (set in the FormRequests),
// but the business-rule 422s are raised in the controller as English strings.
// Translate the known ones; anything unrecognised falls through unchanged.
const LEAVE_API_MESSAGES = {
  'The selected period contains no working days.':
    'الفترة المحددة لا تحتوي على أيام عمل.',
  'Leave request exceeds the remaining annual leave balance.':
    'طلب الإجازة يتجاوز رصيد الإجازة السنوية المتبقّي.',
  'A pending or approved leave request already overlaps this period.':
    'يوجد طلب إجازة معلّق أو معتمد يتداخل مع هذه الفترة.',
  'Excuse exceeds the employee remaining annual leave balance. Send force=true to record it anyway.':
    'العذر يتجاوز رصيد الإجازة السنوية المتبقي للموظف.',
  'Allocation is lower than the days already approved for this year.':
    'لا يمكن أن يكون الرصيد أقل من الأيام المعتمدة بالفعل هذا العام.',
  'Only pending leave requests can be reviewed.':
    'لا يمكن مراجعة الطلبات التي تمت مراجعتها مسبقاً.',
  'Leave request exceeds the employee remaining annual leave balance.':
    'طلب الإجازة يتجاوز رصيد الإجازة السنوية المتبقّي للموظف.',
  'Unauthorized.':
    'ليس لديك صلاحية لتنفيذ هذا الإجراء.',
}

/** Arabic message for a leave-endpoint error, preferring field validation errors. */
export function leaveApiMessage(err, fallback = 'تعذّر تنفيذ الإجراء، حاول مرة أخرى') {
  const data = err?.response?.data
  if (data?.errors && typeof data.errors === 'object') {
    return Object.values(data.errors).flat().join('، ')
  }
  const msg = data?.message
  if (!msg) return fallback
  return LEAVE_API_MESSAGES[msg] ?? msg
}

// Leave-balance payload reader — { allocated, used, remaining } with fallbacks.
export function readLeaveBalance(data) {
  const b = data?.balance ?? data?.leave_balance ?? data ?? {}
  const num = (...keys) => {
    for (const k of keys) if (b[k] != null && b[k] !== '') return Number(b[k])
    return null
  }
  return {
    // The year the figures describe — POST /leave-requests returns the balance
    // for the *request's* year, which isn't necessarily the year on screen.
    year:      num('year'),
    allocated: num('allocated', 'allocated_days', 'total', 'total_days', 'annual', 'annual_days'),
    used:      num('used', 'used_days', 'taken', 'taken_days', 'consumed'),
    remaining: num('remaining', 'remaining_days', 'balance', 'available', 'available_days', 'left'),
    overBalance: num('over_balance_days', 'overBalanceDays', 'over_balance', 'overdraft_days') ?? 0,
  }
}
