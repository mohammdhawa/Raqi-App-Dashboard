/**
 * Sunaa signature 06 — block progress.
 *
 * Progress is shown as stacked blocks, never a smooth bar, "as if laid course
 * by course". A block is filled once the value reaches it, except that any
 * non-zero value fills at least one, so a small share never reads as none.
 *
 * `value` and `max` are in the same unit; `blocks` is how many to draw.
 */
export default function BlockProgress({
  value = 0, max = 1, blocks = 10, color = 'var(--c-accent)',
  track = 'var(--c-concrete)', height = 6, label,
}) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0
  const filled = ratio > 0 ? Math.max(1, Math.round(ratio * blocks)) : 0
  return (
    <div
      role="progressbar" aria-label={label}
      aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(value, max)}
      style={{ display: 'flex', gap: 3, width: '100%' }}
    >
      {Array.from({ length: blocks }, (_, i) => (
        <span key={i} style={{ flex: 1, height, background: i < filled ? color : track }} />
      ))}
    </div>
  )
}
