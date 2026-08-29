import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/ui/Toast'
import {
  CalendarCheck, CalendarDays, CalendarClock, Wallet, Check, X,
  Inbox, Loader2, Building2, MessageSquare, Calendar, ClipboardCheck,
  CalendarPlus, AlertTriangle, Hourglass, UserCog,
} from 'lucide-react'
import LeaveStatusBadge from '../components/ui/LeaveStatusBadge'
import LeaveExcuseBadge from '../components/ui/LeaveExcuseBadge'
import DeductsBalanceBadge from '../components/ui/DeductsBalanceBadge'
import SubmitLeaveModal from '../components/leave/SubmitLeaveModal'
import ApprovalChain from '../components/leave/ApprovalChain'
import ReassignApproverModal from '../components/leave/ReassignApproverModal'
import { LeaveTypeFilter } from '../components/leave/LeaveTypeSelect'
import {
  getLeaveUser, getLeaveReason, getLeaveStart, getLeaveEnd,
  getLeaveDays, getLeaveCalendarDays, leaveTypeName, deductsBalance, readLeaveBalance,
  leaveApiMessage, LEAVE_COPY, EXCUSED_META,
  getApprovalChain, getCurrentApprover, getCurrentApproverId, getDecidingApprover,
  canReviewLeave,
} from '../utils/leave'
import { DepartmentSelect, SectionSelect, SearchInput } from '../components/attendance/filters'
import { ExportButton, SortableTh, ToggleChip, MultiSelect } from '../components/attendance/controls'
import { sortParams } from '../utils/attendanceQuery'
import { useDeptSections } from '../utils/useDeptSections'

function formatDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Damascus' })
}

// Laravel paginators arrive under different wrapper keys depending on the
// resource; read the common ones and fall back to a flat array / empty page.
function pickPage(data, keys) {
  for (const k of keys) {
    const v = data?.[k]
    if (v && Array.isArray(v.data)) return v
  }
  if (data && Array.isArray(data.data)) return data
  if (Array.isArray(data)) return { data, current_page: 1, last_page: 1, total: data.length }
  return { data: [], current_page: 1, last_page: 1, total: 0 }
}

// ── Small UI atoms ───────────────────────────────────────────────────────────

function InitialsTag({ name, size = 34 }) {
  const initials = (name ?? '؟').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('')
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg, var(--c-primary), #1C3A5E)',
      color: '#fff', fontWeight: 800, fontSize: size * 0.34,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {initials}
    </div>
  )
}

function DeptCell({ name }) {
  if (!name) return <span style={{ color: 'var(--c-text-3)', fontSize: 12.5 }}>—</span>
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--c-text-2)' }}>
      <Building2 size={12} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
      {name}
    </span>
  )
}

// The type label plus, on a non-deducting row, the badge saying so — an
// approver reviewing a queue needs to see which requests are free.
//
// Both come off the row: `leave_type_name`/`type` for the label (the stored
// `leave_type` string is the type's Arabic label on new rows but raw free text
// on older ones, so it is never switched on), and the `deducts_balance`
// snapshot for the policy.
function LeaveTypePill({ item }) {
  const deducts = deductsBalance(item)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 999,
        fontSize: 11.5, fontWeight: 700, lineHeight: 1.5, whiteSpace: 'nowrap',
        background: 'var(--c-surface-2)', color: 'var(--c-text-2)',
      }}>
        {leaveTypeName(item)}
      </span>
      {deducts === false && <DeductsBalanceBadge deducts={false} compact short />}
    </div>
  )
}

// Days cell: the deducted working-day count (requested_days) as the headline,
// with the full calendar span shown underneath when it differs (non-working days
// inside the leave aren't charged, so the two numbers diverge). The server
// calendar is currently all seven days, so they usually match and the second
// line stays hidden — it reappears once a day off is configured. Both figures
// come from the server; nothing is counted here.
function DaysCell({ item }) {
  const days = getLeaveDays(item)
  const calendar = getLeaveCalendarDays(item)
  if (days == null) return <span style={{ color: 'var(--c-text-3)', fontSize: 12.5 }}>—</span>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--c-text)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        {days} يوم عمل
      </span>
      {calendar != null && calendar !== days && (
        <span style={{ fontSize: 11, color: 'var(--c-text-3)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {calendar} يوم تقويمي
        </span>
      )}
    </div>
  )
}

function PagBtn({ children, active, disabled, onClick }) {
  return (
    <button
      onClick={onClick} disabled={disabled}
      style={{
        width: 32, height: 32, borderRadius: 8,
        cursor: disabled ? 'default' : 'pointer',
        border: active ? 'none' : '1px solid var(--c-border)',
        background: active ? 'var(--c-primary)' : '#fff',
        color: active ? '#fff' : disabled ? 'var(--c-text-3)' : 'var(--c-text-2)',
        fontFamily: 'var(--font-sans)', fontWeight: active ? 700 : 400,
        fontSize: active ? 12.5 : 14,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  )
}

// ── Leave balance widget ─────────────────────────────────────────────────────

function BalanceTile({ icon: Icon, label, value, accent, title }) {
  return (
    <div title={title} style={{
      flex: 1, minWidth: 150, display: 'flex', alignItems: 'center', gap: 12,
      padding: '14px 16px', borderRadius: 12, cursor: title ? 'help' : undefined,
      background: '#fff', border: '1px solid var(--c-border)',
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 11, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: accent.bg, color: accent.color,
      }}>
        <Icon size={19} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--c-text-2)' }}>{label}</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--c-text)', lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>
          {value == null ? '—' : value}
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-text-3)', marginInlineStart: 4 }}>يوم</span>
        </div>
      </div>
    </div>
  )
}

function BalanceWidget({ balance, loading }) {
  if (loading) {
    return (
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 22 }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{
            flex: 1, minWidth: 150, height: 68, borderRadius: 12,
            background: 'var(--c-surface-2)', animation: 'pulse 1.5s ease-in-out infinite',
            animationDelay: `${i * 0.08}s`,
          }} />
        ))}
      </div>
    )
  }
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      <BalanceTile
        icon={Wallet} label="الرصيد السنوي المخصص" value={balance?.allocated}
        accent={{ bg: 'var(--c-primary-light)', color: 'var(--c-primary)' }}
      />
      <BalanceTile
        icon={CalendarClock} label="الأيام المستخدمة" value={balance?.used}
        accent={{ bg: 'var(--c-rejected-bg)', color: 'var(--c-rejected)' }}
      />
      {/* Approved days that justified an absence without costing the
          allocation. Deliberately labelled apart from "الأيام المستخدمة": it is
          excluded from used_days by design, and reading it as part of the
          allocation is exactly the mistake to prevent. */}
      <BalanceTile
        icon={CalendarCheck} label={LEAVE_COPY.nonDeductingDays} value={balance?.nonDeducting}
        title={LEAVE_COPY.nonDeductingDaysHint}
        accent={{ bg: EXCUSED_META.bg, color: EXCUSED_META.color }}
      />
      <BalanceTile
        icon={CalendarCheck} label="الأيام المتبقية" value={balance?.remaining}
        accent={{ bg: 'var(--c-approved-bg)', color: 'var(--c-approved)' }}
      />
      </div>
      {Number(balance?.overBalance ?? 0) > 0 && (
        <div style={{ marginTop: 10, padding: '10px 13px', borderRadius: 10, background: 'var(--c-rejected-bg)', color: 'var(--c-rejected)', fontSize: 12.5, fontWeight: 800 }}>
          تجاوز الرصيد بـ {balance.overBalance} يوم
        </div>
      )}
    </div>
  )
}

// `manager_id` is no longer "the manager responsible for this request" — it
// tracks whoever must act NOW, advancing with the chain and coming to rest on
// whoever made the final decision. So a pending row names its current approver
// as such; a decided one shows the approver who closed it, unlabelled, because
// "current" would be a claim about a request nobody is holding any more. The
// full picture is the سير الاعتماد column.
function LeaveOriginCell({ item }) {
  if (item.is_excuse) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
        <LeaveExcuseBadge compact />
        <span style={{ fontSize: 10.5, color: 'var(--c-text-3)', whiteSpace: 'nowrap' }}>
          {item.creator?.name ?? 'الموارد البشرية'}
        </span>
      </div>
    )
  }
  const current = getCurrentApprover(item)
  // Once decided, the name to show is the step that actually decided — taken
  // from the chain, which every listing loads, rather than from `manager`,
  // which is a relation a payload may or may not carry.
  const decided = current ? null : getDecidingApprover(item)
  const name = current?.name ?? decided?.name ?? item.manager?.name ?? '—'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--c-text-2)' }}>طلب موظف</span>
      <span style={{ fontSize: 10.5, color: 'var(--c-text-3)', whiteSpace: 'nowrap' }}>
        {current ? `${LEAVE_COPY.currentApprover}: ${name}` : name}
      </span>
    </div>
  )
}

// ── Review (approve / reject) modal ──────────────────────────────────────────

// No note/comment field: PATCH …/review accepts `status` only, so anything else
// typed here would be silently dropped by the API.
function ReviewModal({ item, action, onClose, onConfirm }) {
  const [submitting, setSubmitting] = useState(false)
  const u = getLeaveUser(item)
  const isApprove = action === 'approve'
  const chain = getApprovalChain(item)
  // A rejection at any step is final: the request becomes `rejected` and every
  // step behind it becomes `skipped`. Worth saying out loud before the click,
  // but only when there is a later step for it to cost — counted over the steps
  // still PENDING, not the whole chain, because on the last step of a chain
  // whose earlier steps have all approved there is nothing left to skip.
  const endsChain = !isApprove && chain.filter(s => s.status === 'pending').length > 1

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && !submitting) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, submitting])

  const confirm = async () => {
    setSubmitting(true)
    const ok = await onConfirm()
    if (!ok) setSubmitting(false) // keep modal open on failure; parent closes on success
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
        onClick={e => e.stopPropagation()}
        style={{ width: 'min(460px, 100%)', background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: 'var(--sh-card-lg)' }}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--c-border)' }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--c-text)' }}>
            {isApprove ? 'الموافقة على طلب الإجازة' : 'رفض طلب الإجازة'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--c-text-3)', marginTop: 3 }}>
            {isApprove
              ? 'سيتم اعتماد الإجازة وإظهار الموظف ضمن قائمة الإجازات المعتمدة.'
              : 'سيتم رفض الطلب ولن يؤثر على سجل حضور الموظف.'}
          </div>
        </div>

        <div style={{ padding: '16px 20px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
            borderRadius: 12, background: 'var(--c-surface)', marginBottom: 14,
          }}>
            <InitialsTag name={u?.name} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--c-text)' }}>{u?.name ?? '—'}</div>
              <div style={{ fontSize: 11.5, color: 'var(--c-text-3)', marginTop: 2 }}>
                {leaveTypeName(item)} · {formatDate(getLeaveStart(item))} — {formatDate(getLeaveEnd(item))}
                {getLeaveDays(item) != null && ` · ${getLeaveDays(item)} يوم عمل`}
              </div>
            </div>
          </div>

          {chain.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-text-2)', marginBottom: 6 }}>
                {LEAVE_COPY.approvalChain}
              </div>
              <ApprovalChain item={item} />
            </div>
          )}

          {endsChain && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 14,
              padding: '10px 12px', borderRadius: 10,
              background: 'var(--c-pending-bg)', color: 'var(--c-text-2)',
              fontSize: 11.5, lineHeight: 1.7,
            }}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2, color: 'var(--c-pending)' }} />
              {LEAVE_COPY.chainRejectionHint}
            </div>
          )}

          {getLeaveReason(item) && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-text-2)', marginBottom: 6 }}>
                سبب الطلب
              </div>
              <div style={{
                borderRadius: 10, padding: '10px 12px', background: 'var(--c-surface)',
                fontSize: 12.5, color: 'var(--c-text-2)', lineHeight: 1.6,
              }}>
                {getLeaveReason(item)}
              </div>
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
          <button
            onClick={confirm} disabled={submitting}
            style={{
              height: 38, padding: '0 18px', borderRadius: 10, border: 'none',
              background: isApprove ? 'var(--c-approved)' : 'var(--c-rejected)', color: '#fff',
              fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
              display: 'inline-flex', alignItems: 'center', gap: 7,
              cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : (isApprove ? <Check size={14} /> : <X size={14} />)}
            {isApprove ? 'اعتماد الموافقة' : 'تأكيد الرفض'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Table rows ───────────────────────────────────────────────────────────────

const SELF_APPROVAL_BLOCKED =
  'لا يمكن اعتماد طلب يظهر فيه مقدّم الطلب نفسه معتمِداً. يمكن رفض الطلب فقط.'

const REASON_CELL_STYLE = {
  fontSize: 12, color: 'var(--c-text-2)', lineHeight: 1.5, maxWidth: 240,
  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
}

// A request whose own author holds the step that is currently up for decision.
// v10 refuses to APPROVE these whenever they were created (ReviewLeaveRequest's
// rule on `status`), which is what closes rows stored before submission-side
// enforcement existed. Rejection stays open on purpose — it is the only way
// such a row can be closed out at all.
//
// The comparison is against the CURRENT approver, not a fixed one: with a chain
// the question is only ever about the step being decided now, and that is
// exactly what the review gate asks.
function isSelfAssigned(item) {
  const userId = item?.user_id ?? getLeaveUser(item)?.id
  const currentApproverId = getCurrentApproverId(item)
  return userId != null && currentApproverId != null && String(userId) === String(currentApproverId)
}

// Shown in place of the buttons when the caller may not decide this request:
// an approver whose turn has not come, or an admin, who reads this queue as a
// supervisor and is never on a chain at all. Dead buttons would come back 422
// on every press; naming who is holding the request is the answer they actually
// need. `observer` only picks the wording — "not your turn yet" is a promise of
// a turn that an admin is never going to get.
function WaitingOnApprover({ item, observer }) {
  const current = getCurrentApprover(item)
  const name = current?.name ?? (current?.id != null ? `#${current.id}` : null)
  const fallback = observer ? LEAVE_COPY.observingOnly : LEAVE_COPY.notYourTurn
  return (
    <span
      title={fallback}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '5px 11px', borderRadius: 999, whiteSpace: 'nowrap',
        fontSize: 12, fontWeight: 700,
        color: 'var(--c-text-2)', background: 'var(--c-surface-2)',
        border: '1px solid var(--c-border)',
      }}
    >
      <Hourglass size={12} style={{ flexShrink: 0 }} />
      {name ? `${LEAVE_COPY.waitingOn}: ${name}` : fallback}
    </span>
  )
}

function ReassignButton({ onClick }) {
  return (
    <button
      onClick={onClick} title={LEAVE_COPY.reassignHint}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, height: 30, padding: '0 11px',
        borderRadius: 9, border: '1px solid var(--c-border)', background: '#fff',
        fontFamily: 'var(--font-sans)', fontSize: 11.5, fontWeight: 700,
        color: 'var(--c-text-2)', cursor: 'pointer', whiteSpace: 'nowrap',
      }}
    >
      <UserCog size={12} /> {LEAVE_COPY.reassign}
    </button>
  )
}

// `supervisor` is the admin's reading of this queue: they see every request but
// decide none of them, and reassignment is the one thing they may do. Both
// halves come from the same role, so they travel as one prop.
function ApprovalRow({ item, last, onReview, supervisor, onReassign }) {
  const [hov, setHov] = useState(false)
  const u = getLeaveUser(item)
  const reason = getLeaveReason(item)
  const isPending = item.status === 'pending' && !item.is_excuse
  const selfAssigned = isSelfAssigned(item)
  // The approvals queue now lists every request the caller is anywhere on the
  // chain of, including steps whose turn has not come — so being in the queue
  // is not permission to decide. Only `can_review` is.
  const canReview = canReviewLeave(item)
  return (
    <tr
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        borderBottom: last ? 'none' : '1px solid var(--c-border)',
        background: hov ? 'rgba(34,65,103,0.015)' : 'transparent', transition: 'background .1s',
      }}
    >
      <td style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <InitialsTag name={u?.name} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--c-text)' }}>{u?.name ?? '—'}</div>
            <DeptCell name={u?.department?.name} />
          </div>
        </div>
      </td>
      <td style={{ padding: '12px 16px' }}><LeaveTypePill item={item} /></td>
      <td style={{ padding: '12px 16px' }}><LeaveOriginCell item={item} /></td>
      <td style={{ padding: '12px 16px' }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-text)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {formatDate(getLeaveStart(item))} — {formatDate(getLeaveEnd(item))}
        </div>
      </td>
      <td style={{ padding: '12px 16px' }}><DaysCell item={item} /></td>
      <td style={{ padding: '12px 16px' }}>
        {reason ? <div style={REASON_CELL_STYLE} title={reason}>{reason}</div> : <span style={{ color: 'var(--c-text-3)', fontSize: 12.5 }}>—</span>}
      </td>
      <td style={{ padding: '12px 16px' }}><LeaveStatusBadge status={item.status} /></td>
      <td style={{ padding: '12px 16px' }}><ApprovalChain item={item} compact /></td>
      <td style={{ padding: '12px 16px' }}>
        {isPending ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
            {canReview ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button
                    onClick={() => { if (!selfAssigned) onReview(item, 'approve') }}
                    disabled={selfAssigned}
                    title={selfAssigned ? SELF_APPROVAL_BLOCKED : 'موافقة'}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5, height: 32, padding: '0 12px',
                      borderRadius: 9, border: 'none', background: 'var(--c-approved-bg)', color: 'var(--c-approved)',
                      fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                      cursor: selfAssigned ? 'not-allowed' : 'pointer', opacity: selfAssigned ? 0.45 : 1,
                    }}
                  >
                    <Check size={13} /> موافقة
                  </button>
                  <button
                    onClick={() => onReview(item, 'reject')} title="رفض"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5, height: 32, padding: '0 12px',
                      borderRadius: 9, border: 'none', background: 'var(--c-rejected-bg)', color: 'var(--c-rejected)',
                      fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                    }}
                  >
                    <X size={13} /> رفض
                  </button>
                </div>
                {selfAssigned && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'flex-start', gap: 5,
                    fontSize: 10.5, lineHeight: 1.5, color: 'var(--c-text-3)', maxWidth: 210,
                  }}>
                    <AlertTriangle size={11} style={{ flexShrink: 0, marginTop: 2, color: 'var(--c-pending)' }} />
                    {SELF_APPROVAL_BLOCKED}
                  </span>
                )}
              </>
            ) : (
              <WaitingOnApprover item={item} observer={supervisor} />
            )}
            {supervisor && <ReassignButton onClick={() => onReassign(item)} />}
          </div>
        ) : (
          <span style={{ color: 'var(--c-text-3)', fontSize: 12 }}>—</span>
        )}
      </td>
    </tr>
  )
}

function MineRow({ item, last }) {
  const [hov, setHov] = useState(false)
  const reason = getLeaveReason(item)
  return (
    <tr
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        borderBottom: last ? 'none' : '1px solid var(--c-border)',
        background: hov ? 'rgba(34,65,103,0.015)' : 'transparent', transition: 'background .1s',
      }}
    >
      <td style={{ padding: '12px 16px' }}><LeaveTypePill item={item} /></td>
      <td style={{ padding: '12px 16px' }}><LeaveOriginCell item={item} /></td>
      <td style={{ padding: '12px 16px' }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-text)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {formatDate(getLeaveStart(item))} — {formatDate(getLeaveEnd(item))}
        </div>
      </td>
      <td style={{ padding: '12px 16px' }}><DaysCell item={item} /></td>
      <td style={{ padding: '12px 16px' }}>
        {reason ? <div style={REASON_CELL_STYLE} title={reason}>{reason}</div> : <span style={{ color: 'var(--c-text-3)', fontSize: 12.5 }}>—</span>}
      </td>
      <td style={{ padding: '12px 16px' }}>
        <div style={{ fontSize: 12, color: 'var(--c-text-3)' }}>{formatDate(item.created_at)}</div>
      </td>
      <td style={{ padding: '12px 16px' }}><LeaveStatusBadge status={item.status} /></td>
      {/* Own requests get the chain too: where a request has got to, and who is
          holding it, is the first thing the employee asks. Excuses HR filed
          have no chain and fall back to a dash. */}
      <td style={{ padding: '12px 16px' }}><ApprovalChain item={item} compact /></td>
    </tr>
  )
}

function SkeletonRow({ count }) {
  const pulse = { animation: 'pulse 1.5s ease-in-out infinite', background: 'var(--c-surface-2)' }
  return (
    <tr>
      {Array.from({ length: count }, (_, i) => (
        <td key={i} style={{ padding: '12px 16px' }}>
          <div style={{ ...pulse, height: 16, width: i === 0 ? 150 : 90, borderRadius: 7, animationDelay: `${i * 0.08}s` }} />
        </td>
      ))}
    </tr>
  )
}

// `field` = sortable (leave-requests whitelist: created_at, start_date,
// end_date, requested_days, status, leave_type, reviewed_at, id; the approvals
// queue additionally allows employee_name / employee_email).
//
// The chain column carries no `field`: `approvals` is a relation the listing
// endpoints do not sort on, so offering a sort header would only earn a 422.
const APPROVAL_COLS = [
  { label: 'الموظف', field: 'employee_name' },
  { label: 'نوع الإجازة', field: 'leave_type' },
  { label: 'المصدر', field: 'is_excuse' },
  { label: 'الفترة', field: 'start_date' },
  { label: 'الأيام المحتسبة', field: 'requested_days' },
  { label: 'السبب' },
  { label: 'الحالة', field: 'status' },
  { label: LEAVE_COPY.approvalChain },
  { label: 'إجراءات' },
]
const MINE_COLS = [
  { label: 'نوع الإجازة', field: 'leave_type' },
  { label: 'المصدر', field: 'is_excuse' },
  { label: 'الفترة', field: 'start_date' },
  { label: 'الأيام المحتسبة', field: 'requested_days' },
  { label: 'السبب' },
  { label: 'تاريخ الطلب', field: 'created_at' },
  { label: 'الحالة', field: 'status' },
  { label: LEAVE_COPY.approvalChain },
]

const STATUS_OPTIONS = [
  { id: 'pending', name: 'قيد المراجعة' },
  { id: 'approved', name: 'موافَق عليها' },
  { id: 'rejected', name: 'مرفوضة' },
]

const filterSelectStyle = {
  height: 38, padding: '0 10px', borderRadius: 10, minWidth: 140,
  background: '#fff', border: '1px solid var(--c-border)',
  fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 600,
  cursor: 'pointer', direction: 'rtl', outline: 'none',
}

const filterDateStyle = {
  height: 38, borderRadius: 10, border: '1px solid var(--c-border)',
  background: '#fff', padding: '0 10px', fontSize: 12, fontFamily: 'var(--font-sans)',
  color: 'var(--c-text-2)', outline: 'none', cursor: 'pointer',
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function LeavePage() {
  const { user } = useAuth()
  const toast = useToast()
  const canApprove = ['admin', 'manager', 'chief'].includes(user?.role)
  // POST /leave-requests authorizes employee|manager|chief — admins are rejected
  // with a 403, so they get no submit button even though they can see the page.
  const canSubmit = ['employee', 'manager', 'chief'].includes(user?.role)
  // Same gate the attendance pages use: only admin / can_view_attendance users
  // may filter by department (managers/chiefs are dept-scoped server-side).
  const hasFullAccess = user?.role === 'admin' || !!user?.can_view_attendance

  const [tab, setTab] = useState(canApprove ? 'approvals' : 'mine')

  // Leave balance (authenticated user)
  const [balance, setBalance] = useState(null)
  const [balanceLoading, setBalanceLoading] = useState(true)

  // List state (shared between the two tabs — refetched on tab switch)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [lastPage, setLastPage] = useState(1)
  const [total, setTotal] = useState(0)

  // Filters shared by both tabs (both endpoints accept them)
  const [statuses, setStatuses] = useState([])       // pending/approved/rejected
  const [leaveType, setLeaveType] = useState('')
  const [excuseFilter, setExcuseFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')       // overlap semantics
  const [dateTo, setDateTo] = useState('')
  const [reviewed, setReviewed] = useState(false)
  // Approvals-only employee-side filters
  const [search, setSearch] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [departments, setDepartments] = useState([])
  const [mineSort, setMineSort] = useState(null)
  const [approvalsSort, setApprovalsSort] = useState(null)

  // Managers/chiefs have no department picker (their queue is already scoped)
  // but may still filter by section — feed them their own department's sections.
  const sectionDeptId = hasFullAccess ? departmentId : (user?.department_id ?? '')
  const sections = useDeptSections(sectionDeptId, departments, { canFetch: user?.role === 'admin' })

  const [review, setReview] = useState(null) // { item, action }
  const [reassign, setReassign] = useState(null) // request whose step is moving
  const [submitting, setSubmitting] = useState(false) // new-request modal open

  // The admin's reading of the approvals queue. They are never on a chain, so
  // the listing hands them every request instead — read-only, `can_review` is
  // false on every row — and reassignment is the one action they get: it moves
  // one pending step to another approver and decides nothing, the review gate
  // still refusing admins, so it is never presented as an override.
  const isSupervisor = user?.role === 'admin'

  const reqRef = useRef(0)

  const isApprovals = tab === 'approvals'

  // Approvers only (the /attendance/departments route allows managers/chiefs
  // too — they need it for their own department's nested sections).
  useEffect(() => {
    if (!canApprove) return
    api.get('/attendance/departments')
      .then(res => setDepartments(res.data.departments ?? []))
      .catch(() => setDepartments([]))
  }, [canApprove])

  // Clear an orphan section whenever the department changes (422 otherwise).
  const changeDepartment = v => { setDepartmentId(v); setSectionId('') }

  const fetchBalance = useCallback(() => {
    setBalanceLoading(true)
    api.get('/attendance/leave-balance')
      .then(res => setBalance(readLeaveBalance(res.data)))
      .catch(() => setBalance(null))
      .finally(() => setBalanceLoading(false))
  }, [])

  // Filter params of the active tab, shared by the fetch and its XLSX export.
  const buildFilters = useCallback(() => {
    const params = {}
    if (statuses.length) params.statuses  = statuses.join(',')
    if (leaveType)       params.leave_type = leaveType
    if (excuseFilter !== '') params.is_excuse = excuseFilter
    if (dateFrom)        params.date_from  = dateFrom
    if (dateTo)          params.date_to    = dateTo
    if (reviewed)        params.reviewed   = 1
    if (isApprovals) {
      if (search.trim()) params.search        = search.trim()
      if (departmentId)  params.department_id = departmentId
      if (sectionId)     params.section_id    = sectionId
    }
    return { ...params, ...sortParams(isApprovals ? approvalsSort : mineSort) }
  }, [statuses, leaveType, excuseFilter, dateFrom, dateTo, reviewed, isApprovals,
      search, departmentId, sectionId, approvalsSort, mineSort])

  const fetchList = useCallback(async (targetPage) => {
    const reqId = ++reqRef.current
    setLoading(true)
    try {
      const url = isApprovals
        ? '/attendance/leave-requests/approvals'
        : '/attendance/leave-requests'
      const res = await api.get(url, { params: { ...buildFilters(), page: targetPage } })
      if (reqId !== reqRef.current) return
      const pag = pickPage(res.data, ['leave_requests', 'requests', 'approvals'])
      setRows(pag.data ?? [])
      setLastPage(pag.last_page ?? 1)
      setTotal(pag.total ?? (pag.data?.length ?? 0))
    } catch {
      if (reqId === reqRef.current) { setRows([]); setTotal(0); setLastPage(1) }
    } finally {
      if (reqId === reqRef.current) setLoading(false)
    }
  }, [isApprovals, buildFilters])

  useEffect(() => { fetchBalance() }, [fetchBalance])

  // Reset to page 1 on tab switch or when any filter/sort changes, then fetch
  useEffect(() => {
    setPage(1)
    fetchList(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, statuses, leaveType, excuseFilter, dateFrom, dateTo, reviewed,
      search, departmentId, sectionId, mineSort, approvalsSort])

  // Fetch on page change (without resetting)
  useEffect(() => { fetchList(page) }, [page]) // eslint-disable-line react-hooks/exhaustive-deps

  // Topbar refresh button
  useEffect(() => {
    const handler = () => { fetchBalance(); fetchList(page) }
    window.addEventListener('topbar:refresh', handler)
    return () => window.removeEventListener('topbar:refresh', handler)
  }, [fetchBalance, fetchList, page])

  const submitReview = async () => {
    if (!review) return false
    const status = review.action === 'approve' ? 'approved' : 'rejected'
    try {
      await api.patch(`/attendance/leave-requests/${review.item.id}/review`, { status })
      toast.success(review.action === 'approve' ? 'تمت الموافقة على طلب الإجازة' : 'تم رفض طلب الإجازة')
      setReview(null)
      fetchList(page)
      return true
    } catch (err) {
      toast.error(leaveApiMessage(err))
      return false
    }
  }

  // The 201 carries a refreshed balance, but for the *request's* year — booking
  // leave in a future year returns that year's figures, which must not replace
  // the current year's widget. Only adopt it when the years line up.
  const onSubmitted = (nextBalance) => {
    setSubmitting(false)
    toast.success('تم إرسال طلب الإجازة إلى المعتمد الأول في السلسلة')
    const sameYear = nextBalance?.year != null && balance?.year != null
      ? nextBalance.year === balance.year
      : false
    if (sameYear) setBalance(nextBalance)
    else fetchBalance()
    if (tab === 'mine') fetchList(page)
    else setTab('mine')
  }

  const cols = isApprovals ? APPROVAL_COLS : MINE_COLS
  const hasFilters = Boolean(
    statuses.length || leaveType || excuseFilter !== '' || dateFrom || dateTo || reviewed ||
    (isApprovals && (search || departmentId || sectionId))
  )
  const clearFilters = () => {
    setStatuses([]); setLeaveType(''); setExcuseFilter(''); setDateFrom(''); setDateTo(''); setReviewed(false)
    setSearch(''); setDepartmentId(''); setSectionId('')
  }
  const emptyMessage = hasFilters
    ? 'لا توجد طلبات مطابقة لهذه الفلاتر'
    : isApprovals
      // "awaiting YOUR review" would be wrong for the admin, whose queue is
      // every request in the company and none of them theirs to decide.
      ? (isSupervisor ? 'لا توجد طلبات إجازة' : 'لا توجد طلبات إجازة بانتظار مراجعتك')
      : 'لم تقم بإرسال أي طلبات إجازة بعد'

  return (
    <div style={{ padding: '28px clamp(16px, 4vw, 28px) 48px', maxWidth: 1240, margin: '0 auto' }}>

      {/* Header */}
      <div style={{
        marginBottom: 22, display: 'flex', alignItems: 'flex-start',
        justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
      }}>
        <div>
          <h1 style={{ margin: '0 0 5px', fontSize: 26, fontWeight: 800, color: 'var(--c-text)', letterSpacing: -0.5 }}>
            إدارة الإجازات
          </h1>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--c-text-2)', lineHeight: 1.6 }}>
            {canApprove
              ? 'مراجعة طلبات الإجازة المُسندة إليك ومتابعة رصيد إجازاتك الخاص.'
              : 'متابعة طلبات إجازتك ورصيدك السنوي المتبقّي.'}
          </p>
        </div>
        {canSubmit && (
          <button
            onClick={() => setSubmitting(true)}
            style={{
              height: 42, padding: '0 18px', borderRadius: 11, border: 'none', flexShrink: 0,
              background: 'var(--c-primary)', color: '#fff',
              fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
              display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer',
            }}
          >
            <CalendarPlus size={15} />
            طلب إجازة جديد
          </button>
        )}
      </div>

      {/* Balance widget */}
      <BalanceWidget balance={balance} loading={balanceLoading} />

      {/* Main card */}
      <div style={{
        background: '#fff', border: '1px solid var(--c-border)',
        borderRadius: 16, overflow: 'hidden', boxShadow: 'var(--sh-card)',
      }}>

        {/* Tabs */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '8px 12px', borderBottom: '1px solid var(--c-border)',
        }}>
          {[
            ...(canApprove ? [{ key: 'approvals', label: 'بانتظار موافقتي', icon: Inbox }] : []),
            { key: 'mine', label: 'طلباتي', icon: CalendarDays },
          ].map(t => {
            const Icon = t.icon
            const active = tab === t.key
            return (
              <button
                key={t.key} onClick={() => setTab(t.key)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  height: 36, padding: '0 14px', borderRadius: 9, border: 'none',
                  background: active ? 'var(--c-primary)' : 'transparent',
                  color: active ? '#fff' : 'var(--c-text-2)',
                  fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
                  cursor: 'pointer', transition: 'background .12s',
                }}
              >
                <Icon size={14} />
                {t.label}
              </button>
            )
          })}
        </div>

        {/* Count bar + filters */}
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--c-border)',
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <span style={{
            fontSize: 11, fontWeight: 700, color: 'var(--c-text-2)',
            background: 'var(--c-surface-2)', borderRadius: 999, padding: '2px 9px',
          }}>
            {total} طلباً
          </span>
          {isApprovals && (
            <span
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--c-text-3)' }}
              title={LEAVE_COPY.chainOrderHint}
            >
              <MessageSquare size={12} />
              {isSupervisor ? LEAVE_COPY.adminQueueHint : LEAVE_COPY.queueHint}
            </span>
          )}

          <div style={{ flex: 1 }} />

          {/* Employee-side filters — approvals queue only */}
          {isApprovals && <SearchInput value={search} onChange={setSearch} />}
          {isApprovals && hasFullAccess && (
            <DepartmentSelect departments={departments} value={departmentId} onChange={changeDepartment} />
          )}
          {/* Managers/chiefs see it too — fed from their own department */}
          {isApprovals && (
            <SectionSelect sections={sections} value={sectionId} onChange={setSectionId} disabled={hasFullAccess && !departmentId} />
          )}

          {/* Status multi-filter (statuses=pending,approved,…) */}
          <MultiSelect
            icon={ClipboardCheck} label="الحالة" options={STATUS_OPTIONS}
            values={statuses} onChange={setStatuses}
          />

          {/* Leave type — fed from the HR vocabulary and sending the type's
              `code`. The filter accepts a code, an Arabic/English name or the
              legacy free text, so it keeps matching rows filed both before and
              after types existed.

              Which types are offered follows the source filter: the approvals
              queue only ever holds employee-filed requests, while "طلباتي" with
              no source filter can hold both, so it gets the union — otherwise
              excuse-only types would be missing from a list containing them. */}
          <LeaveTypeFilter
            forForm={isApprovals || excuseFilter === '0'
              ? 'requests'
              : excuseFilter === '1' ? 'excuses' : 'all'}
            value={leaveType} onChange={setLeaveType}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <select value={excuseFilter} onChange={event => setExcuseFilter(event.target.value)}
              style={{ ...filterSelectStyle, color: excuseFilter !== '' ? 'var(--c-text)' : 'var(--c-text-2)' }}>
              <option value=''>المصدر: الكل</option>
              <option value='0'>طلبات الموظفين</option>
              <option value='1'>أعذار إدارية</option>
            </select>
          </div>

          {/* Period window — matches any request whose leave overlaps it */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} title="أي طلب تتقاطع فترته مع هذا النطاق">
            <Calendar size={13} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={filterDateStyle} />
            <span style={{ fontSize: 12, color: 'var(--c-text-3)' }}>—</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={filterDateStyle} />
          </div>

          {/* Reviewed only */}
          <ToggleChip
            label="تمت مراجعتها" icon={Check}
            active={reviewed} onChange={setReviewed}
            title="عرض الطلبات التي تمت مراجعتها فقط"
          />

          {hasFilters && (
            <button
              onClick={clearFilters}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                height: 38, padding: '0 12px', borderRadius: 10,
                background: 'var(--c-surface)', border: '1px solid var(--c-border)',
                fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 700,
                color: 'var(--c-text-2)', cursor: 'pointer',
              }}
            >
              <X size={13} />
              مسح الفلاتر
            </button>
          )}

          {/* The leave-list workbook gained a `يُخصم من الرصيد` column right
              after `نوع الإجازة`, shifting every later column by one. Nothing
              here reads the file back, so there is no fixed index to update. */}
          <ExportButton
            url={isApprovals ? '/attendance/leave-requests/approvals' : '/attendance/leave-requests'}
            params={buildFilters()}
            filename={isApprovals ? 'leave-approvals.xlsx' : 'leave-requests.xlsx'}
          />
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--c-surface)' }}>
                {cols.map(col => (
                  <SortableTh
                    key={col.label} label={col.label} field={col.field}
                    sort={isApprovals ? approvalsSort : mineSort}
                    onSort={isApprovals ? setApprovalsSort : setMineSort}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? [0, 1, 2, 3, 4].map(i => <SkeletonRow key={i} count={cols.length} />)
                : tab === 'approvals'
                  ? rows.map((item, idx) => (
                      <ApprovalRow
                        key={item.id ?? idx} item={item} last={idx === rows.length - 1}
                        onReview={(it, action) => setReview({ item: it, action })}
                        supervisor={isSupervisor} onReassign={setReassign}
                      />
                    ))
                  : rows.map((item, idx) => (
                      <MineRow key={item.id ?? idx} item={item} last={idx === rows.length - 1} />
                    ))
              }
            </tbody>
          </table>
        </div>

        {/* Empty state */}
        {!loading && rows.length === 0 && (
          <div style={{ padding: '56px 20px', textAlign: 'center' }}>
            <Inbox size={32} style={{ color: 'var(--c-text-3)', marginBottom: 12 }} />
            <p style={{ margin: 0, color: 'var(--c-text-2)', fontSize: 14, fontWeight: 600 }}>{emptyMessage}</p>
          </div>
        )}

        {/* Pagination */}
        {lastPage > 1 && (
          <div style={{
            padding: '12px 20px', borderTop: '1px solid var(--c-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <PagBtn disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</PagBtn>
            {Array.from({ length: lastPage }, (_, i) => i + 1).map(p => (
              <PagBtn key={p} active={p === page} onClick={() => setPage(p)}>{p}</PagBtn>
            ))}
            <PagBtn disabled={page >= lastPage} onClick={() => setPage(page + 1)}>›</PagBtn>
          </div>
        )}
      </div>

      {review && (
        <ReviewModal
          item={review.item} action={review.action}
          onClose={() => setReview(null)} onConfirm={submitReview}
        />
      )}

      {reassign && (
        <ReassignApproverModal
          item={reassign}
          onClose={() => setReassign(null)}
          onDone={() => { setReassign(null); toast.success(LEAVE_COPY.reassignDone); fetchList(page) }}
        />
      )}

      {submitting && (
        <SubmitLeaveModal onClose={() => setSubmitting(false)} onSubmitted={onSubmitted} />
      )}
    </div>
  )
}
