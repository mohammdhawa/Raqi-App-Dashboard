import { Clock, Check, X, Plane, Undo2 } from 'lucide-react'

// Leave request lifecycle statuses + the attendance "Approved Leave" display
// state. Shared between AttendancePage (approved-leave view) and LeavePage so
// the badges stay visually consistent across the dashboard.
const LEAVE_STATUS_META = {
  pending:        { label: 'قيد المراجعة', color: 'var(--c-pending)',  bg: 'var(--c-pending-bg)',     icon: Clock },
  approved:       { label: 'موافق عليها',  color: 'var(--c-approved)', bg: 'var(--c-approved-bg)',    icon: Check },
  rejected:       { label: 'مرفوضة',       color: 'var(--c-rejected)', bg: 'var(--c-rejected-bg)',    icon: X },
  // An HR excuse retracted through DELETE …/excuse. Muted on purpose, never the
  // refusal red: nobody was refused, the entry was withdrawn. The label matches
  // the XLSX export's word for the same status exactly.
  cancelled:      { label: 'ملغاة',        color: 'var(--c-text-2)',   bg: 'var(--c-surface-2)',      icon: Undo2 },
  approved_leave: { label: 'في إجازة',     color: 'var(--c-primary)',  bg: 'var(--c-primary-light)',  icon: Plane },
}

export default function LeaveStatusBadge({ status }) {
  const meta = LEAVE_STATUS_META[status]
  if (!meta) return <span style={{ color: 'var(--c-text-3)', fontSize: 12.5 }}>—</span>
  const Icon = meta.icon
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '5px 11px', borderRadius: 999,
      fontSize: 12, fontWeight: 700, color: meta.color,
      background: meta.bg, border: `1px solid ${meta.color}22`,
      whiteSpace: 'nowrap',
    }}>
      <Icon size={12} />
      {meta.label}
    </span>
  )
}
