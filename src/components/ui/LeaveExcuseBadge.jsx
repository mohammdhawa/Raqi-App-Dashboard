import { ShieldCheck } from 'lucide-react'

export default function LeaveExcuseBadge({ compact = false }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: compact ? '2px 8px' : '4px 10px', borderRadius: 999,
      fontSize: compact ? 10.5 : 11.5, fontWeight: 800, lineHeight: 1.5,
      color: '#8A5A12', background: '#FFF5D9', border: '1px solid #E7C66A66',
      whiteSpace: 'nowrap',
    }}>
      <ShieldCheck size={compact ? 11 : 12} />
      عذر إداري
    </span>
  )
}
