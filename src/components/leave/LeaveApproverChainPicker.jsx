// The ordered approver chain for a leave request (`approver_ids`).
//
// Array order IS decision order: the request goes to approver 1, and only
// reaches approver 2 once 1 has approved. That is why this is the ordered
// picker and not a multi-select — the sequence summary and the first/last
// captions exist so nobody reads the list as a set.

import { Info } from 'lucide-react'
import ApproverPickerBase from '../ui/ApproverPickerBase'
import RoleTag from './RoleTag'
import { useLeaveManagers } from '../../utils/useLeaveManagers'
import { LEAVE_COPY, MAX_LEAVE_APPROVERS } from '../../utils/leave'

/**
 * `value` / `onChange` carry the ordered id array posted as `approver_ids`.
 *
 * `excludeId` drops the requester from the roster — the endpoint refuses a
 * request naming its own author, so the choice is never offered.
 *
 * `rowErrors` maps a position to its message, so a server `approver_ids.N`
 * validation error lands on the row it is about instead of only in the banner.
 */
export default function LeaveApproverChainPicker({ value, onChange, excludeId, rowErrors }) {
  const { visible, loading, query, setQuery } = useLeaveManagers([excludeId])

  return (
    <ApproverPickerBase
      value={value} onChange={onChange}
      managers={visible} loading={loading}
      search={query} onSearchChange={setQuery}
      searchPlaceholder="ابحث عن مدير أو رئيس بالاسم أو البريد…"
      emptyText="لا يوجد مسؤولون مطابقون"
      noneSelectedText="لم يتم اختيار أي معتمد بعد — اختر معتمداً واحداً على الأقل"
      selectedLabel="سلسلة الاعتماد"
      ordered showSequence
      max={MAX_LEAVE_APPROVERS}
      badge={m => <RoleTag role={m.role} />}
      stepError={i => rowErrors?.[i]}
    >
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 8, padding: '9px 11px',
        borderRadius: 9, background: 'var(--c-accent-soft)', color: 'var(--c-text-2)',
        fontSize: 11.5, lineHeight: 1.6,
      }}>
        <Info size={14} style={{ flexShrink: 0, marginTop: 1, color: 'var(--c-accent)' }} />
        <span>
          {LEAVE_COPY.chainOrderHint}
          <br />
          {LEAVE_COPY.chainRejectionHint}
        </span>
      </div>
    </ApproverPickerBase>
  )
}
