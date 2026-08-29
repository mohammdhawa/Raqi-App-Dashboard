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

// Server limits on `approver_ids`, mirrored for UX only — the endpoint is still
// the authority and its 422s are surfaced as they come.
export const MIN_LEAVE_APPROVERS = 1
export const MAX_LEAVE_APPROVERS = 10

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

  // Sequential approval chain
  approvalChain:      'سير الاعتماد',
  currentApprover:    'المعتمد الحالي',
  waitingOn:          'بانتظار',
  chainOrderHint:
    'ترتيب القائمة هو ترتيب القرار: يبدأ الطلب بالمعتمد رقم 1، ولا ينتقل للتالي إلا بعد موافقته.',
  chainRejectionHint:
    'رفض أي معتمد ينهي الطلب فوراً، ولا تُطلب الخطوات التالية.',
  approversRequired:  'اختر معتمداً واحداً على الأقل.',
  approversMax:       `الحد الأقصى ${MAX_LEAVE_APPROVERS} معتمدين للطلب الواحد.`,
  approversDuplicate: 'لا يمكن تكرار المعتمد نفسه في سلسلة الاعتماد.',
  notYourTurn:        'ليس دورك بعد — بانتظار قرار المعتمد الحالي.',
  queueHint:          'القائمة تشمل كل طلب أنت معتمد فيه — الموافقة والرفض متاحان عند دورك فقط',
  // The admin reads this queue as a supervisor, never as an approver: the
  // listing shows them every request so they can reach a stranded one, but the
  // review endpoint refuses them and `can_review` is false on every row.
  adminQueueHint:     'القائمة تشمل كل طلبات الإجازة — القرار يبقى على المعتمدين، ولك إعادة إسناد أي خطوة معلّقة',
  observingOnly:      'أنت تتابع هذا الطلب كمشرف — القرار على المعتمد الحالي.',

  // Reassignment (admin)
  reassign:           'إعادة إسناد',
  reassignTitle:      'إعادة إسناد خطوة اعتماد',
  reassignHint:
    'نقل خطوة اعتماد معلّقة إلى مدير أو رئيس آخر — لا يعتمد الطلب ولا يرفضه، بل يغيّر من يقرر فيه فقط.',
  reassignStep:       'الخطوة المراد نقلها',
  reassignTo:         'المعتمد الجديد',
  reassignReason:     'سبب إعادة الإسناد',
  reassignReasonHint: 'مطلوب — يُحفظ في سجل إعادة الإسناد (3 إلى 500 حرف).',
  reassignNoSteps:    'لا توجد خطوات معلّقة يمكن نقلها في هذا الطلب.',
  reassignDone:       'تم نقل خطوة الاعتماد إلى المعتمد الجديد.',

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

// ── Sequential approval chain ────────────────────────────────────────────────
// A request carries an ordered `approvals` array, one entry per approver, and
// each entry's `status` is that STEP's state — not the request's. `skipped`
// means a rejection ahead of it means the step will never be asked, so it is
// finished work, not outstanding: it gets a neutral treatment, never the
// pending one.
//
// None of this is computed here. Which step is current, which were skipped and
// whether the viewer may act are all server answers (`current_approver_id`,
// `status`, `can_review`) — the chain advances under rules this side does not
// model, and guessing would hand someone a button the API will refuse.

export const APPROVAL_STEP_META = {
  pending:  { label: 'بانتظار الدور', color: 'var(--c-pending)',  bg: 'var(--c-pending-bg)' },
  approved: { label: 'وافق',          color: 'var(--c-approved)', bg: 'var(--c-approved-bg)' },
  rejected: { label: 'رفض',           color: 'var(--c-rejected)', bg: 'var(--c-rejected-bg)' },
  // Neutral on purpose: the request is already decided, nobody is waiting on
  // this person, and colouring it like `pending` would read as work left to do.
  skipped:  { label: 'لم تُطلب',      color: 'var(--c-text-3)',   bg: 'var(--c-surface-2)' },
}

/** Arabic label for one step's own status. */
export function approvalStepLabel(status) {
  return APPROVAL_STEP_META[status]?.label ?? '—'
}

// The two roles GET /attendance/leave-managers returns. An unknown value is
// echoed rather than blanked: a role this build has not heard of is still
// better named by the server's own word for it than by nothing.
export const LEAVE_ROLE_LABELS = { manager: 'مدير', chief: 'الرئيس الأعلى' }

/** Arabic label for an approver's role. */
export function leaveRoleLabel(role) {
  return LEAVE_ROLE_LABELS[role] ?? role
}

/**
 * The approval chain, ordered by `approval_order`, as the server sent it.
 *
 * A request filed before sequential approval existed carries no `approvals`
 * array. It is rendered as the chain of one it has always been, built from the
 * single approver the payload does name — the request's own status is that
 * lone step's status, there being no second step it could differ from.
 */
export function getApprovalChain(item) {
  const raw = item?.approvals ?? item?.approval_steps
  if (Array.isArray(raw) && raw.length) {
    return raw
      .map((step, i) => ({
        userId: step?.user_id ?? step?.user?.id ?? null,
        order: step?.approval_order ?? step?.order ?? i + 1,
        status: step?.status ?? 'pending',
        reviewedAt: step?.reviewed_at ?? null,
        user: step?.user ?? null,
        name: step?.user?.name ?? step?.name ?? null,
      }))
      .sort((a, b) => a.order - b.order)
  }

  const approver = item?.manager ?? null
  const approverId = item?.manager_id ?? approver?.id ?? null
  if (approverId == null) return []
  return [{
    userId: approverId,
    order: 1,
    status: item?.status === 'approved' || item?.status === 'rejected' ? item.status : 'pending',
    reviewedAt: item?.reviewed_at ?? null,
    user: approver,
    name: approver?.name ?? null,
  }]
}

/**
 * Whose turn it is, or null once the request is decided.
 *
 * `manager_id` is the fallback because it now *tracks* the current approver —
 * the first at submission, advancing with the chain — so it is the same answer
 * on a payload predating `current_approver_id`. It is only read on a pending
 * request: after a decision it rests on whoever made it, which is history, not
 * a turn.
 */
export function getCurrentApproverId(item) {
  const explicit = item?.current_approver_id
  if (explicit != null && explicit !== '') return explicit
  if (item?.status !== 'pending') return null
  return item?.manager_id ?? item?.manager?.id ?? null
}

/** The current approver as `{ id, order, name }`, or null once decided. */
export function getCurrentApprover(item) {
  const id = getCurrentApproverId(item)
  if (id == null) return null
  const step = getApprovalChain(item).find(s => String(s.userId) === String(id))
  return {
    id,
    order: step?.order ?? null,
    name: step?.name ?? item?.manager?.name ?? null,
  }
}

/**
 * The approver who closed the request — the last step that actually decided, so
 * the final approval on an approved request and the refusing step on a rejected
 * one. Null while the request is still pending.
 *
 * Read from the chain rather than from `manager_id`, which points at the same
 * person but only names them where the payload carries the `manager` relation.
 * The chain is loaded by every listing, so this answers on all of them.
 */
export function getDecidingApprover(item) {
  const decided = getApprovalChain(item)
    .filter(s => s.status === 'approved' || s.status === 'rejected')
  const step = decided[decided.length - 1]
  if (!step) return null
  return {
    id: step.userId,
    order: step.order,
    status: step.status,
    name: step.name ?? item?.manager?.name ?? null,
  }
}

/**
 * Whether the viewer may decide this request right now — `can_review`, which is
 * true only for the approver whose turn it is. Never re-derived: the approvals
 * queue lists every request the caller is *anywhere* on, so "assigned to me" and
 * "mine to decide" are different questions.
 *
 * A payload carrying no `can_review` at all predates the chain; such a request
 * had exactly one approver and the queue only ever held their own, so the
 * buttons stay live and the server stays the authority.
 */
export function canReviewLeave(item) {
  const flag = item?.can_review
  if (flag == null || flag === '') return true
  return flag === true || flag === 1 || flag === '1'
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
// counts WORKING days only (non-working days inside the span don't consume
// balance), so prefer that explicit value. Which days those are is server config
// (`attendance.working_days`, currently all seven days — no weekly day off, so
// today this equals the calendar span) and is never re-derived here. Falls back
// to the inclusive calendar span when no explicit count is present.
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
  // Sequential approval: the caller is on the chain but a step ahead of theirs
  // is still open. Translated rather than passed through, like every other
  // business-rule 422 here — the reason is the point, not the English.
  'It is not your turn to review this leave request.':
    'ليس دورك لمراجعة هذا الطلب — بانتظار قرار المعتمد الحالي.',
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
