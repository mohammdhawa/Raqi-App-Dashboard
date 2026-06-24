import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/ui/Toast'
import {
  CalendarCheck, CalendarDays, CalendarClock, Wallet, Check, X,
  Inbox, Loader2, Building2, MessageSquare,
} from 'lucide-react'
import LeaveStatusBadge from '../components/ui/LeaveStatusBadge'
import {
  getLeaveUser, getLeaveType, getLeaveReason, getLeaveStart, getLeaveEnd,
  getLeaveDays, leaveTypeLabel, readLeaveBalance,
} from '../utils/leave'

const ANNUAL_LEAVE_DEFAULT = 21

function formatDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' })
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

function LeaveTypePill({ type }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 999,
      fontSize: 11.5, fontWeight: 700, lineHeight: 1.5, whiteSpace: 'nowrap',
      background: 'var(--c-surface-2)', color: 'var(--c-text-2)',
    }}>
      {leaveTypeLabel(type)}
    </span>
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

function BalanceTile({ icon: Icon, label, value, accent }) {
  return (
    <div style={{
      flex: 1, minWidth: 150, display: 'flex', alignItems: 'center', gap: 12,
      padding: '14px 16px', borderRadius: 12,
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
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            flex: 1, minWidth: 150, height: 68, borderRadius: 12,
            background: 'var(--c-surface-2)', animation: 'pulse 1.5s ease-in-out infinite',
            animationDelay: `${i * 0.08}s`,
          }} />
        ))}
      </div>
    )
  }
  const allocated = balance?.allocated ?? ANNUAL_LEAVE_DEFAULT
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 22 }}>
      <BalanceTile
        icon={Wallet} label="الرصيد السنوي المخصص" value={allocated}
        accent={{ bg: 'var(--c-primary-light)', color: 'var(--c-primary)' }}
      />
      <BalanceTile
        icon={CalendarClock} label="الأيام المستخدمة" value={balance?.used}
        accent={{ bg: 'var(--c-rejected-bg)', color: 'var(--c-rejected)' }}
      />
      <BalanceTile
        icon={CalendarCheck} label="الأيام المتبقية" value={balance?.remaining}
        accent={{ bg: 'var(--c-approved-bg)', color: 'var(--c-approved)' }}
      />
    </div>
  )
}

// ── Review (approve / reject) modal ──────────────────────────────────────────

function ReviewModal({ item, action, onClose, onConfirm }) {
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const u = getLeaveUser(item)
  const isApprove = action === 'approve'

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && !submitting) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, submitting])

  const confirm = async () => {
    setSubmitting(true)
    const ok = await onConfirm(note.trim())
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
                {leaveTypeLabel(getLeaveType(item))} · {formatDate(getLeaveStart(item))} — {formatDate(getLeaveEnd(item))}
                {getLeaveDays(item) != null && ` · ${getLeaveDays(item)} يوم`}
              </div>
            </div>
          </div>

          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--c-text-2)', marginBottom: 6 }}>
            ملاحظة (اختياري)
          </label>
          <textarea
            value={note} onChange={e => setNote(e.target.value)} rows={3}
            placeholder={isApprove ? 'ملاحظة للموظف...' : 'سبب الرفض (اختياري)...'}
            style={{
              width: '100%', resize: 'vertical', borderRadius: 10, padding: '10px 12px',
              border: '1px solid var(--c-border)', outline: 'none',
              fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--c-text)',
              background: '#fff', lineHeight: 1.6,
            }}
          />
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

const REASON_CELL_STYLE = {
  fontSize: 12, color: 'var(--c-text-2)', lineHeight: 1.5, maxWidth: 240,
  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
}

function ApprovalRow({ item, last, onReview }) {
  const [hov, setHov] = useState(false)
  const u = getLeaveUser(item)
  const days = getLeaveDays(item)
  const reason = getLeaveReason(item)
  const isPending = item.status === 'pending'
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
      <td style={{ padding: '12px 16px' }}><LeaveTypePill type={getLeaveType(item)} /></td>
      <td style={{ padding: '12px 16px' }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-text)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {formatDate(getLeaveStart(item))} — {formatDate(getLeaveEnd(item))}
        </div>
      </td>
      <td style={{ padding: '12px 16px' }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--c-text)', fontVariantNumeric: 'tabular-nums' }}>
          {days != null ? `${days} يوم` : '—'}
        </span>
      </td>
      <td style={{ padding: '12px 16px' }}>
        {reason ? <div style={REASON_CELL_STYLE} title={reason}>{reason}</div> : <span style={{ color: 'var(--c-text-3)', fontSize: 12.5 }}>—</span>}
      </td>
      <td style={{ padding: '12px 16px' }}><LeaveStatusBadge status={item.status} /></td>
      <td style={{ padding: '12px 16px' }}>
        {isPending ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={() => onReview(item, 'approve')} title="موافقة"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, height: 32, padding: '0 12px',
                borderRadius: 9, border: 'none', background: 'var(--c-approved-bg)', color: 'var(--c-approved)',
                fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
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
        ) : (
          <span style={{ color: 'var(--c-text-3)', fontSize: 12 }}>—</span>
        )}
      </td>
    </tr>
  )
}

function MineRow({ item, last }) {
  const [hov, setHov] = useState(false)
  const days = getLeaveDays(item)
  const reason = getLeaveReason(item)
  return (
    <tr
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        borderBottom: last ? 'none' : '1px solid var(--c-border)',
        background: hov ? 'rgba(34,65,103,0.015)' : 'transparent', transition: 'background .1s',
      }}
    >
      <td style={{ padding: '12px 16px' }}><LeaveTypePill type={getLeaveType(item)} /></td>
      <td style={{ padding: '12px 16px' }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-text)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {formatDate(getLeaveStart(item))} — {formatDate(getLeaveEnd(item))}
        </div>
      </td>
      <td style={{ padding: '12px 16px' }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--c-text)', fontVariantNumeric: 'tabular-nums' }}>
          {days != null ? `${days} يوم` : '—'}
        </span>
      </td>
      <td style={{ padding: '12px 16px' }}>
        {reason ? <div style={REASON_CELL_STYLE} title={reason}>{reason}</div> : <span style={{ color: 'var(--c-text-3)', fontSize: 12.5 }}>—</span>}
      </td>
      <td style={{ padding: '12px 16px' }}>
        <div style={{ fontSize: 12, color: 'var(--c-text-3)' }}>{formatDate(item.created_at)}</div>
      </td>
      <td style={{ padding: '12px 16px' }}><LeaveStatusBadge status={item.status} /></td>
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

const APPROVAL_COLS = ['الموظف', 'نوع الإجازة', 'الفترة', 'الأيام', 'السبب', 'الحالة', 'إجراءات']
const MINE_COLS = ['نوع الإجازة', 'الفترة', 'الأيام', 'السبب', 'تاريخ الطلب', 'الحالة']

// ── Main page ────────────────────────────────────────────────────────────────

export default function LeavePage() {
  const { user } = useAuth()
  const toast = useToast()
  const canApprove = ['admin', 'manager', 'chief'].includes(user?.role)

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

  const [review, setReview] = useState(null) // { item, action }

  const reqRef = useRef(0)

  const fetchBalance = useCallback(() => {
    setBalanceLoading(true)
    api.get('/attendance/leave-balance')
      .then(res => setBalance(readLeaveBalance(res.data)))
      .catch(() => setBalance(null))
      .finally(() => setBalanceLoading(false))
  }, [])

  const fetchList = useCallback(async (targetPage) => {
    const reqId = ++reqRef.current
    setLoading(true)
    try {
      const url = tab === 'approvals'
        ? '/attendance/leave-requests/approvals'
        : '/attendance/leave-requests'
      const res = await api.get(url, { params: { page: targetPage } })
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
  }, [tab])

  useEffect(() => { fetchBalance() }, [fetchBalance])

  // Reset to page 1 on tab switch, then fetch
  useEffect(() => {
    setPage(1)
    fetchList(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  // Fetch on page change (without resetting)
  useEffect(() => { fetchList(page) }, [page]) // eslint-disable-line react-hooks/exhaustive-deps

  // Topbar refresh button
  useEffect(() => {
    const handler = () => { fetchBalance(); fetchList(page) }
    window.addEventListener('topbar:refresh', handler)
    return () => window.removeEventListener('topbar:refresh', handler)
  }, [fetchBalance, fetchList, page])

  const submitReview = async (note) => {
    if (!review) return false
    const status = review.action === 'approve' ? 'approved' : 'rejected'
    try {
      await api.patch(`/attendance/leave-requests/${review.item.id}/review`, {
        status,
        ...(note ? { note } : {}),
      })
      toast.success(review.action === 'approve' ? 'تمت الموافقة على طلب الإجازة' : 'تم رفض طلب الإجازة')
      setReview(null)
      fetchList(page)
      return true
    } catch (err) {
      const data = err.response?.data
      const msg = data?.errors
        ? Object.values(data.errors).flat().join('، ')
        : (data?.message ?? 'تعذّر تنفيذ الإجراء، حاول مرة أخرى')
      toast.error(msg)
      return false
    }
  }

  const cols = tab === 'approvals' ? APPROVAL_COLS : MINE_COLS
  const emptyMessage = tab === 'approvals'
    ? 'لا توجد طلبات إجازة بانتظار مراجعتك'
    : 'لم تقم بإرسال أي طلبات إجازة بعد'

  return (
    <div style={{ padding: '28px clamp(16px, 4vw, 28px) 48px', maxWidth: 1240, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ margin: '0 0 5px', fontSize: 26, fontWeight: 800, color: 'var(--c-text)', letterSpacing: -0.5 }}>
          إدارة الإجازات
        </h1>
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--c-text-2)', lineHeight: 1.6 }}>
          {canApprove
            ? 'مراجعة طلبات الإجازة المُسندة إليك ومتابعة رصيد إجازاتك الخاص.'
            : 'متابعة طلبات إجازتك ورصيدك السنوي المتبقّي.'}
        </p>
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

        {/* Count bar */}
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--c-border)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{
            fontSize: 11, fontWeight: 700, color: 'var(--c-text-2)',
            background: 'var(--c-surface-2)', borderRadius: 999, padding: '2px 9px',
          }}>
            {total} طلباً
          </span>
          {tab === 'approvals' && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--c-text-3)' }}>
              <MessageSquare size={12} />
              يمكنك الموافقة أو الرفض للطلبات قيد المراجعة فقط
            </span>
          )}
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--c-surface)' }}>
                {cols.map(col => (
                  <th key={col} style={{
                    padding: '11px 16px', textAlign: 'right',
                    fontSize: 11.5, fontWeight: 700, color: 'var(--c-text-2)',
                    borderBottom: '1px solid var(--c-border)', whiteSpace: 'nowrap',
                  }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? [0, 1, 2, 3, 4].map(i => <SkeletonRow key={i} count={cols.length} />)
                : tab === 'approvals'
                  ? rows.map((item, idx) => (
                      <ApprovalRow key={item.id ?? idx} item={item} last={idx === rows.length - 1} onReview={(it, action) => setReview({ item: it, action })} />
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
    </div>
  )
}
