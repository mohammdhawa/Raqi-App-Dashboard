// The approval chain of a leave request, read back as the decision sequence it
// is: step number, approver, and that STEP's own status.
//
// Nothing here is derived. `status` is what the server sent for each step, and
// the current step is whoever `current_approver_id` names — the chain advances
// under rules this side does not model. `skipped` (a rejection ahead of it
// means the step will never be asked) gets a neutral treatment so it never
// reads as outstanding work.

import { ChevronLeft, Bell } from 'lucide-react'
import {
  APPROVAL_STEP_META, approvalStepLabel, getApprovalChain, getCurrentApproverId,
} from '../../utils/leave'

// The step whose turn it is is still `pending`, but "waiting for their turn" is
// the wrong thing to say about the person the request is sitting with.
const TURN_NOW = 'دوره الآن'

function Step({ step, current, compact }) {
  const meta = APPROVAL_STEP_META[step.status] ?? APPROVAL_STEP_META.pending
  const label = current ? TURN_NOW : approvalStepLabel(step.status)
  return (
    <span
      title={`${step.order}. ${step.name ?? `#${step.userId}`} — ${label}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: compact ? '2px 7px 2px 3px' : '4px 9px 4px 4px',
        borderRadius: 999, maxWidth: '100%',
        background: meta.bg, color: meta.color,
        border: `1px solid ${meta.color}22`,
        ...(current ? { boxShadow: `0 0 0 2px ${meta.color}33` } : {}),
      }}
    >
      <span style={{
        width: compact ? 16 : 18, height: compact ? 16 : 18, borderRadius: '50%', flexShrink: 0,
        background: meta.color, color: '#fff',
        fontSize: compact ? 9.5 : 10.5, fontWeight: 800,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {step.order}
      </span>
      <span style={{
        fontSize: compact ? 11 : 12, fontWeight: 700, minWidth: 0,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {step.name ?? `#${step.userId}`}
      </span>
      <span style={{ fontSize: compact ? 10 : 11, fontWeight: 600, opacity: 0.85, whiteSpace: 'nowrap' }}>
        · {label}
      </span>
      {current && <Bell size={compact ? 10 : 11} style={{ flexShrink: 0 }} />}
    </span>
  )
}

/**
 * `compact` is the table-cell size; the modal uses the roomier one.
 * A legacy single-approver request renders as the chain of one it is.
 */
export default function ApprovalChain({ item, compact = false }) {
  const chain = getApprovalChain(item)
  if (!chain.length) {
    return <span style={{ color: 'var(--c-text-3)', fontSize: 12.5 }}>—</span>
  }
  const currentId = getCurrentApproverId(item)

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap',
      maxWidth: compact ? 300 : undefined,
    }}>
      {chain.map((step, i) => (
        <span key={`${step.userId}-${step.order}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: '100%' }}>
          {i > 0 && <ChevronLeft size={12} style={{ color: 'var(--c-text-3)', flexShrink: 0 }} />}
          <Step
            step={step} compact={compact}
            current={currentId != null && String(step.userId) === String(currentId)}
          />
        </span>
      ))}
    </div>
  )
}
