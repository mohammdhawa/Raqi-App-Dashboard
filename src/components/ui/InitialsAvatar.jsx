/**
 * Round initials avatar.
 *
 * Lives here rather than beside the document surfaces because the approver
 * picker is now shared with the leave module; `components/documents/shared`
 * re-exports it so the existing document imports keep working.
 */
export default function InitialsAvatar({ name, size = 30, gradient }) {
  const initials = (name ?? '؟').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('')
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: gradient ?? 'linear-gradient(135deg, var(--c-primary), #1C3A5E)',
      color: '#fff', fontWeight: 800, fontSize: size * 0.38,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {initials}
    </div>
  )
}
