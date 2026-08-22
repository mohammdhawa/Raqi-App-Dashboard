// Helpers for reading leave-request payloads. The attendance API isn't fully
// documented field-by-field, so each accessor reads the common Laravel naming
// variants and falls back gracefully — same defensive style used elsewhere in
// the dashboard (see notifText in Topbar).

// Legacy free-text codes, from before `leave_types` existed. Rows filed since
// then store the type's Arabic label in `leave_type`, so this map is only a
// fallback for the old raw strings — never a switch to drive logic off.
export const LEAVE_TYPE_LABELS = {
  sick:             'مرضية',
  study:            'دراسية',
  annual:           'سنوية',
  emergency:        'إجازة طارئة',
  unpaid:           'بلا أجرة',
  maternity:        'إجازة أمومة',
  bereavement:      'إجازة وفاة',
  official_mission: 'مأمورية رسمية',
  compensatory:     'إجازة تعويضية',
}

export function leaveTypeLabel(type) {
  const raw = type && typeof type === 'object'
    ? (type.name_ar ?? type.name ?? type.label ?? type.name_en ?? type.code ?? type.key)
    : type
  if (!raw) return '—'
  return LEAVE_TYPE_LABELS[raw] ?? raw
}

/**
 * Display label for a leave request / report row.
 *
 * Prefers `leave_type_name` (resolved server-side from the linked type), then
 * the `type` relation, and only then the stored `leave_type` string — which
 * holds the type's Arabic label on new rows but raw free text on older ones.
 */
export function leaveTypeName(item) {
  if (!item) return '—'
  const resolved = item.leave_type_name
    ?? item.excuse?.leave_type_name
    ?? item.type?.name_ar ?? item.type?.name_en ?? item.type?.code
  if (resolved) return resolved
  return leaveTypeLabel(item.leave_type ?? getLeaveType(item))
}

/**
 * Whether this row consumed an annual-balance day.
 *
 * Always the per-row snapshot (`deducts_balance`), never derived from the type
 * — re-deciding a type later applies to future requests only, so computing it
 * client-side would misreport leave already taken. `null` = the row predates
 * the flag and nothing can be claimed about it.
 */
export function deductsBalance(item) {
  const raw = item?.deducts_balance ?? item?.excuse?.deducts_balance
  if (raw == null || raw === '') return null
  return raw === true || raw === 1 || raw === '1'
}

// ── Copy ─────────────────────────────────────────────────────────────────────
// The dashboard has no i18n layer (Arabic only, RTL), so the strings shared by
// more than one screen live here rather than being repeated inline. Two words
// both read as "excused" and must never be conflated:
//   • the STATUS  «غياب بعذر»    = is_excuse — HR filed it after the fact.
//   • the BALANCE «أيام لم تُخصم» = deducts_balance = false — it cost nothing.
export const LEAVE_COPY = {
  // Status (reports)
  excusedStatus:      'غياب بعذر',
  excusedStatusShort: 'بعذر',
  excusedSectionHint: 'أيام غياب سجّلت الموارد البشرية عذراً عنها — لا تظهر ضمن الإجازات المخطط لها.',
  absentNoExcuse:     'أيام الغياب بدون عذر',
  absentNoExcuseShort:'غياب بدون عذر',

  // Balance policy (deducts_balance)
  deducts:            'تُخصم من الرصيد',
  notDeducts:         'لا تُخصم من الرصيد',
  deductsShort:       'تُخصم',
  notDeductsShort:    'لا تُخصم',
  nonDeductingDays:     'أيام لم تُخصم',
  nonDeductingDaysHint: 'أيام إجازة معتمدة لا تُخصم من الرصيد السنوي (مرضية، مأمورية، وفاة…)',
  deductedFromBalance:'منها مخصومة من الرصيد',
  notDeductedFromBalance: 'منها غير مخصومة',

  // Excuse form
  recordedDeducted:    'سُجّل العذر وخُصم من الرصيد',
  recordedNotDeducted: 'سُجّل العذر ولم يُخصم من الرصيد',
  attendedDatesTitle:  'الموظف حاضر في بعض هذه الأيام',
  attendedDates:
    'الموظف سجّل حضوراً في بعض هذه الأيام، فلا يوجد غياب لتبريره. سجّل العذر للأيام الغائبة فعلاً.',
  excludeAttendedDays: 'استثنِ هذه الأيام',
  forceUnavailable:    'هذا النوع لا يُخصم من الرصيد، فلا حاجة لتجاوز الرصيد.',
  excuseUnauthorized:  'لا تملك صلاحية تسجيل عذر لهذا الموظف.',
  reasonRequiredByType: 'هذا النوع من الإجازات يتطلب ذكر السبب.',
  // The API still accepts a request with no type for backward compatibility and
  // silently falls back to a deducting, unlabelled one — so the UI is what has
  // to insist on a choice.
  typeRequired: 'نوع الإجازة مطلوب.',

  // Leave-types admin screen
  typesTitle:        'أنواع الإجازات',
  typesSubtitle:
    'المفردات التي تُبنى عليها طلبات الإجازة والأعذار، وأهمها تحديد ما إذا كان النوع يُخصم من الرصيد السنوي.',
  retired:           'متقاعد',
  active:            'مُفعّل',
  forRequests:       'طلبات الموظفين',
  forExcuses:        'أعذار الموارد البشرية',
  requiresReason:    'يتطلب ذكر السبب',
  codeLocked:        'الرمز لا يمكن تعديله بعد الإنشاء',
  codeLockedHint:
    'الرمز هو المعرّف الثابت الذي تُطابَق به الطلبات القديمة المخزّنة كنص حر، لذلك لا يمكن تغييره بعد الإنشاء.',
  retireInsteadOfDelete:
    'إذا كان هذا النوع مستخدماً في طلبات قائمة فلن يُحذف، بل يُتقاعَد ويختفي من قوائم الاختيار — وتبقى الطلبات السابقة مرتبطة به.',
  retiredInsteadOfDeleted: 'النوع مستخدم في طلبات قائمة، لذلك تم تقاعده بدلاً من حذفه.',
  deductsChangeWarning:
    'تغيير الخصم من الرصيد ينطبق على الطلبات الجديدة فقط — الطلبات المسجّلة سابقاً تحتفظ بالسياسة التي سُجّلت بها.',
}

// The `excused` status colour, shared by the daily report, the monthly report
// and the employee day grid so the same day reads the same way everywhere.
// Deliberately neither the leave navy nor the absence red: its whole purpose is
// to say "this absence was answered for".
export const EXCUSED_META = {
  label: LEAVE_COPY.excusedStatus,
  color: '#6D4AAE',
  bg:    '#F1EBFB',
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

/**
 * The parts of [start, end] left once `excluded` days are taken out, as a list
 * of contiguous `{ start, end }` ranges.
 *
 * Used by the excuse form to re-file around the `attended_dates` the API
 * refused: an excuse answers for days the employee did *not* come in, so the
 * days they did are cut out and each remaining stretch is offered on its own.
 *
 * Dates are plain `Y-m-d` strings and are walked in UTC, so the result never
 * shifts across midnight in the browser's local zone.
 */
export function splitDateRange(start, end, excluded = []) {
  if (!start || !end || end < start) return []
  const skip = new Set(excluded)
  const segments = []
  let open = null

  const cursor = new Date(`${start}T00:00:00Z`)
  const last = new Date(`${end}T00:00:00Z`)
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(last.getTime())) return []

  for (; cursor <= last; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const day = cursor.toISOString().slice(0, 10)
    if (skip.has(day)) {
      open = null
      continue
    }
    if (open) open.end = day
    else { open = { start: day, end: day }; segments.push(open) }
  }

  return segments
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
  // An excuse answers for a day the employee did NOT come in; `force` does not
  // waive this one. The response names the offending days in `attended_dates`.
  'The employee has attendance on some of these days, so there is no absence to excuse. File the excuse for the days actually missed.':
    LEAVE_COPY.attendedDates,
  'Leave excuse recorded.':
    'تم تسجيل العذر.',
  'Leave type created.':
    'تم إنشاء نوع الإجازة.',
  'Leave type updated.':
    'تم حفظ التعديلات.',
  'Leave type deleted.':
    'تم حذف نوع الإجازة.',
  'Leave type is in use; it has been deactivated instead of deleted.':
    LEAVE_COPY.retiredInsteadOfDeleted,
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
    // Approved days taken under a non-deducting type. Excluded from `used` by
    // design — reported separately so HR can see where the days went instead of
    // reading them as part of the allocation.
    //
    // NOT the same as the reports' `excused`, which counts HR-filed excuses
    // (`is_excuse`) whether or not they deducted. The API renamed this field
    // from `excused_days` for exactly that reason; the old key is still read so
    // the dashboard survives being deployed ahead of the API.
    nonDeducting: num('non_deducting_days', 'nonDeductingDays', 'excused_days') ?? 0,
  }
}
