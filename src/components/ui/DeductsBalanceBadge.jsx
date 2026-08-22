import { Wallet, WalletMinimal } from 'lucide-react'
import { LEAVE_COPY } from '../../utils/leave'

/**
 * "تُخصم من الرصيد" / "لا تُخصم من الرصيد" — the balance policy a leave row was
 * filed under.
 *
 * `deducts` must come from the row's own `deducts_balance` snapshot, never from
 * the type's current flag: re-deciding a type applies to future requests only.
 * `null` (an older row with no snapshot) renders nothing rather than guessing.
 */
export default function DeductsBalanceBadge({ deducts, compact = false, short = false }) {
  if (deducts == null) return null
  const Icon = deducts ? Wallet : WalletMinimal
  const label = deducts
    ? (short ? LEAVE_COPY.deductsShort : LEAVE_COPY.deducts)
    : (short ? LEAVE_COPY.notDeductsShort : LEAVE_COPY.notDeducts)

  return (
    <span
      title={deducts ? LEAVE_COPY.deducts : LEAVE_COPY.excusedDaysHint}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: compact ? '2px 8px' : '4px 10px', borderRadius: 999,
        fontSize: compact ? 10.5 : 11.5, fontWeight: 800, lineHeight: 1.5,
        whiteSpace: 'nowrap',
        color: deducts ? 'var(--c-text-2)' : 'var(--c-approved)',
        background: deducts ? 'var(--c-surface-2)' : 'var(--c-approved-bg)',
        border: `1px solid ${deducts ? 'var(--c-border)' : 'var(--c-approved)22'}`,
      }}
    >
      <Icon size={compact ? 11 : 12} />
      {label}
    </span>
  )
}
