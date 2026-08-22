import { ShieldX } from 'lucide-react'
import { readRejection, rejectionTooltip, REJECTION_COPY } from '../../utils/attendanceRejection'

/**
 * «مرفوض» — HR refused this attendance event.
 *
 * `source` is either a raw AttendanceRecord (`rejection_*` fields) or a report
 * row / day cell carrying a nested `rejection` block; readRejection normalizes
 * both. Renders nothing when nothing was refused, so callers can drop it in
 * unconditionally.
 *
 * The badge shows the short ground; the long label, the note and who refused it
 * (and when) live in the tooltip — the same shape as the «تم التصحيح» badge.
 */
export default function RejectedBadge({ source, compact = false, withReason = true }) {
  const rejection = readRejection(source)
  if (!rejection) return null

  return (
    <span
      title={rejectionTooltip(source)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: compact ? '2px 8px' : '4px 10px', borderRadius: 999,
        fontSize: compact ? 10.5 : 11.5, fontWeight: 800, lineHeight: 1.5,
        color: 'var(--c-rejected)', background: 'var(--c-rejected-bg)',
        border: '1px solid rgba(192,57,43,0.22)',
        whiteSpace: 'nowrap', cursor: 'help',
      }}
    >
      <ShieldX size={compact ? 11 : 12} />
      {withReason ? `${REJECTION_COPY.badge} · ${rejection.short}` : REJECTION_COPY.badge}
    </span>
  )
}
