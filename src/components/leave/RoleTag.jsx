// The «مدير» / «الرئيس الأعلى» pill shown beside an approver, wherever the
// leave module lists people to pick from — the chain picker's roster and chips,
// and the single-select used by reassignment. The label itself is
// `leaveRoleLabel` in utils/leave, which is where non-component exports live so
// this file stays fast-refreshable.

import { leaveRoleLabel } from '../../utils/leave'

export default function RoleTag({ role }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 800, borderRadius: 999, padding: '2px 7px', flexShrink: 0,
      whiteSpace: 'nowrap',
      background: role === 'chief' ? 'var(--c-accent-tint)' : 'rgba(34,65,103,0.09)',
      color: role === 'chief' ? '#8A6A23' : 'var(--c-primary)',
    }}>
      {leaveRoleLabel(role)}
    </span>
  )
}
